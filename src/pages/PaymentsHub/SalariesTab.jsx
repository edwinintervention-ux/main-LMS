import React, { useState, useMemo, useEffect } from 'react';
import { calculateStatutoryDeductions } from '@/utils/taxCalculator';
import { Landmark, Download, RefreshCw, Send, CheckCircle, Clock, TrendingUp, Users, DollarSign, Wallet, FileText, ArrowRight, Printer, AlertCircle, Zap, ShieldCheck, Activity } from 'lucide-react';
import { T, DT, Btn, Badge, fmt, ts, now, KPI, Card, CH, fmtM, Dialog, FI, generatePayslipHTML, dlBlob, INTERVENTION_LOGO_BASE64, INTERVENTION_STAMP_BASE64, calculateLoanStatus } from '@/lms-common';

const SalariesTab = ({ workers = [], salaryPayments = [], setSalaryPayments, customers = [], loans = [], leads = [], addAudit, showToast, onNav, workerDeductions = [], setWorkerDeductions, workerAdditions = [], setWorkerAdditions, payments = [], theme }) => {
  const [view, setView] = useState('payroll'); // Default to Analysis for better UX
  const [loading, setLoading] = useState(false);
  const [payoutModal, setPayoutModal] = useState(null); 
  const [deductionModal, setDeductionModal] = useState(null);
  const [additionModal, setAdditionModal] = useState(null);
  const [helbModal, setHelbModal] = useState(null); // worker object

  const stats = useMemo(() => {
    const totalPaid = salaryPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const monthPaid = salaryPayments
      .filter(p => p.month === now().slice(0, 7))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const pendingCount = salaryPayments.filter(p => p.status === 'Pending').length;
    
    return { totalPaid, monthPaid, pendingCount };
  }, [salaryPayments]);

  const [directCounts, setDirectCounts] = useState({});

  // DIRECT RECONCILIATION: If local state is failing, fetch directly from source
  React.useEffect(() => {
    const runDirectSync = async () => {
      try {
        const { supabase } = await import('@/config/supabaseClient');
        const counts = {};
        const currentMonth = now().slice(0, 7); // e.g. "2024-04"
        const monthStart = `${currentMonth}-01`;
        
        for (const w of workers) {
          // Query 1: Count by Name (Onboarded this month, with a disbursed loan)
          // Inner join on loans ensures we ONLY count customers who received a loan disbursement.
          // This prevents deleted/non-disbursed customers from inflating commission counts.
          const { count: countName } = await supabase
            .from('customers')
            .select('id, loans!inner(status)', { count: 'exact', head: true })
            .eq('officer', w.name)
            .gte('joined', monthStart)
            .not('status', 'eq', 'Rejected')
            .in('loans.status', ['Active', 'Closed', 'Legal', 'Defaulted']);

          // Query 2: Count by Assigned ID (Onboarded this month, with a disbursed loan)
          // Only attempt query if ID is a valid UUID to prevent 400 Bad Request errors
          let countId = 0;
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (w.authId && uuidRegex.test(w.authId)) {
            const { count } = await supabase
              .from('customers')
              .select('id, loans!inner(status)', { count: 'exact', head: true })
              .eq('assigned_officer', w.authId)
              .gte('joined', monthStart)
              .not('status', 'eq', 'Rejected')
              .in('loans.status', ['Active', 'Closed', 'Legal', 'Defaulted']);
            countId = count || 0;
          }

          counts[w.id] = Math.max(countName || 0, countId || 0);
        }
        setDirectCounts(counts);

        const { data: dData } = await supabase.from('worker_deductions').select('*').order('created_at', { ascending: false });
        if (setWorkerDeductions) setWorkerDeductions(dData || []);

        const { data: aData } = await supabase.from('worker_additions').select('*').order('created_at', { ascending: false });
        if (setWorkerAdditions) setWorkerAdditions(aData || []);
      } catch (e) {
        console.error("[DirectSync] Failed:", e);
      }
    };
    runDirectSync();
  }, [workers]);

  const payrollData = useMemo(() => {
    return workers.map(w => {
      const wIdStr = String(w.id || '').trim().toLowerCase();
      const wNmStr = String(w.name || '').trim().toLowerCase();
      const currentMonth = now().slice(0, 7);

      let estimatedEarned = 0;
      let progress = 0;
      let activeCount = 0;
      let label = "";

      if (w.role === 'Collections Officer') {
        // ── Collections Officer Logic ──
        // Based on % of collections in the current month
        const myLoans = loans.filter(l => (l.collectionsOfficer || l.collections_officer || '').toLowerCase() === wNmStr);
        
        // Total collected by this officer this month
        const collected = payments.filter(p => 
          p.status === 'Allocated' && 
          p.date?.startsWith(currentMonth) &&
          myLoans.some(l => l.id === p.loanId)
        ).reduce((s, p) => s + p.amount, 0);

        // Total "Target" (What should have been collected)
        // We define target as (Collected + Remaining Overdue today)
        const remainingOverdue = myLoans.reduce((total, l) => {
          const lPays = payments.filter(p => p.loanId === l.id && p.status === 'Allocated');
          const paid = lPays.reduce((s, p) => s + p.amount, 0);
          const e = calculateLoanStatus(l, null, paid);
          return total + (e.totalAmountDue > 0 ? e.totalAmountDue : 0);
        }, 0);

        const totalTarget = collected + remainingOverdue;
        const collRate = totalTarget > 0 ? (collected / totalTarget) * 100 : 0;
        progress = collRate;
        label = "COLLECTION RATE";

        // Tiers: 90% -> 10k, 94% -> 15k, 100% -> 20k
        if (collRate >= 100) estimatedEarned = 20000;
        else if (collRate >= 94) estimatedEarned = 15000;
        else if (collRate >= 90) estimatedEarned = 10000;
        else {
          // Linear scaling below 90% to avoid 0 pay? 
          // User said "supposed to be paid 10k for 90%", implying it starts there.
          // We'll give fractional if requested, but for now strict tiers.
          estimatedEarned = (collRate / 90) * 10000; 
        }
        activeCount = myLoans.length;
      } else {
        // ── Loan Officer / Default Logic ──
        let localCusts = (customers || []).filter(c => {
          const cAssigned = String(c.assigned_officer || '').trim().toLowerCase();
          const cOfficer  = String(c.officer || '').trim().toLowerCase();
          const isAssigned = (wIdStr && cAssigned === wIdStr) || (wNmStr && cOfficer === wNmStr);
          if (!isAssigned) return false;

          // Only count customers onboarded in the current month
          const cMonth = (c.joined || c.createdAt || '').slice(0, 7);
          if (cMonth !== currentMonth) return false;

          // Ensure they have at least one loan that has been disbursed
          const custLoans = (loans || []).filter(l => l.customerId === c.id);
          return custLoans.some(l => ['Active', 'Closed', 'Legal', 'Defaulted'].includes(l.status));
        });

        activeCount = Math.max(localCusts.length, directCounts[w.id] || 0);
        const target = Number(w.onboardingTarget) || 60;
        const base = Number(w.baseSalary) || 20000;
        
        progress = target > 0 ? (activeCount / target) * 100 : 0;
        estimatedEarned = Math.round(activeCount * 333.33);
        label = "DISBURSED GROWTH";
      }
      
      // Count both Success AND Pending payments to block double-execution while
      // waiting for the M-Pesa async callback to confirm the transaction.
      const paidThisMonth = salaryPayments
        .filter(p => String(p.worker_id) === String(w.id) && p.month === currentMonth && ['Success', 'Pending'].includes(p.status))
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);

      const monthDeductions = (workerDeductions || [])
        .filter(d => String(d.worker_id) === String(w.id) && d.month === currentMonth)
        .reduce((s, d) => s + (Number(d.amount) || 0), 0);

      const monthAdditions = (workerAdditions || [])
        .filter(a => String(a.worker_id) === String(w.id) && a.month === currentMonth)
        .reduce((s, a) => s + (Number(a.amount) || 0), 0);

      const grossEarnings = estimatedEarned + monthAdditions;
      const statutory = calculateStatutoryDeductions(grossEarnings);
      const helbAmount = Number(w.helbAmount || 0);
      const netDue = Math.max(0, Math.round(grossEarnings) - statutory.totalStatutory - helbAmount - (paidThisMonth + monthDeductions));

      return { ...w, activeCount, estimatedEarned, grossEarnings, statutory, helbAmount, paidThisMonth, monthDeductions, monthAdditions, netDue, progress, label };
    });
  }, [workers, customers, loans, payments, salaryPayments, directCounts, workerDeductions, workerAdditions]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/config/supabaseClient');
      const { data, error } = await supabase
        .from('salary_payments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (setSalaryPayments) setSalaryPayments(data || []);
      showToast('Global Ledger synchronized');
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleExecutePayout = async (worker) => {
    const payoutPhone = worker.mpesaNumber || worker.phone;
    if (!payoutPhone) {
      showToast('Cannot disburse — worker has no phone or M-Pesa number on profile.', 'danger');
      return;
    }
    setLoading(true);
    try {
      const { initiateWorkerPayout } = await import('@/utils/mpesa');
      await initiateWorkerPayout({
        worker_id: worker.id,
        amount: worker.netDue,
        phone: payoutPhone
      });

      showToast('B2C Disbursement Initiated — funds en route via M-Pesa', 'success');
      setPayoutModal(null);
      handleRefresh();
      addAudit('Salary Payout', worker.name, `KES ${worker.netDue} B2C via Edge Function to ${payoutPhone}`);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordDeduction = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = Number(fd.get('amount'));
    const reason = fd.get('reason');
    if (!amount || !reason) return;
    setLoading(true);
    try {
      const { supabase } = await import('@/config/supabaseClient');
      const { data, error } = await supabase.from('worker_deductions').insert([{
        worker_id: deductionModal.id, amount, reason, month: now().slice(0, 7)
      }]).select().single();
      if (error) throw error;
      setWorkerDeductions(prev => [data, ...prev]);
      showToast('Deduction applied to payroll');
      setDeductionModal(null);
    } catch (err) { showToast(err.message, 'danger'); } finally { setLoading(false); }
  };

  const handleRecordAddition = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = Number(fd.get('amount'));
    const reason = fd.get('reason');
    if (!amount || !reason) return;
    setLoading(true);
    try {
      const { supabase } = await import('@/config/supabaseClient');
      const { data, error } = await supabase.from('worker_additions').insert([{
        worker_id: additionModal.id, amount, reason, month: now().slice(0, 7)
      }]).select().single();
      if (error) throw error;
      setWorkerAdditions(prev => [data, ...prev]);
      showToast('Addition applied to payroll');
      setAdditionModal(null);
    } catch (err) { showToast(err.message, 'danger'); } finally { setLoading(false); }
  };

  const handleSetHelb = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const raw = fd.get('helb_amount');
    const amount = raw === '' ? null : Number(raw);
    setLoading(true);
    try {
      const { supabase } = await import('@/config/supabaseClient');
      const { error } = await supabase.from('workers').update({ helb_amount: amount }).eq('id', helbModal.id);
      if (error) throw error;
      // Update local state so UI refreshes immediately
      if (typeof helbModal.setWorkers === 'function') {
        helbModal.setWorkers(ws => ws.map(w => w.id === helbModal.id ? { ...w, helbAmount: amount } : w));
      }
      showToast(amount ? `HELB set to KES ${amount.toLocaleString()} / month` : 'HELB deduction removed');
      setHelbModal(null);
    } catch (err) { showToast(err.message, 'danger'); } finally { setLoading(false); }
  };

  const handlePrintPayslip = (worker, payment) => {
    const wDeds = (workerDeductions || []).filter(d => String(d.worker_id) === String(worker.id) && d.month === payment.month);
    const wAdds = (workerAdditions || []).filter(a => String(a.worker_id) === String(worker.id) && a.month === payment.month);
    const html = generateItemizedPayslip(worker, payment, payment.month, wDeds, wAdds);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const generateItemizedPayslip = (worker, payment, month, deductions = [], additions = []) => {
    const today = now();
    const fmtKey = (v) => "KES " + Number(v || 0).toLocaleString("en-KE");
    
    // Step 1: figure out custom deductions/additions totals first
    const customDeds = deductions.reduce((s,d)=>s+Number(d.amount),0);
    const customAdds = additions.reduce((s,a)=>s+Number(a.amount),0);
    const helbAmt = Number(worker.helbAmount || 0);

    // Step 2: Determine baseGross.
    // Priority: use worker.grossEarnings from current payrollData ONLY if this payment is for
    // the current month (avoids showing July figures on a June payslip).
    // Otherwise, derive gross backwards from what we KNOW is correct: the actual net payment.
    // Formula: Net = Gross - statutory - helb - customDeds  →  Gross = Net + statutory + helb + customDeds
    // We use a two-pass approach because PAYE depends on gross. Since PAYE = 0 for most low earners
    // we run one pass with a gross estimate, recalculate statutory, then finalize.
    const paymentMonth = payment.month || (payment.created_at || '').slice(0, 7);
    const currentMonth = now().slice(0, 7);
    const isCurrentMonth = paymentMonth === currentMonth;

    let baseGross;
    if (isCurrentMonth && worker.grossEarnings) {
      // For current-month payslips, use the live computed gross (accurate)
      baseGross = worker.grossEarnings;
    } else {
      // For historical payslips: derive gross backwards iteratively so math always balances perfectly
      const netPaid = Number(payment.amount || payment.netDue || 0);
      const targetNetBeforeStatutory = netPaid + helbAmt + customDeds;
      
      // Iterative solver: find the exact Gross where (Gross - Statutory) = targetNet
      // We start with an algebraic guess (Gross = Net / 0.8975) and refine it
      let guessGross = Math.round(targetNetBeforeStatutory / 0.8975);
      for (let i = 0; i < 10; i++) {
        const stat = calculateStatutoryDeductions(guessGross);
        const calculatedNet = guessGross - stat.totalStatutory;
        const diff = targetNetBeforeStatutory - calculatedNet;
        if (Math.abs(diff) <= 1) break; // Close enough (rounding)
        guessGross += diff; // Adjust guess by the error margin
      }
      baseGross = guessGross;
    }

    const statutory = calculateStatutoryDeductions(baseGross);

    // Base Earnings = gross BEFORE additions (always non-negative)
    const baseEarnings = Math.max(0, baseGross - customAdds);

    const totalDeductions = statutory.totalStatutory + helbAmt + customDeds;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          @page { margin: 5mm; }
          @media print {
            body { padding: 0 !important; font-size: 10px !important; }
            .payslip-container { padding: 0 !important; }
            .title-banner { padding: 10px !important; margin-bottom: 15px !important; }
            .info-table { margin-bottom: 10px !important; }
            .info-table td { padding: 4px 10px !important; font-size: 10px !important; }
            .table { margin-bottom: 10px !important; }
            .table th, .table td { padding: 4px 10px !important; font-size: 10px !important; }
            .section-head td { padding: 8px 10px 4px !important; font-size: 10px !important; }
            .net-box { padding: 8px 20px !important; margin-bottom: 15px !important; }
            .stamp-container { top: -85px !important; right: 20px !important; transform: scale(0.7); transform-origin: top right; }
            .header { margin-bottom: 10px !important; }
            .top-line { margin-bottom: 10px !important; }
            .footer-box { padding-top: 10px !important; padding-bottom: 0px !important; }
          }
          body { 
            font-family: 'Inter', sans-serif; 
            padding: 10mm; 
            color: #1e293b; 
            background: #fff; 
            line-height: 1.6;
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .payslip-container {
            max-width: 800px;
            margin: 0 auto;
            background: #fff;
            padding: 30px;
            page-break-inside: avoid;
          }
          
          .top-line {
            height: 4px;
            background-color: #F59E0B;
            width: 100%;
            margin-bottom: 30px;
          }
          
          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            margin-bottom: 25px; 
          }
          
          .company-details {
             display: flex;
             flex-direction: column;
             gap: 4px;
          }
          .company-name {
            font-size: 26px;
            font-weight: 800;
            color: #1a365d;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin: 0;
            line-height: 1;
          }
          .slogan {
            font-size: 13px;
            font-style: italic;
            color: #F59E0B;
            margin-bottom: 8px;
            font-weight: 600;
          }
          .company-contact {
            font-size: 11px;
            color: #475569;
            line-height: 1.4;
          }
          
          .logo-area { text-align: right; }
          
          .double-line {
            border-top: 3px solid #1a365d;
            border-bottom: 1px solid #F59E0B;
            height: 2px;
            margin: 20px 0;
          }
          
          .title-banner {
            background-color: #1a365d;
            color: #fff;
            text-align: center;
            padding: 16px;
            border-radius: 4px;
            margin-bottom: 30px;
          }
          .title-text {
            font-size: 20px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
          }
          .title-sub { font-size: 13px; color: #cbd5e1; }
          
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          .info-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
          }
          .info-table tr:first-child td { border-top: 1px solid #e2e8f0; }
          .info-table td.label {
            font-weight: 700;
            color: #475569;
            width: 140px;
            background: #f8fafc;
          }
          
          .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .table th { 
            text-align: left; 
            padding: 12px 16px; 
            font-size: 11px; 
            text-transform: uppercase; 
            color: #1a365d;
            font-weight: 800;
            border-bottom: 2px solid #1a365d;
          }
          .table th:last-child { text-align: right; }
          .table td { 
            padding: 12px 16px; 
            font-size: 13px; 
            border-bottom: 1px solid #f1f5f9; 
          }
          .table td.amt { text-align: right; font-weight: 600; }
          
          .section-head td {
            font-size: 11px;
            text-transform: uppercase;
            color: #1a365d;
            font-weight: 800;
            padding: 24px 16px 8px;
            border-bottom: 1px solid #e2e8f0 !important;
            background: #f8fafc;
          }
          
          .positive { color: #1a365d; }
          .negative { color: #ef4444; }
          
          .net-box {
            background-color: #1a365d;
            color: #fff;
            padding: 20px 30px;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
            page-break-inside: avoid;
          }
          .net-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
          .net-val { font-size: 26px; font-weight: 800; color: #F59E0B; }
          
          .footer-box {
            font-size: 12px; 
            text-align: center; 
            position: relative;
            color: #475569;
            padding-top: 20px;
            border-top: 1px dashed #cbd5e1;
            page-break-inside: avoid;
            padding-bottom: 20px;
          }
          .stamp-container {
            position: absolute; 
            right: 20px; 
            top: -100px; 
            width: 160px; 
            height: auto; 
            transform: rotate(-10deg); 
            pointer-events: none; 
            opacity: 0.85;
          }
          .stamp-date {
            position: absolute; 
            top: 53%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            color: #DC2626; 
            font-weight: 900; 
            font-size: 8pt; 
            letter-spacing: 0px; 
            text-transform: uppercase; 
            white-space: nowrap;
          }
        </style>
      </head>
      <body>
        <div class="payslip-container">
          <div class="top-line"></div>
          
          <div class="header">
            <div class="company-details">
              <div class="company-name">INTERVENTION CAPITAL LTD</div>
              <div class="slogan">You deserve nothing less</div>
              <div class="company-contact">
                P.O. Box 253-00241, Kitengela<br/>
                info@interventioncapital.co.ke
              </div>
            </div>
            <div class="logo-area">
              <img src="${INTERVENTION_LOGO_BASE64}" alt="Logo" style="height: 60px; width: 108px; display: block; margin-left: auto;" />
            </div>
          </div>
          
          <div class="double-line"></div>
          
          <div class="title-banner">
            <div class="title-text">OFFICIAL PAYSLIP</div>
            <div class="title-sub">${month}</div>
          </div>
          
          <table class="info-table">
            <tr>
              <td class="label">EMPLOYEE:</td>
              <td><strong>${worker.name}</strong>, Role: ${worker.role || 'Staff'}, Phone: ${worker.phone}</td>
            </tr>
            <tr>
              <td class="label">STAFF NUMBER:</td>
              <td><strong>${worker.staffNo || worker.idNo || '—'}</strong></td>
            </tr>
            <tr>
              <td class="label">REFERENCE:</td>
              <td><strong>${payment.mpesa_receipt || payment.id || 'PREVIEW'}</strong></td>
            </tr>
            <tr>
              <td class="label">DATE ISSUED:</td>
              <td>${today.split('T')[0]}</td>
            </tr>
          </table>
          
          <table class="table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight: 700; color: #1a365d;">Base Earnings</td>
                <td class="amt positive">${fmtKey(baseEarnings)}</td>
              </tr>
              
              ${additions.length > 0 ? `<tr class="section-head"><td colspan="2">Allowances / Additions</td></tr>` : ''}
              ${additions.map(a => `
              <tr>
                <td style="color: #1a365d;">${a.reason}</td>
                <td class="amt positive">+ ${fmtKey(a.amount)}</td>
              </tr>`).join('')}

              <tr>
                <td style="font-weight: 800; color: #1a365d; border-top: 2px solid #e2e8f0;">Total Gross Earnings</td>
                <td class="amt positive" style="border-top: 2px solid #e2e8f0; font-weight: 800;">${fmtKey(baseGross)}</td>
              </tr>
              
              <tr class="section-head"><td colspan="2">Statutory Deductions</td></tr>
              <tr>
                <td style="color: #475569;">PAYE (Tax)</td>
                <td class="amt negative">- ${fmtKey(statutory.paye)}</td>
              </tr>
              <tr>
                <td style="color: #475569;">NSSF (Tier 1 & 2)</td>
                <td class="amt negative">- ${fmtKey(statutory.nssf)}</td>
              </tr>
              <tr>
                <td style="color: #475569;">SHIF (Health)</td>
                <td class="amt negative">- ${fmtKey(statutory.shif)}</td>
              </tr>
              <tr>
                <td style="color: #475569;">Housing Levy (AHL)</td>
                <td class="amt negative">- ${fmtKey(statutory.ahl)}</td>
              </tr>
              ${worker.helbAmount ? `
              <tr>
                <td style="color: #475569;">HELB Loan Repayment</td>
                <td class="amt negative">- ${fmtKey(worker.helbAmount)}</td>
              </tr>` : ''}
              
              <tr class="section-head"><td colspan="2">Employer Contributions (Company Paid)</td></tr>
              <tr>
                <td style="color: #475569;">NSSF Match (Tier 1 & 2)</td>
                <td class="amt positive">+ ${fmtKey(statutory.nssf)}</td>
              </tr>
              <tr>
                <td style="color: #475569;">Housing Levy Match (AHL)</td>
                <td class="amt positive">+ ${fmtKey(statutory.ahl)}</td>
              </tr>
              <tr>
                <td style="color: #475569;">NITA / DIT</td>
                <td class="amt positive">+ KES 50</td>
              </tr>
              
              ${deductions.length > 0 ? `<tr class="section-head"><td colspan="2">Other Deductions</td></tr>` : ''}
              ${deductions.map(d => `
              <tr>
                <td style="color: #ef4444;">${d.reason}</td>
                <td class="amt negative">- ${fmtKey(d.amount)}</td>
              </tr>`).join('')}

              <tr>
                <td style="font-weight: 800; color: #1a365d; border-top: 2px solid #e2e8f0;">Total Deductions</td>
                <td class="amt negative" style="border-top: 2px solid #e2e8f0; font-weight: 800;">- ${fmtKey(totalDeductions)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="net-box" style="position: relative;">
            <div>
              <div class="net-label">Net Payable Disbursement</div>
            </div>
            <div class="net-val">${fmtKey(payment.amount || payment.netDue)}</div>
            
            <div class="stamp-container">
              <img src="${INTERVENTION_STAMP_BASE64}" alt="Stamp" style="width: 100%; height: auto; display: block;" />
              <div class="stamp-date">${today.split('T')[0].toUpperCase()}</div>
            </div>
          </div>
          
          <div class="footer-box">
            <strong style="color: #1a365d;">${payment.mpesa_receipt ? 'Funds disbursed via M-Pesa. Internal Ref: ' + payment.id : 'This is an estimated payslip preview before final month-end disbursement.'}</strong>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  return (
    <div className="fu" style={{ display: 'flex', flexDirection: 'column', gap: 32, animation: 'fadeIn 0.5s ease-out' }}>
      {/* ── PREMIUM HEADER AREA ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
             <div style={{ width: 32, height: 2, background: T.accent, borderRadius: 2 }} />
             <div style={{ fontSize: 13, fontWeight: 800, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Payroll Operations</div>
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 950, color: T.txt, margin: 0, letterSpacing: '-0.04em', lineHeight: 1 }}>Salary Ledger</h1>
          <p style={{ color: T.muted, marginTop: 12, fontSize: 15, maxWidth: 500, lineHeight: 1.6 }}>
            Unified disbursement gateway for commission-only payroll. All transactions are logged in a high-fidelity audit trail.
          </p>
        </div>

        <div style={{ background: T.surface, padding: '4px', borderRadius: 16, border: `1px solid ${T.border}`, display: 'flex', gap: 4 }}>
           <button onClick={() => setView('payroll')} style={{ 
             padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800,
             background: view === 'payroll' ? T.accent : 'transparent',
             color: view === 'payroll' ? '#060A10' : T.dim, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
           }}>Payroll Analysis</button>
           <button onClick={() => setView('ledger')} style={{ 
             padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800,
             background: view === 'ledger' ? T.accent : 'transparent',
             color: view === 'ledger' ? '#060A10' : T.dim, transition: 'all 0.3s'
           }}>Transaction Vault</button>
        </div>
      </div>

      {/* ── KPI CLOUD (GLASSMorphism) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
         <div className="glass-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, background: T.accent, filter: 'blur(70px)', opacity: 0.15 }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
               <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent }} /> Total Settled Payroll
            </div>
            <div style={{ fontSize: 42, fontWeight: 950, color: T.txt, letterSpacing: '-0.03em' }}>{fmtM(stats.totalPaid)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 13, color: T.ok, fontWeight: 800 }}>
               <TrendingUp size={14} /> <span>Active liquidity cycle</span>
            </div>
         </div>

         <div className="glass-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, background: T.ok, filter: 'blur(70px)', opacity: 0.12 }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
               <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.ok }} /> Month Disbursements
            </div>
            <div style={{ fontSize: 42, fontWeight: 950, color: T.txt, letterSpacing: '-0.03em' }}>{fmtM(stats.monthPaid)}</div>
            <div style={{ fontSize: 13, color: T.dim, marginTop: 16, fontWeight: 700 }}>Period: <span style={{ color: T.txt }}>{now().slice(0, 7)}</span></div>
         </div>

         <div className="glass-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, background: T.warn, filter: 'blur(70px)', opacity: 0.15 }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
               <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.warn }} /> Pending Reconciliation
            </div>
            <div style={{ fontSize: 42, fontWeight: 950, color: T.txt, letterSpacing: '-0.03em' }}>{stats.pendingCount} <span style={{ fontSize: 16, color: T.dim, fontWeight: 600 }}>Staff</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 13, color: T.warn, fontWeight: 800 }}>
               <ShieldCheck size={14} /> <span>Awaiting B2C execution</span>
            </div>
         </div>
      </div>

      {view === 'ledger' ? (
        <Card style={{ borderRadius: 24, padding: 0, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
          <CH title="Historical Disbursement Ledger" icon={Activity} sub="Complete record of all direct Salary transfers initiated via M-Pesa B2C" />
          <DT 
            cols={[
              { k: 'worker_id', l: 'Recipient', r: (v) => {
                const w = (workers || []).find(x => x.id === v);
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: T.aLo, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950, fontSize: 13 }}>{w?.name?.charAt(0) || 'W'}</div>
                    <div>
                      <div style={{ fontWeight: 950, color: T.txt, fontSize: 14 }}>{w?.name || v}</div>
                      <div style={{ fontSize: 11, color: T.dim, fontWeight: 500 }}>{w?.role || 'Staff Member'}</div>
                    </div>
                  </div>
                );
              }},
              { k: 'amount', l: 'Amount', r: v => <span style={{ fontWeight: 950, color: T.accent, fontSize: 15 }}>{fmt(v)}</span> },
              { k: 'status', l: 'Status', r: v => (
                <Badge color={v === 'Success' ? T.ok : v === 'Pending' ? T.warn : T.danger}>
                   {v?.toUpperCase()}
                </Badge>
              )},
              { k: 'recipient_phone', l: 'M-Pesa Destination', r: v => <span style={{ fontWeight: 700, color: T.dim }}>{v}</span> },
              { k: 'mpesa_receipt', l: 'TXN Reference', r: v => <span style={{ fontFamily: T.mono, fontSize: 11, color: T.dim, background: 'rgba(0,212,170,0.05)', padding: '2px 6px', borderRadius: 4 }}>{v || 'PENDING_GW'}</span> },
              { k: 'created_at', l: 'Timestamp', r: v => ts(v) },
              { k: 'id', l: 'Actions', r: (v, row) => (
                <div style={{ display: 'flex', gap: 6 }}>
                   <Btn sm v="secondary" onClick={() => handlePrintPayslip((payrollData || []).find(x => x.id === row.worker_id) || (workers || []).find(x => x.id === row.worker_id), row)} icon={Printer}>Slip</Btn>
                </div>
              )}
            ]}
            rows={salaryPayments}
            emptyMsg="The disbursement ledger is empty. No payroll transactions found."
            maxHeightVh={0.65}
          />
        </Card>
      ) : (
        <Card style={{ borderRadius: 24, padding: 0, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
          <CH title="Interactive Payroll Analysis" icon={Wallet} sub="Real-time commission tracking and automated M-Pesa B2C orchestration" />
          <DT 
            cols={[
              { k: 'name', l: 'Staff Member', r: (v, row) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
                  <div style={{ 
                    width: 44, height: 44, borderRadius: 14, 
                    background: row.netDue > 0 ? `${T.warn}15` : `${T.ok}15`, 
                    color: row.netDue > 0 ? T.warn : T.ok,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950, fontSize: 16,
                    border: `1px solid ${row.netDue > 0 ? T.warn : T.ok}33`
                  }}>{v.charAt(0)}</div>
                  <div>
                    <div style={{ fontWeight: 950, color: T.txt, fontSize: 15 }}>{v}</div>
                    <div style={{ fontSize: 11, color: T.dim, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{row.role}</div>
                  </div>
                </div>
              )},
              { k: 'estimatedEarned', l: 'Commis.', r: v => <span style={{ fontWeight: 850, color: T.txt, fontSize: 14 }}>{fmt(v)}</span> },
              { k: 'monthAdditions', l: 'Adds.', r: (v, row) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 850, color: T.ok, fontSize: 14 }}>+{fmt(v)}</span>
                  <button onClick={() => setAdditionModal(row)} style={{ padding: '4px 8px', borderRadius: 6, background: `${T.ok}15`, color: T.ok, border: 'none', fontSize: 9, fontWeight: 900, cursor: 'pointer' }}>ADJUST</button>
                </div>
              )},
              { k: 'monthDeductions', l: 'Deducts.', r: (v, row) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 850, color: T.danger, fontSize: 14 }}>-{fmt(v)}</span>
                  <button onClick={() => setDeductionModal(row)} style={{ padding: '4px 8px', borderRadius: 6, background: `${T.danger}15`, color: T.danger, border: 'none', fontSize: 9, fontWeight: 900, cursor: 'pointer' }}>ADJUST</button>
                </div>
              )},
              { k: 'helbAmount', l: 'HELB', r: (v, row) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {v > 0
                    ? <span style={{ fontWeight: 850, color: T.dim, fontSize: 13 }}>-{fmt(v)}</span>
                    : <span style={{ fontWeight: 700, color: T.muted, fontSize: 11 }}>None</span>
                  }
                  <button
                    onClick={() => setHelbModal(row)}
                    style={{ padding: '3px 7px', borderRadius: 6, background: `${T.blue}15`, color: T.blue, border: 'none', fontSize: 9, fontWeight: 900, cursor: 'pointer' }}
                  >{v > 0 ? 'EDIT' : 'SET'}</button>
                </div>
              )},
              { k: 'progress', l: 'Performance', r: (v, row) => (
                <div style={{ width: 140 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 900, color: T.dim, marginBottom: 4 }}>
                    <span>{row.label}</span>
                    <span style={{ color: T.txt }}>{Math.round(v)}%</span>
                  </div>
                  <div style={{ height: 6, background: T.surface, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, v)}%`, background: T.accent, borderRadius: 10, transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                  </div>
                </div>
              )},
              { k: 'netDue', l: 'Net Due', r: v => <span style={{ fontWeight: 950, color: v > 0 ? T.warn : T.ok, fontSize: 18, letterSpacing: '-0.02em' }}>{fmt(v)}</span> },
              { k: 'id', l: 'Action', r: (v, row) => (
                row.netDue > 0 ? (
                  <Btn sm v="accent" icon={Zap} onClick={() => setPayoutModal(row)} style={{ height: 36, borderRadius: 10, fontWeight: 900, padding: '0 16px' }}>Execute Payout</Btn>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.ok, fontSize: 11, fontWeight: 900 }}>
                    <ShieldCheck size={14} /> CLEAR
                  </div>
                )
              )}
            ]}
            rows={payrollData.sort((a,b) => b.netDue - a.netDue)}
            emptyMsg="No payroll analysis available for this period."
            maxHeightVh={0.7}
          />
        </Card>
      )}

      {additionModal && (
        <Dialog title="Add Salary Addition" onClose={() => setAdditionModal(null)}>
          <form onSubmit={handleRecordAddition} style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 8 }}>Target Staff Member</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: T.txt }}>{additionModal.name}</div>
            </div>
            <FI label="Addition Amount (KES)" type="number" name="amount" placeholder="e.g. 5000" req />
            <FI label="Reason / Allowance Type" type="text" name="reason" placeholder="e.g. Bonus, Ex Gratia" req />
            <div style={{ background: `${T.ok}15`, color: T.ok, padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 20 }}>
              This amount will be added to the worker's gross earnings for {now().slice(0, 7)} before statutory deductions.
            </div>
            <Btn submit full loading={loading}>Apply Addition to Payroll</Btn>
          </form>
        </Dialog>
      )}

      {/* Payout Modal */}
      {payoutModal && (
        <Dialog title="Release Performance Funds" onClose={() => setPayoutModal(null)} width={500}>
           <div style={{ padding: '8px 0' }}>
              <div style={{ background: T.surface, padding: 28, borderRadius: 24, marginBottom: 32, border: `1px solid ${T.border}`, boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.1)' }}>
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                     <div style={{ width: 48, height: 48, background: `${T.accent}20`, color: T.accent, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Wallet size={24} />
                     </div>
                     <div style={{ fontSize: 11, fontWeight: 900, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Payee Profile</div>
                     <div style={{ fontSize: 28, fontWeight: 950, color: T.txt, letterSpacing: '-0.02em' }}>{payoutModal.name}</div>
                     <div style={{ color: T.accent, fontSize: 13, fontWeight: 800, background: `${T.accent}10`, padding: '6px 14px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, border: `1px solid ${T.accent}30` }}>
                       {payoutModal.mpesaNumber || payoutModal.phone || <span style={{ color: T.danger }}>⚠ No phone — update worker profile</span>}
                       <span style={{ fontSize: 9, fontWeight: 700, background: T.surface, padding: '2px 6px', borderRadius: 4, color: T.muted }}>Locked</span>
                     </div>
                     <div style={{ fontSize: 10, color: T.muted, marginTop: 6, fontStyle: 'italic' }}>Phone sourced from worker profile. Cannot be overridden here.</div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${T.border}` }}>
                     <span style={{ color: T.dim, fontSize: 14, fontWeight: 700 }}>Unpaid Commissions</span>
                     <span style={{ color: T.txt, fontWeight: 900, fontSize: 16 }}>{fmt(payoutModal.estimatedEarned)}</span>
                  </div>
                  {payoutModal.monthAdditions > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${T.border}` }}>
                     <span style={{ color: T.ok, fontSize: 14, fontWeight: 700 }}>Active Additions</span>
                     <span style={{ color: T.ok, fontWeight: 900, fontSize: 16 }}>+ {fmt(payoutModal.monthAdditions)}</span>
                  </div>
                  )}
                  {payoutModal.monthDeductions > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${T.border}` }}>
                     <span style={{ color: T.danger, fontSize: 14, fontWeight: 700 }}>Active Deductions</span>
                     <span style={{ color: T.danger, fontWeight: 900, fontSize: 16 }}>- {fmt(payoutModal.monthDeductions)}</span>
                  </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', marginTop: 8 }}>
                     <span style={{ color: T.txt, fontSize: 16, fontWeight: 900 }}>Estimated B2C Value</span>
                     <div style={{ textAlign: 'right' }}>
                       <div style={{ color: T.accent, fontSize: 26, fontWeight: 950 }}>{fmt(payoutModal.netDue)}</div>
                       <div style={{ fontSize: 10, color: T.muted, fontStyle: 'italic', marginTop: 2 }}>Server verifies final amount from DB</div>
                     </div>
                  </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                 <Btn block v="primary" loading={loading} icon={Zap} style={{ background: T.accent, color: '#060A10', height: 60, borderRadius: 20, fontSize: 16, fontWeight: 900, border: 'none' }} onClick={() => handleExecutePayout(payoutModal)}>
                   Initiate B2C Disbursement
                 </Btn>
                 <Btn block v="secondary" onClick={() => setPayoutModal(null)} style={{ border: 'none', color: T.dim, fontSize: 14 }}>Dismiss and Back</Btn>
              </div>

              <div style={{ marginTop: 32, padding: '16px 20px', background: `${T.warn}05`, border: `1px solid ${T.warn}20`, borderRadius: 16, textAlign: 'center', color: T.dim, fontSize: 12, lineHeight: 1.5 }}>
                 <b>Security Protocol:</b> This instruction will push an immediate B2C request to the Safaricom gateway. This action is irreversible once the M-Pesa network acknowledges it.
              </div>
           </div>
        </Dialog>
      )}

      {/* HELB Modal */}
      {helbModal && (
        <Dialog title="HELB Loan Repayment" onClose={() => setHelbModal(null)} width={440}>
          <form onSubmit={handleSetHelb} style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '10px 0' }}>
            <div style={{ padding: '16px', background: `${T.blue}08`, border: `1px solid ${T.blue}25`, borderRadius: 16 }}>
              <p style={{ color: T.dim, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                Setting a monthly HELB deduction for <b>{helbModal.name}</b>. This will appear as a named line item on their payslip and be subtracted from every month's net payout automatically.
              </p>
              {helbModal.helbAmount > 0 && (
                <p style={{ color: T.blue, fontSize: 12, margin: '10px 0 0', fontWeight: 700 }}>
                  Current HELB: KES {Number(helbModal.helbAmount).toLocaleString('en-KE')} / month
                </p>
              )}
            </div>
            <FI
              label="Monthly HELB Amount (KES)"
              name="helb_amount"
              type="number"
              placeholder="e.g. 1500 — leave blank to remove"
              defaultValue={helbModal.helbAmount || ''}
              autoFocus
            />
            <div style={{ fontSize: 11, color: T.muted, marginTop: -8 }}>
              Leave the field blank and confirm to <b>remove</b> the HELB deduction.
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <Btn block v="primary" type="submit" loading={loading} style={{ background: T.blue, color: '#fff', height: 48, borderRadius: 12, border: 'none', fontWeight: 800 }}>Save HELB Setting</Btn>
              <Btn block v="secondary" onClick={() => setHelbModal(null)} style={{ height: 48, borderRadius: 12 }}>Cancel</Btn>
            </div>
          </form>
        </Dialog>
      )}
      {deductionModal && (
        <Dialog title="Commission Adjustment" onClose={() => setDeductionModal(null)} width={420}>
           <form onSubmit={handleRecordDeduction} style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '10px 0' }}>
              <div style={{ padding: '16px', background: `${T.danger}05`, border: `1px solid ${T.danger}20`, borderRadius: 16 }}>
                 <p style={{ color: T.dim, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                   You are modifying the payroll for <b>{deductionModal.name}</b>. This adjustment will be subtracted from the current month's disbursement.
                 </p>
              </div>
              
              <FI label="Adjustment Amount (KES)" name="amount" type="number" placeholder="Enter amount to deduct" required autoFocus />
              <FI label="Internal Reason / Memo" name="reason" placeholder="e.g. Salary Advance, Lost Asset" required />

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                 <Btn block v="primary" type="submit" loading={loading} style={{ background: T.danger, color: '#fff', height: 48, borderRadius: 12, border: 'none', fontWeight: 800 }}>Confirm Deduction</Btn>
                 <Btn block v="secondary" onClick={() => setDeductionModal(null)} style={{ height: 48, borderRadius: 12 }}>Cancel</Btn>
              </div>
           </form>
        </Dialog>
      )}
      <style>{`
        .glass-card {
          padding: 28px;
          border-radius: 32px;
          background: ${theme === 'light' || theme === 'orange' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(25, 33, 50, 0.6)'};
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid ${theme === 'light' || theme === 'orange' ? 'rgba(0,0,0,0.05)' : 'rgba(255, 255, 255, 0.08)'};
          box-shadow: 0 30px 60px -12px rgba(0,0,0,0.25);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hover-lift {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .hover-lift:hover {
          transform: translateY(-8px) scale(1.01);
          box-shadow: 0 40px 80px -15px rgba(0,0,0,0.5) !important;
          border-color: ${T.accent} !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default SalariesTab;
