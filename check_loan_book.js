import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read Env
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FREEZE_AFTER = 90;
const DAILY_RATE = 0.012;

const fromSupabaseLoan = (r) => ({
  id: r.id,
  customerId: r.customer_id,
  customer: r.customer_name,
  amount: Number(r.amount),
  balance: Number(r.balance),
  penalties: Number(r.penalties || 0),
  penaltyAccrued: r.penalty_accrued != null ? Number(r.penalty_accrued) : null,
  status: r.status,
  repaymentType: r.repayment_type,
  officer: r.officer,
  collectionsOfficer: r.collections_officer,
  risk: r.risk,
  disbursed: r.disbursed_at || r.disbursed,
  createdAt: r.created_at || null,
  mpesa: r.mpesa,
  phone: r.phone,
  daysOverdue: r.days_overdue || 0,
  settledAt: r.settled_at || null,
  updatedAt: r.updated_at || null,
  payments: [],
  interestDiscount: Number(r.interest_discount || 0),
});

const calculateLoanStatus = (loan, asOfDate, paid) => {
  const d = asOfDate || new Date();
  let od = Math.max(0, loan.daysOverdue || 0);

  const dbs = loan.disbursed || loan.disbursed_at || loan.disbursedAt;
  const isUndated = !dbs; 

  if (dbs && (loan.status === 'Active' || loan.status === 'Overdue' || !loan.status)) {
    const dueDate = new Date(dbs);
    dueDate.setDate(dueDate.getDate() + 30);
    
    const localDue = new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const localNow = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    
    const diffTime = new Date(localNow).getTime() - new Date(localDue).getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > od) od = diffDays;
  }
  const bal = loan.balance || 0;
  const amount = loan.amount || 0;
  const discount = Number(loan.interestDiscount || 0);
  const effectiveRate = 0.3 * (1 - discount / 100);
  const baseTotal = amount * (1 + effectiveRate); 

  const amountPaid = paid !== undefined ? Number(paid || 0) : baseTotal - bal;
  const baseBalance = baseTotal - amountPaid;

  let penalty;
  if (loan.penaltyAccrued != null && od > 0) {
    penalty = Math.max(0, Number(loan.penaltyAccrued));
  } else if (od > 0) {
    const cappedOd = Math.min(od, FREEZE_AFTER);
    const rawPenalty = Math.round(Math.max(0, amount) * DAILY_RATE * cappedOd);
    penalty = Math.max(0, rawPenalty - Number(loan.penaltyWaived || 0));
  } else {
    penalty = 0;
  }
  
  const totalPayable = baseTotal + penalty;
  const totalAmountDue = totalPayable - amountPaid;

  const disDate = dbs ? new Date(dbs) : null;
  const totalDays = disDate && !isNaN(disDate.getTime()) ? Math.floor((d.getTime() - disDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isFrozen = od > FREEZE_AFTER;
  const TERMINAL_NON_DISBURSED = ['Rejected', 'Declined', 'Cancelled', 'Application submitted', 'worker-pending'];
  const NON_DISBURSED = [...TERMINAL_NON_DISBURSED, 'Approved', 'Disbursing'];

  const isSettled = (!NON_DISBURSED.includes(loan.status) && totalAmountDue <= 0);

  const finalAmountDue = isSettled ? Math.min(0, totalAmountDue) : totalAmountDue;

  const isWrittenOff = !isSettled && !NON_DISBURSED.includes(loan.status) && (
    loan.status === 'Written off' ||
    (totalDays > 90 && od > 0) || 
    (isUndated && !NON_DISBURSED.includes(loan.status))
  );
  
  let status = loan.status || "Active";
  let badgeStatus = loan.status || "Active";

  if (isSettled) {
    status = "Settled";
    badgeStatus = "Settled";
  } else if (isWrittenOff) {
    status = "Written off";
    badgeStatus = "Written off";
  } else if (isFrozen) {
    status = `Frozen (${od}d)`;
    badgeStatus = "Frozen";
  } else if (od > 0) {
    status = `Overdue (${od}d)`;
    badgeStatus = "Overdue";
  }

  return {
    isSettled,
    isWrittenOff,
    totalAmountDue: finalAmountDue,
    status,
    badgeStatus,
    overdueDays: od,
    totalDays,
  };
};

async function check() {
  const { data: dbLoans, error: errLoans } = await supabase.from('loans').select('*');
  const { data: dbPayments, error: errPayments } = await supabase.from('payments').select('*');

  if (errLoans || errPayments) {
    console.error(errLoans, errPayments);
    return;
  }

  const loans = dbLoans.map(fromSupabaseLoan);
  
  const fullPaidMap = dbPayments.reduce((acc, p) => {
    if (p.loan_id) {
      acc[p.loan_id] = (acc[p.loan_id] || 0) + Number(p.amount || 0);
    }
    return acc;
  }, {});

  let book = 0;
  let activeLoans = [];

  loans.forEach(l => {
    const pTotal = fullPaidMap[l.id] || 0;
    const e = calculateLoanStatus(l, null, pTotal);

    if (['Rejected', 'Declined', 'Cancelled', 'Application submitted', 'worker-pending'].includes(e.badgeStatus)) return;
    if (e.badgeStatus === 'Approved') return;
    if (e.isSettled) return;

    if (e.badgeStatus === 'Written off') {
      // Not counted in book
    } else {
      book += e.totalAmountDue;
      activeLoans.push({
        id: l.id,
        customer: l.customer,
        amount: l.amount,
        outstanding: e.totalAmountDue,
        status: e.status,
        badgeStatus: e.badgeStatus,
        overdueDays: e.overdueDays
      });
    }
  });

  console.log('--- SYSTEM FACTS ---');
  console.log('Total Active/Overdue/Frozen Loans:', activeLoans.length);
  console.log('Calculated Loan Book Value (Exact): KES', book.toLocaleString('en-KE'));
  console.log('Raw Sum value:', book);
  console.log('\nTop Active Loans:');
  console.log(activeLoans.slice(0, 10));
}

check();
