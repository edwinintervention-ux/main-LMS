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

async function run() {
  // Fetch all loans
  const { data: loans, error: loansErr } = await supabase
    .from('loans')
    .select('*')
    .order('created_at', { ascending: true });
  if (loansErr) { console.error(loansErr); return; }

  // Fetch all payments
  const { data: payments, error: paymentsErr } = await supabase
    .from('payments')
    .select('*');
  if (paymentsErr) { console.error(paymentsErr); return; }

  // Fetch all customers
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, name, status, is_deleted, loan_officer');
  if (custErr) { console.error(custErr); return; }

  // Calculate payments by loan
  const paidByLoan = {};
  for (const p of payments) {
    paidByLoan[p.loan_id] = (paidByLoan[p.loan_id] || 0) + Number(p.amount || 0);
  }

  const now = new Date();
  const statusCounts = {};
  let loanBookTotal = 0;
  let activeBorrowers = new Set();
  
  const loanDetails = [];

  for (const loan of loans) {
    const status = loan.status || 'Unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (['Active', 'Overdue', 'Frozen'].includes(status)) {
      const amount = Number(loan.amount || 0);
      const balance = Number(loan.balance || 0);
      const discount = Number(loan.interestDiscount || 0);
      const effectiveRate = 0.3 * (1 - discount / 100);
      const baseTotal = amount * (1 + effectiveRate);
      const paid = paidByLoan[loan.id] || 0;

      // Days overdue
      let od = Math.max(0, loan.daysOverdue || 0);
      const dbs = loan.disbursed || loan.disbursed_at || loan.disbursedAt;
      if (dbs && (status === 'Active' || status === 'Overdue')) {
        const dueDate = new Date(dbs);
        dueDate.setDate(dueDate.getDate() + 30);
        const diffMs = now - dueDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > od) od = diffDays;
      }

      let penalty = 0;
      if (loan.penaltyAccrued != null && od > 0) {
        penalty = Math.max(0, Number(loan.penaltyAccrued));
      } else if (od > 0) {
        const cappedOd = Math.min(od, FREEZE_AFTER);
        const rawPenalty = Math.round(Math.max(0, amount) * DAILY_RATE * cappedOd);
        penalty = Math.max(0, rawPenalty - Number(loan.penaltyWaived || 0));
      }

      const totalPayable = baseTotal + penalty;
      const outstanding = Math.max(0, totalPayable - paid);

      loanBookTotal += outstanding;
      activeBorrowers.add(loan.customer_id);

      loanDetails.push({
        id: loan.id,
        customer_id: loan.customer_id,
        amount,
        status,
        outstanding: Math.round(outstanding),
        od,
      });
    }
  }

  // Customer breakdown
  const activeCustomers = customers.filter(c => !c.is_deleted && c.status !== 'deleted');
  const deletedCustomers = customers.filter(c => c.is_deleted || c.status === 'deleted');
  const newCustomers = customers.filter(c => c.status === 'New Customer' && !c.is_deleted);

  console.log('=== SYSTEM FACTS (Complete Database) ===\n');
  console.log(`Total customers in DB:      ${customers.length}`);
  console.log(`  Active (not deleted):     ${activeCustomers.length}`);
  console.log(`  Deleted:                  ${deletedCustomers.length}`);
  console.log(`  Status = 'New Customer':  ${newCustomers.length}`);
  console.log('');
  console.log(`Total loans in DB:          ${loans.length}`);
  console.log('  Loan status breakdown:');
  for (const [s, count] of Object.entries(statusCounts).sort()) {
    console.log(`    ${s}: ${count}`);
  }
  console.log('');
  console.log(`Active/Overdue/Frozen loans: ${loanDetails.length}`);
  console.log(`Active unique borrowers:     ${activeBorrowers.size}`);
  console.log(`LOAN BOOK (outstanding):     KES ${Math.round(loanBookTotal).toLocaleString()}`);
  console.log('');
  console.log(`Total payments recorded:    ${payments.length}`);
  console.log(`Total amount paid (all):    KES ${Math.round(payments.reduce((s,p)=>s+Number(p.amount||0),0)).toLocaleString()}`);
  console.log('');
  console.log('=== NEW CUSTOMER breakdown ===');
  for (const c of newCustomers) {
    // Check if they have any loan
    const theirLoans = loans.filter(l => l.customer_id === c.id);
    console.log(`  ${c.name} — loans: ${theirLoans.length} (${theirLoans.map(l=>l.status).join(', ') || 'none'}), officer: ${c.loan_officer || 'Unassigned'}`);
  }
}

run().catch(console.error);
