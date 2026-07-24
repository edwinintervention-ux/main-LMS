import React, { useState, useMemo, useEffect } from 'react';
import { 
  IdCard, FileImage, FileText, CheckCircle, AlertTriangle, User, Target, 
  Activity, Lock, Paperclip, ClipboardList, Check, Square, Hourglass,
  Gavel, Landmark, LayoutDashboard, ChevronLeft, Menu, X, Users, MessageSquare,
  ShieldAlert, ShieldOff, TrendingUp, Settings, LogOut, Search, PieChart, Plus, Clock, 
  ChevronRight, ArrowUpRight, ArrowDownRight, CreditCard, Clock as ClockIcon, Calculator, Download, Calendar as CalendarIcon, Bell
} from 'lucide-react';
import MultiCalculator from '@/modules/tools/MultiCalculator';
import { 
  T, SC, RC, SFX, Card, CH, KPI, DT, Btn, Badge, Av, 
  Dialog, Alert, LoanForm, DocViewer, FI, hashPwAsync,
  fmt, fmtM, now, uid, ts, sbWrite, toSupabaseWorker, compressImage, calculateLoanStatus, useReminders, RemindersPanel,
  ADEQUATE_LOGO_BASE64, ADEQUATE_STAMP_BASE64
} from '@/lms-common';
import ALeads from '@/modules/leads/LeadsTab';
import AssetRecoveryDashboard from './AssetRecoveryDashboard';
import CollectionsDashboard from './CollectionsDashboard';
import FinanceDashboard from './FinanceDashboard';
import LoanOfficerDashboard from './LoanOfficerDashboard';
import CollectionsOfficerDashboard from './CollectionsOfficerDashboard';
import DueLoansCalendar from '@/modules/calendar/DueLoansCalendar';
import PerformanceAnalytics from '@/modules/reports/PerformanceAnalytics';
import PaymentsTab from '@/modules/payments/PaymentsTab';
import { useRegistrationFee } from '@/pages/PaymentsHub/hooks/useRegistrationFee';
import { calculateStatutoryDeductions } from '@/utils/taxCalculator';
import WorkerGreetingWidget from './WorkerGreetingWidget';
import { CommandCenter } from '@/components/CommandCenter';

const WorkerRegFeePrompt = ({ customer, showToast }) => {
  const { status, loading, initiateStk, isSuccess, waitingForCallback } = useRegistrationFee(customer.id);
  const [localLoading, setLocalLoading] = useState(false);

  const handlePrompt = async (e) => {
    e.stopPropagation();
    if (!customer.phone) return;
    setLocalLoading(true);
    try {
      await initiateStk(customer.phone);
      showToast('STK Push Sent!', 'Push prompt delivered to client phone.', 'success');
    } catch (err) {
      showToast('Prompt Failed', err.message, 'danger');
    } finally {
      setLocalLoading(false);
    }
  };

  if (customer.mpesaRegistered || status === 'paid' || isSuccess) {
    return <Badge color={T.ok} sm>Paid</Badge>;
  }

  return (
    <Btn sm loading={loading || localLoading || waitingForCallback} onClick={handlePrompt} style={{ background: `linear-gradient(135deg, ${T.gold}, #EAB308)`, color: '#000', border: 'none', fontWeight: 800, fontSize: 11, padding: '2px 8px' }}>
      {waitingForCallback ? 'WAITING...' : 'PROMPT FEE'}
    </Btn>
  );
};

