/**
 * fix_unallocated_payments.cjs
 *
 * Reads M-Pesa ORG utility Excel report, cross-references each row against
 * Supabase and:
 *   1. Matches Excel Receipt No. → payments.mpesa (Unallocated payments in DB)
 *   2. Matches Excel A/C No.    → customers.account_number (Active customers only)
 *   3. Finds that customer's Active/Overdue loan
 *   4. Updates the payment → Allocated, sets loan_id + customer_id
 *   5. Manually deducts from loan balance (trigger only fires on INSERT)
 *
 * SKIPS: already Allocated, no matching customer, no active loan, junk account numbers.
 */

const XLSX   = require('xlsx');
const https  = require('https');

const SUPABASE_URL     = 'https://wnmabkrkbcigxqdprzrb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubWFia3JrYmNpZ3hxZHByenJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1ODI2NywiZXhwIjoyMDkyNTM0MjY3fQ.L8TnRTzQ5HZRGdBPtSrtSIufC3SLtcqRE8n89roTLxI';
const EXCEL_PATH       = 'C:/Users/gkadi/Downloads/ORG_4166191_UtilityAccount_All_20260520052605.xls';

// ── Supabase REST helper ──────────────────────────────────────────────────────
function sbFetch(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname : 'wnmabkrkbcigxqdprzrb.supabase.co',
      path,
      method,
      headers  : {
        'apikey'        : SERVICE_ROLE_KEY,
        'Authorization' : `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type'  : 'application/json',
        'Prefer'        : 'return=representation',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Parse Excel: auto-detect real header row ──────────────────────────────────
function parseExcel(filePath) {
  const wb  = XLSX.readFile(filePath);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find the row with "Receipt No." as a cell value
  let headerRowIdx = 0;
  for (let i = 0; i < raw.length; i++) {
    const rowStr = raw[i].join(' ').toLowerCase();
    if (rowStr.includes('receipt no') || (rowStr.includes('receipt') && rowStr.includes('completion'))) {
      headerRowIdx = i;
      console.log(`    Real headers at Excel row ${i + 1}:`, raw[i].filter(Boolean).join(' | '));
      break;
    }
  }

  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range: headerRowIdx });
  const headers = allRows[0].map(h => String(h).trim());
  const data    = allRows.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
      return obj;
    })
    .filter(r => Object.values(r).some(v => String(v).trim() !== ''));

  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📂  Reading Excel file...');
  const rows = parseExcel(EXCEL_PATH);
  console.log(`    Found ${rows.length} data rows.\n`);

  // ── Fetch ALL unallocated payments (mpesa code is the key) ────────────────
  console.log('🔌  Fetching unallocated payments from Supabase...');
  const { body: unallocated } = await sbFetch(
    `/rest/v1/payments?status=eq.Unallocated&select=id,mpesa,amount,customer_id,loan_id&limit=2000`
  );
  if (!Array.isArray(unallocated)) {
    console.error('❌  Failed to fetch payments:', unallocated); process.exit(1);
  }
  console.log(`    ${unallocated.length} unallocated payment(s) in DB.\n`);

  // Build lookup: UPPERCASE mpesa code → payment row
  const paymentByMpesa = {};
  for (const p of unallocated) {
    if (p.mpesa) paymentByMpesa[p.mpesa.toUpperCase()] = p;
  }

  // ── Fetch all Active customers with their account_number ─────────────────
  console.log('🔌  Fetching active customers...');
  const { body: customers } = await sbFetch(
    `/rest/v1/customers?status=eq.Active&select=id,account_number&limit=10000`
  );
  if (!Array.isArray(customers)) {
    console.error('❌  Failed to fetch customers:', customers); process.exit(1);
  }
  console.log(`    ${customers.length} active customer(s).\n`);

  // Build lookup: account_number (trimmed string) → customer_id
  const customerByAccount = {};
  for (const c of customers) {
    if (c.account_number) {
      customerByAccount[String(c.account_number).trim()] = c.id;
    }
  }

  // ── Fetch all Active / Overdue loans ─────────────────────────────────────
  console.log('🔌  Fetching active/overdue loans...');
  const { body: loans } = await sbFetch(
    `/rest/v1/loans?status=in.(Active,Overdue)&select=id,customer_id,balance,status&limit=5000`
  );
  if (!Array.isArray(loans)) {
    console.error('❌  Failed to fetch loans:', loans); process.exit(1);
  }
  console.log(`    ${loans.length} active/overdue loan(s).\n`);

  // Build lookup: customer_id → loan (most recent active loan per customer)
  const loanByCustomer = {};
  for (const l of loans) {
    // Keep the first one found (API returns latest first by default)
    if (!loanByCustomer[l.customer_id]) {
      loanByCustomer[l.customer_id] = l;
    }
  }

  // ── Process Excel rows ────────────────────────────────────────────────────
  const toFix   = [];
  const skipped = [];

  for (const row of rows) {
    const receipt   = String(row['Receipt No.'] || '').trim().toUpperCase();
    const accountNo = String(row['A/C No.']     || '').trim();
    const amount    = parseFloat(row['Paid In']  || 0);
    const txStatus  = String(row['Transaction Status'] || '').trim();

    // Only process completed transactions with money paid in
    if (!receipt || amount <= 0 || txStatus !== 'Completed') {
      skipped.push({ receipt, accountNo, reason: `Not a completed paid-in transaction (status: ${txStatus || 'none'})` });
      continue;
    }

    // Check receipt exists as an unallocated payment
    const payment = paymentByMpesa[receipt];
    if (!payment) {
      skipped.push({ receipt, accountNo, reason: 'Already Allocated or not in payments table' });
      continue;
    }

    // Check account number maps to an active customer
    const customerId = customerByAccount[accountNo];
    if (!customerId) {
      skipped.push({ receipt, accountNo, reason: `A/C "${accountNo}" not found in any Active customer` });
      continue;
    }

    // Check that customer has an active/overdue loan
    const loan = loanByCustomer[customerId];
    if (!loan) {
      skipped.push({ receipt, accountNo, reason: `Customer ${customerId} has no Active/Overdue loan` });
      continue;
    }

    toFix.push({
      paymentId      : payment.id,
      mpesa          : receipt,
      customerId,
      accountNo,
      loanId         : loan.id,
      amount,
      currentBalance : loan.balance,
    });
  }

  // ── Print summary ─────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅  Payments to FIX  : ${toFix.length}`);
  console.log(`⏭   Payments SKIPPED : ${skipped.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (toFix.length === 0) {
    console.log('Nothing to fix.\n');
  } else {
    console.log('Payments that WILL be updated:\n');
    for (const p of toFix) {
      console.log(
        `  ${p.mpesa.padEnd(14)} | A/C: ${p.accountNo.padEnd(12)} | ` +
        `Customer: ${p.customerId.padEnd(10)} | Loan: ${p.loanId.padEnd(14)} | ` +
        `KES ${p.amount.toLocaleString().padStart(7)} | Balance: ${p.currentBalance.toLocaleString()}`
      );
    }
    console.log('');
  }

  // ── Apply fixes ───────────────────────────────────────────────────────────
  let successCount = 0;
  let errorCount   = 0;
  const errors     = [];

  for (const p of toFix) {
    // 1. Mark payment as Allocated and link to loan + customer
    const { status: ps, body: pb } = await sbFetch(
      `/rest/v1/payments?id=eq.${p.paymentId}`,
      'PATCH',
      {
        status       : 'Allocated',
        loan_id      : p.loanId,
        customer_id  : p.customerId,
        allocated_by : 'System-BulkFix',
        allocated_at : new Date().toISOString(),
      }
    );

    if (ps < 200 || ps >= 300) {
      console.error(`  ❌  Payment PATCH failed for ${p.mpesa}:`, pb);
      errors.push({ ...p, error: JSON.stringify(pb) });
      errorCount++;
      continue;
    }

    // 2. Manually deduct loan balance (trigger only fires on INSERT, not UPDATE)
    const newBalance = Math.max(p.currentBalance - p.amount, 0);
    const isSettled  = newBalance <= 0;
    const loanUpdate = isSettled
      ? { balance: 0, status: 'Settled', settled_at: new Date().toISOString() }
      : { balance: newBalance };

    const { status: ls, body: lb } = await sbFetch(
      `/rest/v1/loans?id=eq.${p.loanId}`,
      'PATCH',
      loanUpdate
    );

    if (ls < 200 || ls >= 300) {
      console.error(`  ❌  Loan PATCH failed for ${p.loanId}:`, lb);
      errors.push({ ...p, error: `Loan update failed: ${JSON.stringify(lb)}` });
      errorCount++;
      continue;
    }

    const tag = isSettled ? '🏁 SETTLED' : '✅ Updated';
    console.log(
      `  ${tag} | ${p.mpesa.padEnd(14)} | ${p.customerId.padEnd(10)} | ` +
      `Loan ${p.loanId} | Balance: ${p.currentBalance} → ${newBalance}`
    );

    // Update local cache so multiple payments on same loan stack correctly
    if (loanByCustomer[p.customerId]) {
      loanByCustomer[p.customerId].balance = newBalance;
      if (isSettled) loanByCustomer[p.customerId].status = 'Settled';
    }

    successCount++;
  }

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`🎉  Fixed successfully : ${successCount}`);
  console.log(`❌  Errors             : ${errorCount}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (errors.length) {
    console.log('Failed items:');
    errors.forEach(e => console.log(`  - ${e.mpesa} | ${e.error}`));
    console.log('');
  }

  // Skipped breakdown
  const byReason = {};
  for (const s of skipped) byReason[s.reason] = (byReason[s.reason] || 0) + 1;
  console.log('📋  Skipped breakdown:');
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`   ${String(count).padStart(3)}x — ${reason}`);
  }
  console.log('');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
