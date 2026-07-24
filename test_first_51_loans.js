import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) acc[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FREEZE_AFTER = 90;
const DAILY_RATE = 0.012;

const calculateLoanStatus = (loan, asOfDate, paid) => {
  const d = asOfDate || new Date();
  let od = Math.max(0, loan.daysOverdue || 0);

  const dbs = loan.disbursed || loan.disbursed_at || loan.disbursedAt;

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
  const TERMINAL_NON_DISBURSED = ['Rejected', 'Declined', 'Cancelled', 'Application submitted', 'worker-pending'];
  const NON_DISBURSED = [...TERMINAL_NON_DISBURSED, 'Approved', 'Disbursing'];

  const isSettled = (!NON_DISBURSED.includes(loan.status) && totalAmountDue <= 0);

  const finalAmountDue = isSettled ? Math.min(0, totalAmountDue) : totalAmountDue;

  const isWrittenOff = !isSettled && !NON_DISBURSED.includes(loan.status) && (
    loan.status === 'Written off' ||
    (totalDays > 90 && od > 0)
  );
  
  let status = loan.status || "Active";
  let badgeStatus = loan.status || "Active";

  if (isSettled) {
    status = "Settled";
    badgeStatus = "Settled";
  } else if (isWrittenOff) {
    status = "Written off";
    badgeStatus = "Written off";
  }

  return {
    isSettled,
    isWrittenOff,
    totalAmountDue: finalAmountDue,
    status,
    badgeStatus,
  };
};

async function run() {
  // Fetch ONLY the first 50 loans (0 to 50 = 51 items) ordered by created_at desc (like the frontend does in Phase 1)
  const { data: dbLoans, error: errLoans } = await supabase.from('loans').select('*').order('created_at', { ascending: false }).range(0, 50);
  const { data: dbPayments, error: errPayments } = await supabase.from('payments').select('*');

  if (errLoans) {
    console.error(errLoans);
    return;
  }

  const fullPaidMap = dbPayments.reduce((acc, p) => {
    if (p.loan_id) {
      acc[p.loan_id] = (acc[p.loan_id] || 0) + Number(p.amount || 0);
    }
    return acc;
  }, {});

  let activeLoans = [];
  let book = 0;

  dbLoans.forEach(l => {
    const mappedLoan = {
      id: l.id,
      daysOverdue: l.days_overdue,
      disbursed: l.disbursed_at || l.disbursed,
      status: l.status,
      balance: Number(l.balance),
      amount: Number(l.amount),
      interestDiscount: Number(l.interest_discount || 0),
      penaltyAccrued: l.penalty_accrued != null ? Number(l.penalty_accrued) : null,
    };
    
    const pTotal = fullPaidMap[l.id] || 0;
    const e = calculateLoanStatus(mappedLoan, null, pTotal);

    if (['Rejected', 'Declined', 'Cancelled', 'Application submitted', 'worker-pending'].includes(e.badgeStatus)) return;
    if (e.badgeStatus === 'Approved') return;
    if (e.isSettled) return;
    if (e.badgeStatus === 'Written off') return;

    book += e.totalAmountDue;
    activeLoans.push({
      id: l.id,
      customer: l.customer_name,
      amount: l.amount,
      outstanding: e.totalAmountDue,
    });
  });

  console.log('--- Phase 1 (First 50 loans) Stats ---');
  console.log('Number of Active Loans in first 51 records:', activeLoans.length);
  console.log('Loan Book Value (Exact): KES', book.toLocaleString('en-KE'));
  console.log('Raw Sum:', book);
  console.log('Active Borrowers count:', new Set(activeLoans.map(l => l.customer)).size);
}
run();