const WorkerPanel = ({
  worker,
  workers,
  setWorkers,
  loans,
  setLoans,
  payments,
  customers,
  leads,
  allWorkers,
  setCustomers,
  onSubmitLoan,
  setLeads,
  setPayments,
  interactions,
  setInteractions,
  addAudit,
  showToast = () => {},
  onOpenCustomerProfile: adminOpenProfile,
  repossessedAssets = [],
  setRepossessedAssets,
  targets = [],
  onLogout
}) => {
  const [tab, setTab] = useState('overview');
  const [tabHistory, setTabHistory] = useState([]);
  const [forwardHistory, setForwardHistory] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [showLoanApp, setShowLoanApp] = useState(false);
  const [showCalc, setShowCalc]   = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const {reminders,add:addReminder,done:doneReminder,remove:removeReminder,update:updateReminder,firing:firingReminder,dismissFiring} = useReminders();
  const [viewDoc, setViewDoc] = useState(null);
  const [deductions, setDeductions] = useState([]);
  const [additions, setAdditions] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [pwData, setPwData] = useState({ new: '', confirm: '' });
  
  // Allow all workers to open profiles for customers assigned to them.
  const onOpenCustomerProfile = (id) => {
    const isAssigned = myC.some(c => c.id === id);
    if (isAssigned) {
      adminOpenProfile(id);
    } else {
      showToast('Access Denied: You can only view profiles of customers assigned to your portfolio.', 'warn');
    }
  };

  useEffect(() => {
    if (!worker?.id) return;
    import('@/config/supabaseClient').then(({ supabase }) => {
      if(supabase) {
        supabase.from('worker_deductions').select('*').eq('worker_id', worker.id)
          .then(({ data }) => setDeductions(data || []));
        
        supabase.from('worker_additions').select('*').eq('worker_id', worker.id)
          .then(({ data }) => setAdditions(data || []));
        
        supabase.from('salary_payments').select('*').eq('worker_id', worker.id).order('created_at', { ascending: false })
          .then(({ data }) => setPayslips(data || []));
      }
    });
  }, [worker?.id]);

  const handleWorkerChangePw = async () => {
    if (pwData.new.length < 6) return showToast('New password must be at least 6 characters', 'warn');
    if (pwData.new !== pwData.confirm) return showToast('Passwords do not match', 'warn');
    try {
      showToast('Updating password...', 'info');
      const { changePassword } = await import('@/services/authService');
      const { error } = await changePassword(pwData.new);
      if (error) throw error;
      
      const hp = await hashPwAsync(pwData.new);
      const nextW = { ...worker, pw: hp, forcePasswordChange: false };
      if (setWorkers) {
         setWorkers(ws => ws.map(w => w.id === worker.id ? nextW : w));
      }
      sbWrite('workers', toSupabaseWorker(nextW)).catch(console.error);
      
      addAudit('Password Changed', worker.id, 'Worker changed their own password');
      showToast('Password updated successfully', 'ok');
      setShowSettings(false);
      setPwData({ new: '', confirm: '' });
    } catch (err) {
      showToast('Failed to change password: ' + err.message, 'danger');
    }
  };


  // ── ROLE CONFIGURATION & THEMING ───────────────────────────────────────────
  const ROLE_CONFIG = useMemo(() => ({
    'Loan Officer': {
      color: T.accent,
      icon: Target,
      tabs: [
        { k: 'overview', l: 'Dashboard', icon: LayoutDashboard },
        { k: 'leads', l: 'Lead Pipeline', icon: Target },
        { k: 'customers', l: 'My Portfolio', icon: Users },
        { k: 'loans', l: 'Active Loans', icon: Activity },
        { k: 'calendar', l: 'Due Calendar', icon: CalendarIcon },
        { k: 'payments', l: 'Payments Log', icon: Landmark },
        { k: 'analytics', l: 'My Analytics', icon: PieChart },
        { k: 'compensation', l: 'Salary & Earnings', icon: CreditCard },
        { k: 'documents', l: 'My Compliance', icon: IdCard },
      ]
    },
    'Collections Officer': {
      color: '#F59E0B',
      icon: ShieldAlert,
      tabs: [
        { k: 'overview', l: 'Performance', icon: LayoutDashboard },
        { k: 'collections', l: 'Collection Hub', icon: ShieldAlert },
        { k: 'customers', l: 'Arrears CRM', icon: AlertTriangle },
        { k: 'calendar', l: 'Due Calendar', icon: CalendarIcon },
        { k: 'payments', l: 'Payments Log', icon: Landmark },
        { k: 'analytics', l: 'My Analytics', icon: PieChart },
        { k: 'compensation', l: 'Salary & Earnings', icon: CreditCard },
        { k: 'documents', l: 'Compliance', icon: IdCard },
      ]
    },
    'Finance': {
      color: '#10B981',
      icon: Landmark,
      tabs: [
        { k: 'overview', l: 'Finance Pulse', icon: LayoutDashboard },
        { k: 'treasury', l: 'Treasury Ops', icon: Landmark },
        { k: 'loans', l: 'Disbursements', icon: Landmark },
        { k: 'documents', l: 'Compliance', icon: IdCard },
      ]
    },
    'Asset Recovery': {
      color: '#EA580C',
      icon: Gavel,
      tabs: [
        { k: 'overview', l: 'Ops Overview', icon: LayoutDashboard },
        { k: 'recovery', l: 'Recovery Rack', icon: Gavel },
        { k: 'customers', l: 'Legal List', icon: Landmark },
        { k: 'documents', l: 'Compliance', icon: IdCard },
      ]
    },
    'default': {
      color: T.accent,
      icon: User,
      tabs: [
        { k: 'overview', l: 'Overview', icon: LayoutDashboard },
        { k: 'documents', l: 'Documents', icon: IdCard },
      ]
    }
  }), []);

  const theme = ROLE_CONFIG[worker?.role] || ROLE_CONFIG.default;
  const TABS = theme.tabs;

  // Local copy of this worker's docs
  const [myDocs, setMyDocs] = useState(() => (workers || []).find(w => w.id === worker?.id)?.docs || worker?.docs || []);
  
  useEffect(() => {
    if (!worker?.id) return;
    const fresh = (workers || []).find(w => w.id === worker.id)?.docs || worker.docs || [];
    setMyDocs(fresh);
  }, [worker?.id, workers]);
  
  const workerNameLc = (worker?.name || '').trim().toLowerCase();
  const myL = loans.filter(l => {
    if (!worker) return false;
    if (worker.role === 'Collections Officer') return (l.collectionsOfficer || '').trim().toLowerCase() === workerNameLc;
    return l.officer?.trim().toLowerCase() === workerNameLc &&
           l.status?.toUpperCase() !== 'APPROVED' && 
           l.status?.toUpperCase() !== 'WRITTEN OFF';
  });
  const myC = customers.filter(c => {
    if (!worker) return false;
    const matches = worker.role === 'Collections Officer' 
      ? loans.some(l => l.customerId === c.id && (l.collectionsOfficer || '').trim().toLowerCase() === workerNameLc)
      : (c.officer?.trim().toLowerCase() === workerNameLc || (worker.authId && c.assigned_officer === worker.authId));
    return matches && c.status !== 'Rejected';
  });
  const myLeads = (leads || []).filter(l => {
    if (!worker || worker.role === 'Collections Officer') return false; // Leads are for Loan Officers
    return l.officer?.trim().toLowerCase() === worker.name?.trim().toLowerCase();
  });
  const ov = myL.filter(l => l.status === 'Overdue');
  const act = myL.filter(l => l.status === 'Active');
  const book = myL.filter(l => l.status !== 'Settled').reduce((s, l) => s + l.balance, 0);
  const pendingMine = myL.filter(l => l.status === 'worker-pending');

  const curMonth = new Date().toISOString().slice(0, 7);
  const curMonthOnboarded = myC.filter(c => {
    if (!(c.createdAt||c.joined)?.startsWith(curMonth)) return false;
    const custLoans = (loans || []).filter(l => l.customerId === c.id);
    return custLoans.some(l => ['Active', 'Closed', 'Legal', 'Defaulted'].includes(l.status));
  }).length;
  const activeTarget = (targets || []).find(t => t.month === curMonth);
  const activeOfficersTotal = (allWorkers || workers || []).filter(w => w.role === 'Loan Officer' && w.status === 'Active').length || 1;
  const myTarget = activeTarget ? (activeTarget.total_target_amount / activeOfficersTotal) : 0;
  
  // Only count disbursements towards the target if the customer was onboarded this month
  const myDisbursed = myL.filter(l => {
    if (!l.disbursed?.startsWith(curMonth)) return false;
    const c = myC.find(cust => cust.id === l.customerId);
    return (c?.createdAt || c?.joined || c?.created_at)?.startsWith(curMonth);
  }).reduce((s,l) => s + Number(l.amount), 0);

  const myTgtPct = myTarget > 0 ? Math.min(Math.round((myDisbursed / myTarget) * 100), 100) : 0;

  const currentMonth = now().slice(0, 7);
  const myAllPayments = payments.filter(p => {
    if (!worker) return false;
    // Loan Officers see payments from loans they onboarded
    if (worker.role === 'Loan Officer') return (p.officer || '').trim().toLowerCase() === workerNameLc || myL.some(l => l.id === p.loanId);
    // Collections Officers ONLY see payments from loans allocated to them by Admin
    if (worker.role === 'Collections Officer') {
      const loan = loans.find(l => l.id === p.loanId);
      return (loan?.collectionsOfficer || '').trim().toLowerCase() === workerNameLc;
    }
    return false;
  });
  const myMonthlyPayments = myAllPayments.filter(p => p.date?.startsWith(currentMonth));
  const myMonthlyCollected = myMonthlyPayments.reduce((s, p) => s + Number(p.amount), 0);
  
  const myDeductions = deductions.filter(d => d.month === currentMonth);
  const totalDeductions = myDeductions.reduce((s, d) => s + d.amount, 0);

  const myAdditions = additions.filter(a => a.month === currentMonth);
  const totalAdditions = myAdditions.reduce((s, a) => s + a.amount, 0);

  // Reminder calculations
  const activeReminderCount=useMemo(()=>reminders.filter(r=>!r.done).length,[reminders]);
  const firingReminderCount=useMemo(()=>reminders.filter(r=>!r.done&&new Date(`${r.dueDate}T${r.dueTime}:00`)>new Date()).length,[reminders]);

  // Commission Logic
  let commission = 0;
  let performanceRate = 0;
  let performanceLabel = "";

  if (worker?.role === 'Loan Officer') {
    performanceRate = (curMonthOnboarded / (worker.onboardingTarget || 60));
    performanceLabel = "Growth Performance";
    // KES 333.33 per verified customer
    commission = Math.round(curMonthOnboarded * 333.33); 
  } else if (worker?.role === 'Collections Officer') {
    // Dynamic Target: What is actually collectible this month (Collected + Current Overdue in portfolio)
    const myLoans = loans.filter(l => (l.collectionsOfficer || '').toLowerCase() === (worker?.name || '').toLowerCase());
    const remaining = myLoans.reduce((total, l) => {
      const paid = payments.filter(p => p.loanId === l.id && p.status === 'Allocated').reduce((s, p) => s + p.amount, 0);
      const e = calculateLoanStatus(l, null, paid);
      return total + (e.totalAmountDue > 0 ? e.totalAmountDue : 0);
    }, 0);
    
    const totalCollectible = myMonthlyCollected + remaining;
    performanceRate = totalCollectible > 0 ? (myMonthlyCollected / totalCollectible) : 0;
    performanceLabel = "Collection Efficiency";
    
    // Tiered Logic: 90% -> 10k, 94% -> 15k, 100% -> 20k
    const pct = performanceRate * 100;
    if (pct >= 100)      commission = 20000;
    else if (pct >= 94) commission = 15000;
    else if (pct >= 90) commission = 10000;
    else {
      // Linear scaling below 90%? User said 10k for 90%, we'll provide fractional.
      commission = Math.round((pct / 90) * 10000);
    }
  }

  const statutory = calculateStatutoryDeductions(commission + totalAdditions);
  const helbAmount = Number(worker?.helbAmount || 0);
  const cumulativeEarnings = commission + totalAdditions - statutory.totalStatutory - helbAmount - totalDeductions;

  // Last-month summary — derived from payslips already loaded
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7); // e.g. "2026-05"
  const lastMonthLabel = lastMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const lastMonthPayout = payslips.find(p => p.month === lastMonth);
  const lastMonthClients = myC.filter(c => (c.joined || c.createdAt || '').startsWith(lastMonth)).length;

  const printPayslip = () => {
    const today = now();
    const fmtKey = (v) => "KES " + Number(v || 0).toLocaleString("en-KE");
    
    const performanceDetail = worker?.role === 'Collections Officer' 
      ? `Collection Efficiency (${(performanceRate * 100).toFixed(0)}%)`
      : `Onboarding Commission (${curMonthOnboarded} onboardings)`;

    const html = `
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
            padding: 15mm; 
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
              <div class="company-name">ADEQUATE CAPITAL LTD</div>
              <div class="slogan">You deserve nothing less</div>
              <div class="company-contact">
                P.O. Box 253-00241, Kitengela<br/>
                info@adequatecapital.co.ke
              </div>
            </div>
            <div class="logo-area">
              <img src="${ADEQUATE_LOGO_BASE64}" alt="Logo" style="height: 60px; width: auto; display: block; margin-left: auto;" />
            </div>
          </div>
          
          <div class="double-line"></div>
          
          <div class="title-banner">
            <div class="title-text">OFFICIAL PAYSLIP</div>
            <div class="title-sub">${currentMonth}</div>
          </div>
          
          <table class="info-table">
            <tr>
              <td class="label">EMPLOYEE:</td>
              <td><strong>${worker?.name}</strong>, Role: ${worker?.role || 'Staff'}</td>
            </tr>
            <tr>
              <td class="label">STAFF NUMBER:</td>
              <td><strong>${worker?.staffNo || worker?.idNo || '—'}</strong></td>
            </tr>
            <tr>
              <td class="label">REFERENCE:</td>
              <td><strong>PAYSLIP_${today.split('T')[0]}</strong></td>
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
                <td style="font-weight: 700; color: #1a365d;">${performanceDetail}</td>
                <td class="amt positive">${fmtKey(commission)}</td>
              </tr>
              
              ${myAdditions.length > 0 ? `<tr class="section-head"><td colspan="2">Allowances / Additions</td></tr>` : ''}
              ${myAdditions.map(a => `
              <tr>
                <td style="color: #1a365d;">${a.reason}</td>
                <td class="amt positive">+ ${fmtKey(a.amount)}</td>
              </tr>`).join('')}

              <tr>
                <td style="font-weight: 800; color: #1a365d; border-top: 2px solid #e2e8f0;">Total Gross Earnings</td>
                <td class="amt positive" style="border-top: 2px solid #e2e8f0; font-weight: 800;">${fmtKey(commission + totalAdditions)}</td>
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
              ${helbAmount > 0 ? `
              <tr>
                <td style="color: #475569;">HELB Loan Repayment</td>
                <td class="amt negative">- ${fmtKey(helbAmount)}</td>
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
              
              ${myDeductions.length > 0 ? `<tr class="section-head"><td colspan="2">Other Deductions</td></tr>` : ''}
              ${myDeductions.map(d => `
              <tr>
                <td style="color: #ef4444;">${d.reason}</td>
                <td class="amt negative">- ${fmtKey(d.amount)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          
          <div class="net-box" style="position: relative;">
            <div>
              <div class="net-label">Net Pay</div>
            </div>
            <div class="net-val">${fmtKey(cumulativeEarnings)}</div>
            
            <div class="stamp-container">
              <img src="${ADEQUATE_STAMP_BASE64}" alt="Stamp" style="width: 100%; height: auto; display: block;" />
              <div class="stamp-date">${today.split('T')[0].toUpperCase()}</div>
            </div>
          </div>
          
          <div class="footer-box">
            <strong style="color: #1a365d;">This payslip reflects your current month's performance and deductions. Final B2C disbursements are executed on month-end.</strong>
          </div>
        </div>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const WORKER_SELF_DOC_SLOTS = [
    { key: 'id_front', label: 'National ID — Front', icon: <IdCard size={16} />, required: true, accept: 'image/*', capture: 'environment' },
    { key: 'id_back', label: 'National ID — Back', icon: <IdCard size={16} />, required: true, accept: 'image/*', capture: 'environment' },
    { key: 'passport', label: 'Passport Photo', icon: <FileImage size={16} />, required: true, accept: 'image/*', capture: 'user' },
    { key: 'extra_1', label: 'Additional Document', icon: <FileText size={16} />, required: false, accept: 'image/*,application/pdf', capture: undefined },
    { key: 'extra_2', label: 'Additional Document 2', icon: <FileText size={16} />, required: false, accept: 'image/*,application/pdf', capture: undefined },
  ];

  const handleDocAdd = (doc) => {
    const next = [...myDocs.filter(d => d.key !== doc.key), doc];
    setMyDocs(next);
    if (setWorkers) setWorkers(ws => ws.map(w => w.id === worker.id ? { ...w, docs: next } : w));
    
    // PERSISTENCE FIX: Save to Supabase
    const upd = { ...worker, docs: next };
    sbWrite('workers', toSupabaseWorker(upd)).catch(console.error);

    addAudit('Worker Doc Uploaded', worker.id, doc.name);
    showToast(`✅ ${doc.name} uploaded`, 'ok');
  };

  const handleDocRemove = (docId) => {
    const next = myDocs.filter(d => d.id !== docId);
    setMyDocs(next);
    if (setWorkers) setWorkers(ws => ws.map(w => w.id === worker.id ? { ...w, docs: next } : w));
    
    // PERSISTENCE FIX: Save to Supabase
    const upd = { ...worker, docs: next };
    sbWrite('workers', toSupabaseWorker(upd)).catch(console.error);

    showToast('Document removed', 'info');
  };

  const requiredCount = WORKER_SELF_DOC_SLOTS.filter(s => s.required).length;
  const requiredDone = WORKER_SELF_DOC_SLOTS.filter(s => s.required && myDocs.some(d => d.key === s.key)).length;
  const docsComplete = requiredDone >= requiredCount;

  const navTo = (k) => { 
    setTab(k); 
    addAudit('Worker View', k, `${worker.name} viewed ${k}`); 
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const _navIdx = TABS.findIndex(item => item.k === tab);
  const navPrev = () => { if (_navIdx <= 0) return; navTo(TABS[_navIdx - 1].k); };
  const navNext = () => { if (_navIdx < 0 || _navIdx >= TABS.length - 1) return; navTo(TABS[_navIdx + 1].k); };
  const canNavPrev = _navIdx > 0;
  const canNavNext = _navIdx >= 0 && _navIdx < TABS.length - 1;


  if (!worker) return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:20}}>
      <div style={{width:40,height:40,border:`3px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
      <div style={{color:T.dim,fontSize:14,fontWeight:600}}>Initializing Worker Session…</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg, color: T.txt, overflow: 'hidden' }}>
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 999
          }}
        />
      )}
      
      {/* ── SIDEBAR ────────────────────────────────────────────────────────── */}
      <aside style={{
        width: isMobile ? (sidebarOpen ? 200 : 0) : (sideCollapsed ? 80 : 250),
        height: '100vh',
        background: T.card,
        borderRight: `1px solid ${T.border}`,
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: isMobile ? 'fixed' : 'relative',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: (!isMobile && sidebarOpen) ? `4px 0 20px rgba(0,0,0,0.2)` : 'none'
      }}>
        {/* Sidebar Branding */}
        <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: (!isMobile && sideCollapsed) ? 'center' : 'flex-start', gap: 12, minHeight: 64 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: theme.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', flexShrink: 0, boxShadow: `0 4px 12px ${theme.color}50` }}>
            {React.createElement(theme.icon, { size: 20 })}
          </div>
          {(!isMobile && sideCollapsed) ? null : (
            <div style={{ opacity: sidebarOpen ? 1 : 0, transition: '0.25s', minWidth: 0 }}>
              <div style={{ fontFamily: T.head, fontWeight: 900, fontSize: 13, letterSpacing: -0.2, lineHeight: 1.1, textTransform: 'uppercase', color: theme.color }}>Adequate<br/>Capital</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: theme.color, opacity: 0.7, letterSpacing: 1.5, marginTop: 3, textTransform: 'uppercase' }}>{worker?.role || 'Worker'}</div>
            </div>
          )}
        </div>

        {/* Sidebar Nav Controls: Home + Back/Forward scroll buttons */}
        <div style={{
          padding: sideCollapsed && !isMobile ? '10px 8px' : '10px 16px',
          borderTop: `1px solid ${T.border}`,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: sideCollapsed && !isMobile ? 'center' : 'space-between',
          gap: 6,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.015)',
        }}>
          {/* Home button */}
          <button
            onClick={() => navTo('overview')}
            title="Overview (Home)"
            aria-label="Go to Overview"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: sideCollapsed && !isMobile ? 0 : 7,
              flex: sideCollapsed && !isMobile ? '0 0 auto' : 1,
              height: 34,
              padding: sideCollapsed && !isMobile ? '0 9px' : '0 14px',
              borderRadius: 10,
              border: `1px solid ${tab === 'overview' ? theme.color + '50' : T.border}`,
              background: tab === 'overview' ? `${theme.color}15` : T.card2,
              color: tab === 'overview' ? theme.color : T.dim,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <LayoutDashboard size={14} strokeWidth={tab === 'overview' ? 2.5 : 2} />
            {(!sideCollapsed || isMobile) && <span>Home</span>}
          </button>
          
          {/* Back / Forward — sequential scroll through all pages */}
          {(!sideCollapsed || isMobile) && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={navPrev}
                disabled={!canNavPrev}
                title={canNavPrev ? `Back to ${TABS[_navIdx - 1]?.l}` : 'First page'}
                aria-label="Previous page"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 34, borderRadius: 9,
                  border: `1px solid ${T.border}`,
                  background: T.card2,
                  color: canNavPrev ? T.txt : T.dim,
                  cursor: canNavPrev ? 'pointer' : 'not-allowed',
                  opacity: canNavPrev ? 1 : 0.35,
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <button
                onClick={navNext}
                disabled={!canNavNext}
                title={canNavNext ? `Next: ${TABS[_navIdx + 1]?.l}` : 'Last page'}
                aria-label="Next page"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 34, borderRadius: 9,
                  border: `1px solid ${T.border}`,
                  background: T.card2,
                  color: canNavNext ? T.txt : T.dim,
                  cursor: canNavNext ? 'pointer' : 'not-allowed',
                  opacity: canNavNext ? 1 : 0.35,
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          )}
          {/* Collapsed sidebar — Back/Forward stacked */}
          {sideCollapsed && !isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={navPrev}
                disabled={!canNavPrev}
                title={canNavPrev ? `Back to ${TABS[_navIdx - 1]?.l}` : 'First page'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 16, borderRadius: 6,
                  border: `1px solid ${T.border}`, background: T.card2,
                  color: canNavPrev ? T.txt : T.dim,
                  cursor: canNavPrev ? 'pointer' : 'not-allowed',
                  opacity: canNavPrev ? 1 : 0.35,
                }}
              ><ChevronLeft size={12} strokeWidth={3} /></button>
              <button
                onClick={navNext}
                disabled={!canNavNext}
                title={canNavNext ? `Next: ${TABS[_navIdx + 1]?.l}` : 'Last page'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 16, borderRadius: 6,
                  border: `1px solid ${T.border}`, background: T.card2,
                  color: canNavNext ? T.txt : T.dim,
                  cursor: canNavNext ? 'pointer' : 'not-allowed',
                  opacity: canNavNext ? 1 : 0.35,
                }}
              ><ChevronRight size={12} strokeWidth={3} /></button>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {TABS.map(t => {
            const isActive = tab === t.k;
            const collapsed = !isMobile && sideCollapsed;
            return (
              <button
                key={t.k}
                onClick={() => navTo(t.k)}
                className="nb"
                title={collapsed ? t.l : ''}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: collapsed ? 0 : 10,
                  padding: '10px', borderRadius: 12, border: 'none',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  background: isActive ? `linear-gradient(135deg, ${theme.color}18, transparent)` : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  position: 'relative', flexShrink: 0,
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3,
                    background: theme.color, borderRadius: '0 3px 3px 0',
                    boxShadow: `0 0 12px ${theme.color}99`
                  }} />
                )}
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  width: 30, height: 30, borderRadius: 9,
                  background: isActive ? theme.color : `${theme.color}12`,
                  color: isActive ? '#000' : theme.color,
                  transition: 'all 0.2s',
                  boxShadow: isActive ? `0 4px 12px ${theme.color}50` : 'none',
                }}>
                  {React.createElement(t.icon, { size: 15, strokeWidth: isActive ? 2.5 : 2 })}
                </span>
                {!collapsed && (
                  <span style={{
                    opacity: sidebarOpen ? 1 : 0, transition: '0.2s',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isActive ? T.txt : T.dim, fontWeight: isActive ? 800 : 600, fontSize: 13.5,
                  }}>{t.l}</span>
                )}
                {!collapsed && t.k === 'documents' && !docsComplete && <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.danger, flexShrink: 0 }} />}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer / User Profile */}
        <div style={{ padding: '14px 12px', borderTop: `1px solid ${T.border}` }}>
          {(!isMobile && sideCollapsed) ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Av ini={worker?.avatar || worker?.name?.[0] || 'W'} size={34} color={theme.color} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px', marginBottom: 12 }}>
              <Av ini={worker?.avatar || worker?.name?.[0] || 'W'} size={34} color={theme.color} />
              <div style={{ minWidth: 0, opacity: sidebarOpen ? 1 : 0, transition: '0.2s' }}>
                <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.txt }}>{worker?.name || 'Worker'}</div>
                <div style={{ fontSize: 11, color: T.dim, fontWeight: 600 }}>System Active</div>
              </div>
            </div>
          )}
          {(!isMobile && sideCollapsed) ? (
            <button onClick={onLogout} title="Logout" style={{ width: '100%', padding: '9px 0', borderRadius: 10, background: `${T.danger}10`, border: `1px solid ${T.danger}30`, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <LogOut size={15} />
            </button>
          ) : (
            <>
              <button onClick={() => setShowSettings(true)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, marginBottom: 6, background: 'transparent', border: `1px solid ${T.border}`, color: T.txt, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                <Settings size={13} /> Account Settings
              </button>
              <button onClick={onLogout} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, background: `${T.danger}10`, border: `1px solid ${T.danger}30`, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                <LogOut size={13} /> Log Out
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, height: '100vh', overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Floating Bar */}
        <header style={{ 
          height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          padding: '0 24px', position: 'sticky', top: 0, zIndex: 900, 
          background: `${T.bg}D0`, backdropFilter: 'blur(10px)', borderBottom: `1px solid ${T.border}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
             <button onClick={() => isMobile ? setSidebarOpen(!sidebarOpen) : setSideCollapsed(!sideCollapsed)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.txt, padding: 8, borderRadius: 10, cursor: 'pointer' }}>
                {(isMobile ? sidebarOpen : !sideCollapsed) ? <ChevronLeft size={20}/> : <Menu size={20}/>}
             </button>
             <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{TABS.find(t => t.k === tab)?.l}</h2>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button 
              onClick={() => setShowSearch(true)} 
              aria-label="Search" 
              style={{
                background: T.card, border: `1px solid ${T.border}`, color: T.txt, 
                padding: 10, borderRadius: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Search size={18}/>
            </button>
            <button 
              onClick={() => { setShowReminders(s => !s); SFX.notify(); }} 
              aria-label="Reminders" 
              style={{
                background: showReminders ? `${theme.color}20` : T.card, border: `1px solid ${showReminders ? theme.color : T.border}`, color: showReminders ? theme.color : T.txt, 
                padding: 10, borderRadius: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
              }}
            >
              <Bell size={18}/>
              {activeReminderCount > 0 && (
                 <span style={{ position: 'absolute', top: -5, right: -5, background: T.danger, color: '#fff', fontSize: 10, fontWeight: 900, height: 18, minWidth: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                    {activeReminderCount}
                 </span>
              )}
            </button>
            <button 
              onClick={() => setShowCalc(true)} 
              aria-label="Calculator" 
              style={{
                background: T.card, border: `1px solid ${T.border}`, color: T.txt, 
                padding: 10, borderRadius: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Calculator size={18}/>
            </button>
            {worker?.role === 'Loan Officer' && (
              <Btn onClick={() => {
                if (!docsComplete) { showToast('⚠ Upload ID documents first', 'warn'); setTab('documents'); return; }
                setShowLoanApp(true);
              }} v="primary" style={{ height: 40, padding: '0 16px', borderRadius: 12, background: theme.color, color: '#000' }}>
                <Plus size={18} /> New Application
              </Btn>
            )}
          </div>
        </header>

        {/* Scrollable Area */}
        <div style={{ padding: '24px clamp(12px, 4vw, 40px) 70px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {/* Critical Warnings */}
          {!docsComplete && (
            <div className="pop-in" style={{ 
              background: `linear-gradient(to right, ${T.danger}15, transparent)`, 
              borderLeft: `4px solid ${T.danger}`, borderRadius: '4px 16px 16px 4px', 
              padding: '16px 20px', marginBottom: 24, display: 'flex', 
              alignItems: 'center', gap: 16
            }}>
              <AlertTriangle color={T.danger} size={24} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>Identity Check Required</div>
                <div style={{ color: T.muted, fontSize: 13 }}>Standard operational limits applied. Upload IDs to resolve.</div>
              </div>
              <Btn sm v="danger" onClick={() => setTab('documents')}>Fix Now</Btn>
            </div>
          )}

          {/* Tab Content Rendering */}
          <div style={{ animation: 'fadeIn 0.4s ease-out', flex: 1 }}>
            
            {tab === 'overview' && (
              worker?.role === 'Loan Officer' ? (
                 <LoanOfficerDashboard worker={worker} loans={loans} customers={customers} leads={leads} interactions={interactions} payments={payments} setTab={setTab} isMobile={isMobile} />
              ) : worker?.role === 'Collections Officer' ? (
                 <CollectionsOfficerDashboard worker={worker} loans={loans} setTab={setTab} />
              ) : (
              <div className="fu flex-col gap-8">
                {/* ── GREETING WIDGET ── */}
                <WorkerGreetingWidget
                  worker={worker}
                  targetPct={myTgtPct}
                  isMobile={isMobile}
                />
                {/* ── WORKER HERO SECTION ── */}
                <div style={{
                  background: `linear-gradient(135deg, ${theme.color}20 0%, ${T.card} 100%)`, 
                  borderRadius: 24, padding: 32, border: `1px solid ${T.border}`,
                  position: 'relative', overflow: 'hidden',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: 24, marginBottom: 24
                }}>
                   {/* Background Decorative Element */}
                   <div style={{ position: 'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background: `${theme.color}10`, filter:'blur(40px)' }}/>
                   
                   <div style={{ display:'flex', alignItems:'center', gap: 24, zIndex:1 }}>
                      <Av name={worker?.name || 'Worker'} size={72} bg={theme.color} color="#000" />
                      <div>
                         <div style={{ color: T.muted, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Field Intelligence Profile</div>
                         <div style={{ fontSize: 32, fontWeight: 900, color: T.txt, marginTop: 4 }}>{worker?.name || 'Worker'}</div>
                         <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <Badge color={theme.color} style={{fontWeight: 800, color:'#000'}}>{(worker?.role || 'Worker').toUpperCase()}</Badge>
                            <Badge color={T.accent} style={{fontWeight: 800}}>ACTIVE MISSION</Badge>
                         </div>
                      </div>
                   </div>

                   <div style={{ textAlign: isMobile ? 'left' : 'right', zIndex: 1 }}>
                      <div style={{ color: T.muted, fontSize: 12, fontWeight: 800 }}>MEMBER SINCE</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: T.txt, marginTop:4 }}>{ts(worker?.joined || worker?.createdAt).slice(0, 11)}</div>
                      <div style={{ marginTop: 16 }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: performanceRate >= 1 ? '#10B981' : T.accent, fontWeight: 900 }}>
                            <Target size={18} />
                            <span>{performanceRate >= 1 ? 'PREMIUM TIER' : 'GROWTH TIER'}</span>
                         </div>
                      </div>
                   </div>
                </div>

                {/* ── EARNINGS & PRIMARY KPIS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr 1fr', gap: 24, marginBottom: 24 }}>
                   <div style={{
                     background: '#111827', borderRadius: 24, padding: 32, 
                     border: '1px solid #374151', color: '#fff',
                     display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                   }}>
                      <div>
                         <div style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 800, textTransform: 'uppercase' }}>Available Commissions</div>
                         <div style={{ fontSize: 42, fontWeight: 900, color: '#10B981', marginTop: 10 }}>{fmt(cumulativeEarnings)}</div>
                         <div style={{ fontSize: 14, color: '#6B7280', marginTop: 8 }}>Estimated payout for {currentMonth}</div>
                      </div>
                      <div style={{ background: '#05966920', padding: 16, borderRadius: '50%', color: '#10B981' }}>
                         <CreditCard size={32} />
                      </div>
                   </div>

                   <KPI label="Portfolio Book" value={fmtM(book)} icon={TrendingUp} color={theme.color} />
                   <KPI label="Risk Exposure" value={ov.length} icon={AlertTriangle} color={T.danger} sub={`${ov.length} Active Arrears`} />
                </div>

                {/* ── PERFORMANCE BREAKDOWN ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
                   <Card style={{ padding: 24, background: T.card }}>
                      <CH title={`${performanceLabel} Breakdown`} icon={Target} sub="Progress towards contractual incentive bonus" />
                      <div style={{ marginTop: 24 }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'flex-end' }}>
                            <div>
                               <div style={{ fontSize: 32, fontWeight: 900 }}>{worker?.role === 'Collections Officer' ? fmt(myMonthlyCollected) : curMonthOnboarded}</div>
                               <div style={{ fontSize: 13, color: T.muted }}>{worker?.role === 'Collections Officer' ? 'Collected this Month' : 'Verified Onboardings'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                               <div style={{ fontSize: 16, fontWeight: 800, color: theme.color }}>{Math.round(performanceRate * 100)}%</div>
                               <div style={{ fontSize: 13, color: T.muted }}>Target: {worker?.role === 'Collections Officer' ? fmt(worker.collectionTarget || 500000) : (worker?.onboardingTarget || 60)}</div>
                            </div>
                         </div>
                         <div style={{ height: 12, background: T.border, borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: `linear-gradient(to right, ${theme.color}, #10B981)`, width: `${Math.min(performanceRate * 100, 100)}%`, transition: 'width 1s ease-out' }} />
                         </div>
                         <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                            <Badge color={performanceRate >= 1 ? '#10B98120' : '#F59E0B20'} style={{ color: performanceRate >= 1 ? '#10B981' : '#F59E0B' }}>
                               {performanceRate >= 1 ? 'Mission Target Achieved' : `${performanceLabel} Focus Required`}
                            </Badge>
                         </div>
                      </div>
                   </Card>

                   <Card style={{ padding: 24 }}>
                      <CH title="Assignment Insights" icon={Activity} sub="Summary of active portfolio vitals" />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
                         <div style={{ borderLeft: `3px solid ${theme.color}`, paddingLeft: 16 }}>
                            <div style={{ color: T.muted, fontSize: 12, fontWeight: 800 }}>ACTIVE LOANS</div>
                            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{act.length}</div>
                         </div>
                         <div style={{ borderLeft: `3px solid #10B981`, paddingLeft: 16 }}>
                            <div style={{ color: T.muted, fontSize: 12, fontWeight: 800 }}>TOTAL CAPACITY</div>
                            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{myC.length}</div>
                         </div>
                         <div style={{ borderLeft: `3px solid ${T.accent}`, paddingLeft: 16 }}>
                            <div style={{ color: T.muted, fontSize: 12, fontWeight: 800 }}>PENDING TASKS</div>
                            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{pendingMine.length}</div>
                         </div>
                         <div style={{ borderLeft: `3px solid ${T.danger}`, paddingLeft: 16 }}>
                            <div style={{ color: T.muted, fontSize: 12, fontWeight: 800 }}>RISK RATIO</div>
                            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{Math.round((ov.length / (myL.length || 1)) * 100)}%</div>
                         </div>
                      </div>
                   </Card>
                </div>
              </div>
            ))}

            {tab === 'recovery' && <AssetRecoveryDashboard worker={worker} loans={loans} customers={customers} payments={payments} interactions={interactions} setInteractions={setInteractions} setLoans={setLoans} setCustomers={setCustomers} repossessedAssets={repossessedAssets} setRepossessedAssets={setRepossessedAssets} addAudit={addAudit} showToast={showToast} onOpenCustomerProfile={onOpenCustomerProfile} />}

            {tab === 'collections' && <CollectionsDashboard worker={worker} loans={loans} customers={customers} payments={payments} interactions={interactions} setInteractions={setInteractions} addAudit={addAudit} showToast={showToast} onOpenCustomerProfile={onOpenCustomerProfile} />}

            {tab === 'treasury' && <FinanceDashboard worker={worker} loans={loans} customers={customers} payments={payments} addAudit={addAudit} showToast={showToast} onOpenCustomerProfile={onOpenCustomerProfile} />}

            {tab === 'compensation' && (
              <div className="fu">
                <Card style={{marginBottom: 20, borderLeft: `5px solid #10B981`}}>
                   <CH title="Current Earning Analysis" icon={CreditCard} right={<Btn sm v="secondary" onClick={printPayslip} icon={FileText}>Print Payslip</Btn>}/>

                   {/* Last-month summary banner */}
                   {lastMonthPayout && (
                     <div style={{ margin: '0 24px', marginTop: 16, padding: '12px 18px', borderRadius: 14, background: `${T.ok}12`, border: `1px solid ${T.ok}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                         <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.ok, flexShrink: 0 }} />
                         <span style={{ fontSize: 13, color: T.ok, fontWeight: 800 }}>{lastMonthLabel} — Settled</span>
                         <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
                           {worker?.role !== 'Collections Officer' && `${lastMonthClients} client${lastMonthClients !== 1 ? 's' : ''} onboarded ·`} KES {Number(lastMonthPayout.amount).toLocaleString('en-KE')} paid via M-Pesa
                         </span>
                       </div>
                       <span style={{ fontSize: 11, fontFamily: T.mono, color: T.dim }}>{lastMonthPayout.mpesa_receipt}</span>
                     </div>
                   )}

                   <div style={{padding: 24}}>
                      <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr', gap: 30}}>
                         <div>
                            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6}}>
                              <div style={{color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase'}}>{performanceLabel} Progress</div>
                              <div style={{fontSize: 10, fontWeight: 700, color: T.accent, background: `${T.accent}15`, padding: '2px 8px', borderRadius: 99, border: `1px solid ${T.accent}30`}}>
                                {new Date().toLocaleString('default', { month: 'short', year: 'numeric' }).toUpperCase()}
                              </div>
                            </div>
                            <div style={{display:'flex', gap:10, alignItems:'baseline', marginBottom:20}}>
                               <div style={{fontSize:42, fontWeight:900, color:T.txt}}>{(performanceRate * 100).toFixed(0)}%</div>
                               <div style={{color:T.dim, fontSize:14}}>/ {worker?.role === 'Collections Officer' ? 'Portfolio Target' : `${worker?.onboardingTarget || 60} Clients`}</div>
                            </div>
                            <div style={{height:10, background:T.border, borderRadius:5, marginBottom:10, overflow:'hidden'}}>
                               <div style={{height:'100%', background: performanceRate >= 1 ? '#10B981' : T.accent, width: `${Math.min(performanceRate * 100, 100)}%`}} />
                            </div>
                            <div style={{display:'flex', justifyContent:'space-between', color:T.dim, fontSize:12, fontWeight:700}}>
                               <span>{worker?.role === 'Collections Officer' ? fmt(myMonthlyCollected) : `${curMonthOnboarded} Onboarded`}</span>
                               <span>{worker?.role === 'Collections Officer' ? 'Portfolio Ratio' : `Target: ${worker?.onboardingTarget || 60}`}</span>
                            </div>
                         </div>

                         <div>
                            <div style={{color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 12}}>Monthly Calculator</div>
                            <div style={{display:'flex', flexDirection:'column', gap: 12}}>

                               <div style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${T.border}`}}>
                                  <span style={{color: T.dim}}>{performanceLabel} ({worker?.role === 'Collections Officer' ? fmt(myMonthlyCollected) : `${curMonthOnboarded} clients`}):</span>
                                  <span style={{fontWeight: 700, color: '#10B981'}}>+{fmt(commission)}</span>
                               </div>
                               <div style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${T.border}`}}>
                                  <span style={{color: T.dim}}>Statutory Taxes (PAYE, NSSF, SHIF, AHL):</span>
                                  <span style={{fontWeight: 700, color: T.danger}}>-{fmt(statutory.totalStatutory)}</span>
                               </div>
                               {helbAmount > 0 && (
                                 <div style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${T.border}`}}>
                                    <span style={{color: T.dim}}>HELB Repayment:</span>
                                    <span style={{fontWeight: 700, color: T.danger}}>-{fmt(helbAmount)}</span>
                                 </div>
                               )}
                               <div style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${T.border}`}}>
                                  <span style={{color: T.dim}}>Manual Additions:</span>
                                  <span style={{fontWeight: 700, color: T.ok}}>+{fmt(totalAdditions)}</span>
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8}}>
                                  <span style={{color: T.dim}}>Manual Deductions:</span>
                                  <span style={{fontWeight: 700, color: T.danger}}>-{fmt(totalDeductions)}</span>
                               </div>
                               <div style={{display:'flex', justifyContent:'space-between', padding:'14px 0', marginTop:6, borderTop:`2px solid ${T.border}`, fontSize:18, fontWeight:900}}>
                                  <span>NET PAYABLE:</span>
                                  <span style={{color: '#10B981'}}>{fmt(cumulativeEarnings)}</span>
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                </Card>

                <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginBottom: 20}}>
                   <Card>
                      <CH title="Deduction Particulars" icon={ShieldOff} sub="List of all adjustments applied by administrative team"/>
                      <DT 
                           cols={[
                             {k:'month', l:'Month', r:v => <span style={{fontWeight:900}}>{v}</span>},
                             {k:'reason', l:'Reason', r:v => <span style={{color:T.txt}}>{v}</span>},
                             {k:'amount', l:'Deduction', r:v => <span style={{color:T.danger}}>-{fmt(v)}</span>},
                           ]}
                           rows={myDeductions}
                           emptyMsg="No deductions recorded."
                      />
                   </Card>
                   <Card>
                      <CH title="Addition Particulars" icon={TrendingUp} sub="List of all allowances applied by administrative team"/>
                      <DT 
                           cols={[
                             {k:'month', l:'Month', r:v => <span style={{fontWeight:900}}>{v}</span>},
                             {k:'reason', l:'Reason', r:v => <span style={{color:T.txt}}>{v}</span>},
                             {k:'amount', l:'Addition', r:v => <span style={{color:T.ok}}>+{fmt(v)}</span>},
                           ]}
                           rows={myAdditions}
                           emptyMsg="No additions recorded."
                      />
                   </Card>
                </div>


                <Card style={{marginTop: 20}}>
                   <CH title="M-Pesa B2C Payment History" icon={Landmark}/>
                   <div style={{padding: '0 4px 10px'}}>
                      <DT 
                        cols={[
                          {k:'month', l:'Period'},
                          {k:'amount', l:'Amount Paid', r: v => <strong>{fmt(v)}</strong>},
                          {k:'mpesa_receipt', l:'Receipt ID', r: v => <code style={{color:T.accent}}>{v}</code>},
                          {k:'status', l:'Status', r: v => <Badge color={T.ok}>{v}</Badge>},
                          {k:'id', l:'Receipt', r: (v, row) => <Btn sm v="secondary" icon={Download} onClick={() => {
                            const wDeds = deductions.filter(d => d.month === row.month);
                            const totalDeds = wDeds.reduce((s, d) => s + Number(d.amount), 0);
                            const fmtKey = (v) => "KES " + Number(v || 0).toLocaleString("en-KE");
                            const html = `
                              <!DOCTYPE html><html><head><meta charset=UTF-8><style>
                                body { font-family: 'Inter', sans-serif; padding: 25mm; color: #1e293b; background: #fff; line-height: 1.5; }
                                .header { display: flex; justify-content: space-between; border-bottom: 2px solid #00D4AA; padding-bottom: 25px; margin-bottom: 30px; }
                                .logo { font-size: 26px; font-weight: 900; color: #00D4AA; }
                                .table { width: 100%; border-collapse: collapse; margin: 30px 0; }
                                .table th { text-align: left; background: #f8fafc; padding: 14px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                                .table td { padding: 14px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
                                .total-row { background: #f8fafc; font-weight: 900; }
                              </style></head><body>
                                <div class="header"><div><div style="font-size: 11px; font-weight: 700; color: #64748b;">PAYMENT RECEIPT</div></div><div style="text-align: right;"><img src="${ADEQUATE_LOGO_BASE64}" alt="Adequate Capital" style="height: 70px; width: auto; display: block; margin-left: auto; margin-bottom: 4px;" /><b>Receipt #: ${row.mpesa_receipt || row.id}</b><br>${row.month}</div></div>
                                <table class="table">
                                  <thead><tr><th>Description</th><th style="text-align: right;">Amount</th></tr></thead>
                                  <tbody>
                                    <tr><td style="font-weight: 700;">Base Salary + Commissions</td><td style="text-align: right; font-weight: 700;">${fmtKey(row.amount + totalDeds)}</td></tr>
                                    ${wDeds.map(d => `<tr><td style="color: #ef4444;">Reduction: ${d.reason}</td><td style="text-align: right; color: #ef4444;">- ${fmtKey(d.amount)}</td></tr>`).join('')}
                                  </tbody>
                                  <tfoot><tr class="total-row"><td>TOTAL DISBURSED (M-PESA)</td><td style="text-align: right; font-size: 18px; color: #00D4AA;">${fmtKey(row.amount)}</td></tr></tfoot>
                                </table>
                                <div style="margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center;">This is an official record of funds disbursed via M-Pesa with receipt ID ${row.mpesa_receipt}.</div>
                              </body></html>
                            `;
                            const blob = new Blob([html], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `Receipt_${row.month}_${row.mpesa_receipt || row.id}.html`;
                            a.click();
                          }}>Download</Btn>}
                        ]}
                        rows={payslips}
                        emptyMsg="No historical payments found."
                      />
                   </div>
                </Card>
              </div>
            )}

            {tab === 'loans' && (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <CH title='Active Portfolio' sub="Detailed view of all loans under your assignment" />
                <DT 
                  cols={[
                    { k: 'id', l: 'ID', r: v => <span style={{ color: theme.color, fontFamily: T.mono, fontSize: 12, fontWeight: 700 }}>{v}</span> }, 
                    { k: 'customer', l: 'Customer' }, 
                    { k: 'amount', l: 'Principal', r: v => fmt(v) }, 
                    { k: 'balance', l: 'Balance', r: v => <span style={{ fontWeight: 800 }}>{fmt(v)}</span> }, 
                    { k: 'status', l: 'Status', r: v => <Badge color={SC[v] || T.muted}>{v}</Badge> }
                  ]} 
                  rows={myL} 
                />
              </Card>
            )}

            {tab === 'customers' && (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <CH title='Customer Registry' icon={Users} />
                <DT 
                  cols={[
                    { k: 'id', l: 'ID', r: v => <span style={{ color: theme.color, fontFamily: T.mono, fontSize: 12, fontWeight: 700 }}>{v}</span> }, 
                    { k: 'name', l: 'Name', r: (v, row) => (
                      <span 
                        onClick={() => onOpenCustomerProfile(row.id)}
                        style={{ fontWeight: 700, color: (worker?.role === 'Collections Officer' || worker?.role === 'Asset Recovery') ? theme.color : T.txt, cursor: (worker?.role === 'Collections Officer' || worker?.role === 'Asset Recovery') ? 'pointer' : 'default', textDecoration: (worker?.role === 'Collections Officer' || worker?.role === 'Asset Recovery') ? 'underline' : 'none', textUnderlineOffset: 3 }}
                        title={(worker?.role === 'Collections Officer' || worker?.role === 'Asset Recovery') ? `Open ${v}'s profile` : v}
                      >{v}</span>
                    )}, 
                    { k: 'phone', l: 'Phone' }, 
                    { k: 'business', l: 'Business' }, 
                    { k: 'risk', l: 'Risk', r: v => <Badge color={RC[v]}>{v}</Badge> },
                    { k: 'reg_fee', l: 'Reg. Fee', r: (v, row) => <WorkerRegFeePrompt customer={row} showToast={showToast} /> }
                  ]} 
                  rows={worker?.role === 'Collections Officer' ? myC.filter(c => c.risk === 'High' || c.risk === 'Medium') : myC} 
                />
              </Card>
            )}

            {tab === 'leads' && (
              <ALeads 
                leads={myLeads} 
                setLeads={setLeads} 
                workers={allWorkers} 
                customers={customers} 
                setCustomers={setCustomers} 
                loans={loans} 
                addAudit={addAudit} 
                isWorker={true} 
                currentWorker={worker} 
                showToast={showToast}/>
            )}

            {tab === 'calendar' && (
              <DueLoansCalendar 
                loans={myL} 
                payments={myAllPayments} 
                workers={allWorkers || workers} 
                workerContext={{ role: worker?.role, name: worker?.name }} 
                onOpenCustomerProfile={onOpenCustomerProfile} 
                theme={theme} 
              />
            )}

            {tab === 'analytics' && (
              <PerformanceAnalytics 
                loans={myL} 
                payments={myAllPayments} 
                customers={myC} 
                showToast={showToast} 
              />
            )}

            {tab === 'payments' && (
              <PaymentsTab 
                payments={myAllPayments} 
                setPayments={setPayments} 
                loans={loans} 
                setLoans={setLoans} 
                customers={customers} 
                setCustomers={setCustomers} 
                interactions={interactions} 
                setInteractions={setInteractions} 
                workers={allWorkers || workers} 
                addAudit={addAudit} 
                showToast={showToast} 
                onOpenCustomerProfile={onOpenCustomerProfile} 
                onRefresh={() => {}} 
                theme={theme} 
              />
            )}

            {tab === 'documents' && (
              <div className='fu'>
                {viewDoc && <DocViewer doc={viewDoc} onClose={() => setViewDoc(null)} />}
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <CH title="Compliance & Verification" sub="Identity artifacts and operational permits" icon={CheckCircle} />
                  
                  <div style={{ padding: '32px' }}>
                    {/* Identity Progress Bar */}
                    <div style={{ marginBottom: 32 }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                          <div>
                             <div style={{ fontSize: 12, color: T.muted, fontWeight: 800, textTransform: 'uppercase' }}>Verification Status</div>
                             <div style={{ fontSize: 24, fontWeight: 900, color: docsComplete ? T.ok : T.warn, marginTop: 4 }}>{docsComplete ? 'FULLY VERIFIED' : 'PENDING ACTION'}</div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 900 }}>{requiredDone}/{requiredCount} <span style={{ color: T.muted, fontSize: 12 }}>RECORDS</span></div>
                       </div>
                       <div style={{ height: 10, background: T.border, borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(requiredDone / requiredCount) * 100}%`, background: docsComplete ? T.ok : theme.color, transition: '1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                       </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                      {WORKER_SELF_DOC_SLOTS.map((slot) => {
                        const doc = myDocs.find(d => d.key === slot.key);
                        return (
                          <div key={slot.key} style={{ 
                            background: T.card, border: `1px solid ${doc ? T.ok + '20' : T.border}`, 
                            borderRadius: 18, padding: '20px', display: 'flex', 
                            flexDirection: 'column', gap: 16, position: 'relative',
                            transition: 'all 0.3s'
                          }}>
                            {doc && <div style={{ position: 'absolute', top: 12, right: 12, color: T.ok }}><CheckCircle size={20}/></div>}
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                               <div style={{ width: 44, height: 44, borderRadius: 12, background: doc ? `${T.ok}15` : T.surface, color: doc ? T.ok : T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {React.cloneElement(slot.icon, { size: 22 })}
                               </div>
                               <div>
                                  <div style={{ fontWeight: 800, fontSize: 14 }}>{slot.label}</div>
                                  <div style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{doc ? `Uploaded ${doc.uploaded?.startsWith('data:') ? 'recently' : doc.uploaded}` : slot.required ? 'Required' : 'Optional'}</div>
                               </div>
                            </div>

                            {doc ? (
                               <div style={{ display: 'flex', gap: 8 }}>
                                  <Btn full sm v="secondary" onClick={() => setViewDoc(doc)}>View Document</Btn>
                                  <button onClick={() => handleDocRemove(doc.id)} style={{ background: 'transparent', border: 'none', color: T.danger, padding: '0 8px', cursor: 'pointer' }}><X size={16}/></button>
                               </div>
                            ) : (
                               <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, border: `1px solid ${theme.color}`, borderRadius: 10, color: theme.color, fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: '0.2s' }}>
                                  <Paperclip size={14} /> Attach File
                                  <input type='file' accept='image/*' style={{display:'none'}} id={`upload-${slot.key}`} onChange={async e => {
                                    const file = e.target.files?.[0]; if (!file) return;
                                    const compressed = await compressImage(file);
                                    const reader = new FileReader();
                                    reader.onload = ev => handleDocAdd({ id: uid('DOC'), key: slot.key, name: slot.label, type: compressed.type, size: compressed.size, dataUrl: ev.target.result, uploaded: now() });
                                    reader.readAsDataURL(compressed);
                                  }} />
                               </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
          

        </div>
      </main>

      {/* ── MODALS & OVERLAYS ── */}
      {showLoanApp && (
        <Dialog title="New Loan Application" onClose={() => setShowLoanApp(false)} width={580}>
          <LoanForm
            customers={customers.filter(c => c.officer === worker?.name)}
            payments={payments} loans={loans} workerMode={true} workerName={worker?.name}
            onSave={l => { onSubmitLoan(l); setShowLoanApp(false); }}
            onClose={() => setShowLoanApp(false)}
          />
        </Dialog>
      )}

      {/* ── MODALS ── */}
      {showSearch && <CommandCenter customers={customers} onClose={() => setShowSearch(false)} onSelect={adminOpenProfile} />}
      {showCalc && <MultiCalculator onClose={() => setShowCalc(false)} />}

      {/* Mobile Drawer Backdrop */}
      {isMobile && sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 999 }} 
        />
      )}

      {showSettings && (
        <Dialog title="Account Settings" onClose={() => setShowSettings(false)} width={400}>
          <div style={{ padding: '0 4px' }}>
            <div style={{ marginBottom: 14 }}>
               <FI label="New Password" type="password" value={pwData.new} onChange={v => setPwData(p => ({ ...p, new: v }))} placeholder="Minimum 6 characters"/>
            </div>
            <div style={{ marginBottom: 14 }}>
               <FI label="Confirm New Password" type="password" value={pwData.confirm} onChange={v => setPwData(p => ({ ...p, confirm: v }))} placeholder="Re-type new password"/>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
               <Btn full onClick={handleWorkerChangePw}>Update Password</Btn>
               <Btn full v="secondary" onClick={() => setShowSettings(false)}>Cancel</Btn>
            </div>
          </div>
        </Dialog>
      )}
      {showReminders && <RemindersPanel theme={theme} reminders={reminders} unallocatedCount={0} overdueCount={ov.length} loans={myL} customers={myC} payments={myMonthlyPayments} onAction={navTo} onAdd={addReminder} onDone={doneReminder} onRemove={removeReminder} onUpdate={updateReminder} onClose={() => setShowReminders(false)}/>}
    </div>
  );
};

export default WorkerPanel;
