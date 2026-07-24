// ADEQUATE CAPITAL LMS — App Shell (Modularized)
import { Lock, ShieldAlert, Mail, Smartphone, Check, Search as SearchIcon, ChevronRight, Menu, ChevronLeft, LogOut, Home, Calculator, Fingerprint, Zap, ShieldCheck, Moon, Sun, Flame, Leaf, Eclipse } from 'lucide-react';
import LoansTab from "@/modules/loans/LoansTab";
import PaymentsTab from "@/modules/payments/PaymentsTab";
import CollectionsTab from "@/modules/collections/CollectionsTab";
import DashboardTab from "@/modules/dashboard/DashboardTab";
import CustomersTab from "@/modules/customers/CustomersTab";
import CustomerProfile from "@/modules/customers/CustomerProfile";
import LeadsTab from "@/modules/leads/LeadsTab";
import WorkersTab from "@/modules/workers/WorkersTab";
import DatabaseTab from "@/modules/database/DatabaseTab";
import SettingsTab from "@/modules/security/SettingsTab";
import ReportsTab from "@/modules/reports/ReportsTab";
import PerformanceAnalytics from "@/modules/reports/PerformanceAnalytics";
import AuditTrailTab from "@/modules/audit/AuditTrailTab";
import PaymentsHub from "@/pages/PaymentsHub";
import SalariesTab from "@/pages/PaymentsHub/SalariesTab";
import UnallocatedPaymentsTab from "@/modules/payments/UnallocatedPaymentsTab";

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, memo } from "react";
import { _hashPw, _checkPw, SEED_WORKERS, SEED_CUSTOMERS, SEED_LOANS, SEED_PAYMENTS, SEED_LEADS, SEED_INTERACTIONS, SEED_AUDIT } from "@/data/seedData";
import DueLoansCalendar from "@/modules/calendar/DueLoansCalendar";
import WorkerPanel from "@/modules/workers/WorkerPanel";
import MultiCalculator from "@/modules/tools/MultiCalculator";
import { CommandCenter } from "@/components/CommandCenter";

import {
  T,
  SC,
  RC,
  SFX,
  fmt,
  fmtM,
  now,
  ts,
  uid,
  DAILY_RATE,
  INTEREST_DAYS,
  PENALTY_DAYS,
  FREEZE_AFTER,
  calculateLoanStatus,
  calcP,
  escHtml,
  toCSV,
  dlCSV,
  buildFullBackup,
  useToast,
  Styles,
  useContactPopup,
  useReminders,
  useModalLock,
  Badge,
  Av,
  Bar,
  KPI,
  Card,
  CH,
  Btn,
  BackBtn,
  ForwardBtn,
  RefreshBtn,
  FI,
  PhoneInput,
  NumericInput,
  Alert,
  ToastContainer,
  Dialog,
  ConfirmDialog,
  LoanForm,
  RepayTracker,
  DocViewer,
  StructuredDocUpload,
  LoanModal,
  CustomerEditForm,
  CustDocsTab,
  CustomerDetail,
  sbWrite,
  sbInsert,
  sbAuditInsert,
  sbDelete,
  fromSupabaseLoan,
  toSupabaseLoan,
  fromSupabaseCustomer,
  toSupabaseCustomer,
  fromSupabasePayment,
  toSupabasePayment,
  fromSupabaseLead,
  toSupabaseLead,
  fromSupabaseInteraction,
  toSupabaseInteraction,
  fromSupabaseWorker,
  toSupabaseWorker,
  fromSupabaseAsset,
  toSupabaseAsset,
  generateLoanAgreementHTML,
  generateAssetListHTML,
  downloadLoanDoc,
  Search,
  Pills,
  DT,
  getSecConfig,
  ADMIN_NAV,
  checkPwAsync,
  DEFAULT_ADMIN_PW,
  hashPwAsync,
  ReminderAlertModal,
  RemindersPanel,
  WORKER_NAV,
} from "./lms-common";

export {
  T,
  SC,
  RC,
  SFX,
  fmt,
  fmtM,
  now,
  ts,
  uid,
  DAILY_RATE,
  INTEREST_DAYS,
  PENALTY_DAYS,
  FREEZE_AFTER,
  calculateLoanStatus,
  calcP,
  escHtml,
  toCSV,
  dlCSV,
  buildFullBackup,
  useToast,
  Styles,
  useContactPopup,
  useReminders,
  useModalLock,
  Badge,
  Av,
  Bar,
  KPI,
  Card,
  CH,
  Btn,
  BackBtn,
  ForwardBtn,
  RefreshBtn,
  FI,
  PhoneInput,
  NumericInput,
  Alert,
  ToastContainer,
  Dialog,
  ConfirmDialog,
  LoanForm,
  RepayTracker,
  DocViewer,
  StructuredDocUpload,
  LoanModal,
  CustomerEditForm,
  CustDocsTab,
  CustomerDetail,
  sbWrite,
  sbInsert,
  sbAuditInsert,
  sbDelete,
  fromSupabaseLoan,
  toSupabaseLoan,
  fromSupabaseCustomer,
  toSupabaseCustomer,
  fromSupabasePayment,
  toSupabasePayment,
  fromSupabaseLead,
  toSupabaseLead,
  fromSupabaseInteraction,
  toSupabaseInteraction,
  fromSupabaseWorker,
  toSupabaseWorker,
  fromSupabaseAsset,
  toSupabaseAsset,
  generateLoanAgreementHTML,
  generateAssetListHTML,
  downloadLoanDoc,
  Search,
  Pills,
  DT,
  getSecConfig,
  ADMIN_NAV,
};

import { useSearchParams } from "react-router-dom"; // MODIFIED: Support parameterized redirects
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

const AdminPanel = ({onLogout,loans,setLoans,customers,setCustomers,workers,setWorkers,payments,setPayments,leads,setLeads,interactions,setInteractions,repossessedAssets,setRepossessedAssets,stkRequests,setStkRequests,b2cDisbursements,setB2cDisbursements,mpesaTransactions,setMpesaTransactions,targets,setTargets,salaryPayments,setSalaryPayments,workerDeductions,setWorkerDeductions,workerAdditions,setWorkerAdditions,auditLog,setAuditLog,unallocatedC2BCount,setUnallocatedC2BCount,onOpenCustomerProfile,onRefresh, initialScreen, cfg, setCfg, showToast}) => {
  const { theme, toggleTheme } = useTheme();
  const [screen,setScreen]=useState(initialScreen || 'dashboard');
  const isRecoveryLock = sessionStorage.getItem('acl_recovery_lock') === 'true';
  
  // Force screen to securitysettings if in recovery mode
  useEffect(() => {
    if (isRecoveryLock && screen !== 'securitysettings') {
      setScreen('securitysettings');
    }
  }, [isRecoveryLock, screen]);

  const [searchParams, setSearchParams] = useSearchParams(); // MODIFIED
  const [screenHistory,setScreenHistory]=useState([]);
  const [forwardHistory, setForwardHistory] = useState([]);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [sb, setSb] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const toggleSb = () => isMobile ? setSb(o => !o) : setSideCollapsed(o => !o);

  const { session, worker: dbWorker } = useAuth(); // MODIFIED: Get real worker profile from AuthContext
  const [adminUser, setAdminUser] = useState(() => {
    const saved = localStorage.getItem('lms_admin_profile');
    return saved ? JSON.parse(saved) : { name: 'Don', role: 'Super Admin', ini: 'DO' };
  });

  // Sync with DB profile if available
  useEffect(() => {
    if (dbWorker) {
      const next = { 
        name: dbWorker.name, 
        role: dbWorker.role, 
        avatar: dbWorker.avatar,
        ini: dbWorker.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() 
      };
      setAdminUser(next);
    }
  }, [dbWorker]);

  useEffect(() => {
    localStorage.setItem('lms_admin_profile', JSON.stringify(adminUser));
  }, [adminUser]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Inactivity Lock (5 minutes)
  useEffect(() => {
    const TIMEOUT = 5 * 60 * 1000; // 5 minutes
    let timer;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onLogout();
        showToast?.('Session Expired', 'You have been logged out due to 5 minutes of inactivity.', 'info');
      }, TIMEOUT);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => document.removeEventListener(e, resetTimer));
      if (timer) clearTimeout(timer);
    };
  }, [onLogout]);

  useEffect(() => {
    if (initialScreen) setScreen(initialScreen);
  }, [initialScreen]);

  // Scroll to top only when the main screen changes
  useEffect(() => {
    scrollTop();
  }, [screen]);

  const scrollRef = useRef(null);
  const scrollTop = () => {
    try { if(scrollRef.current) scrollRef.current.scrollTop = 0; } catch(e) {}
    try { window.scrollTo(0, 0); } catch(e) {}
  };
  const navTo=(s, params)=>{ 
    if (isRecoveryLock && s !== 'securitysettings') {
      showToast?.('System Locked', 'You must reset your password before accessing other features.', 'warn');
      return;
    }
    setScreenHistory(h=>[...h.slice(-9),screen]); 
    setForwardHistory([]);
    setScreen(s); 
    if (params) setSearchParams(params); // MODIFIED: Apply params to URL
    setSb(false); 
    scrollTop(); 
    setTimeout(scrollTop,50); 
  };
  const goBack=()=>{ if(screenHistory.length===0) return; const prev=screenHistory[screenHistory.length-1]; setForwardHistory(h=>[...h.slice(-9), screen]); setScreenHistory(h=>h.slice(0,-1)); setScreen(prev); setTimeout(scrollTop,30); };
  const goForward=()=>{ if(forwardHistory.length===0) return; const next=forwardHistory[forwardHistory.length-1]; setScreenHistory(h=>[...h.slice(-9), screen]); setForwardHistory(h=>h.slice(0,-1)); setScreen(next); setTimeout(scrollTop,30); };

  // Sequential nav — scrolls through ADMIN_NAV in order, regardless of visit history
  const _navIdx = ADMIN_NAV.findIndex(item => item.id === screen);
  const navPrev = () => { if (_navIdx <= 0) return; navTo(ADMIN_NAV[_navIdx - 1].id); };
  const navNext = () => { if (_navIdx < 0 || _navIdx >= ADMIN_NAV.length - 1) return; navTo(ADMIN_NAV[_navIdx + 1].id); };
  const canNavPrev = _navIdx > 0;
  const canNavNext = _navIdx >= 0 && _navIdx < ADMIN_NAV.length - 1;

  // MODIFIED: Sync screen from URL on mount (Fixes refresh desync)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['disbursements', 'registration-fee', 'paybill', 'audit'].includes(tab)) {
      setScreen('paymentshub');
    }
  }, []); // Only on mount

  const {reminders,add:addReminder,done:doneReminder,remove:removeReminder,update:updateReminder,firing:firingReminder,dismissFiring}=useReminders();
  const addAudit = useCallback((action, target, detail = '') => {
    const entry = { ts: ts(), user: adminUser.name || 'Admin', action, target, detail };
    setAuditLog(l => [entry, ...l].slice(0, 10));
    sbAuditInsert({
      ts: new Date().toISOString(),
      user_name: entry.user,
      action: entry.action,
      target_id: String(entry.target),
      detail: entry.detail
    }).catch(console.error);
  }, [setAuditLog, adminUser.name]);

  const unalloc=useMemo(()=>payments.filter(p=>p.status==='Unallocated').length + (unallocatedC2BCount || 0),[payments, unallocatedC2BCount]);
  const overdue=useMemo(()=>loans.filter(l=>l.status==='Overdue').length,[loans]);
  const pendingApprovals=useMemo(()=>loans.filter(l=>l.status==='Application submitted'||l.status==='worker-pending').length,[loans]);
  const allState=useMemo(()=>({loans,customers,payments,workers,leads,interactions,repossessedAssets,setRepossessedAssets,auditLog,targets,salaryPayments}),[loans,customers,payments,workers,leads,interactions,repossessedAssets,setRepossessedAssets,auditLog,targets,salaryPayments]);
  // FIX B — reminders.filter called 3× inline in JSX on every render. Memoize counts.
  const activeReminderCount=useMemo(()=>reminders.filter(r=>!r.done).length,[reminders]);
  const firingReminderCount=useMemo(()=>reminders.filter(r=>!r.done&&new Date(`${r.dueDate}T${r.dueTime}:00`)>new Date()).length,[reminders]);

  // 5-min inactivity session timeout
  useEffect(()=>{
    const TIMEOUT=5*60*1000;
    let timer;
    const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{addAudit('Session Expired','Admin','Auto-logout after 5 min inactivity');onLogout();},TIMEOUT);};
    const events=['mousemove','mousedown','keydown','touchstart','scroll','click'];
    events.forEach(e=>window.addEventListener(e,reset,{passive:true}));
    reset();
    return()=>{clearTimeout(timer);events.forEach(e=>window.removeEventListener(e,reset));};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Fixed Navigation Item with Active Indicators and Categories
  const navItem = useCallback((item, index, array) => {
    const isFirstInSection = index === 0 || array[index - 1].cat !== item.cat;
    const isActive = screen === item.id;

    return (
      <React.Fragment key={item.id}>
        {isFirstInSection && (!sideCollapsed || isMobile) && (
          <div style={{
            fontSize: 10,
            fontWeight: 900,
            color: T.dim,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            padding: isMobile ? '20px 16px 8px' : '24px 16px 8px',
            opacity: 0.5
          }}>
            {item.cat}
          </div>
        )}
        <button onClick={() => navTo(item.id)} className='nb'
          title={sideCollapsed && !isMobile ? item.l : ''}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: sideCollapsed && !isMobile ? 'center' : 'flex-start', 
            gap: sideCollapsed && !isMobile ? 0 : 12, width: 'calc(100% - 16px)', margin: '0 8px', padding: '12px', borderRadius: 14, border: 'none',
            background: isActive ? `linear-gradient(135deg, ${item.c}20, transparent)` : 'none',
            color: isActive ? T.txt : T.muted,
            cursor: 'pointer', fontSize: 13.5, fontWeight: isActive ? 800 : 500, marginBottom: 2, textAlign: 'left',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', flexShrink: 0, position: 'relative',
          }}>
          {isActive && (
            <div style={{
              position: 'absolute', left: 0, top: '25%', bottom: '25%', width: 3, 
              background: item.c, borderRadius: '0 4px 4px 0',
              boxShadow: `0 0 15px ${item.c}aa`
            }} />
          )}
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            width: 32, height: 32, borderRadius: 10,
            background: isActive ? item.c : `${item.c}10`,
            color: isActive ? '#000' : item.c,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isActive ? `0 8px 20px -5px ${item.c}60` : 'none',
            border: `1.5px solid ${isActive ? 'transparent' : `${item.c}20`}`
          }}>
            <item.i size={16} strokeWidth={isActive ? 2.5 : 2} />
          </span>
          {(!sideCollapsed || isMobile) && (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? T.txt : T.dim, fontWeight: isActive ? 800 : 600, fontSize: 14, letterSpacing: '-0.01em' }}>{item.l}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {item.id === 'payments' && unalloc > 0 && <span style={{ background: T.danger, color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 900 }}>{unalloc}</span>}
                {item.id === 'collections' && overdue > 0 && <span style={{ background: T.danger, color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 900 }}>{overdue}</span>}
                {item.id === 'loans' && pendingApprovals > 0 && <span style={{ background: T.gold, color: '#000', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 900 }}>{pendingApprovals}</span>}
              </div>
            </>
          )}
        </button>
      </React.Fragment>
    );
  }, [screen, navTo, unalloc, overdue, pendingApprovals]);

  const S = {
    dashboard:  DashboardTab,
    calendar:   DueLoansCalendar,
    loans:      LoansTab,
    customers:  CustomersTab,
    leads:      LeadsTab,
    collections:CollectionsTab,
    payments:   PaymentsTab,
    unallocated: UnallocatedPaymentsTab,
    workers:    WorkersTab,
    securitysettings: SettingsTab,
    database:   DatabaseTab,
    reports:    ReportsTab,
    performance: PerformanceAnalytics,
    audit:      AuditTrailTab,
    paymentshub: PaymentsHub,
    salary_ledger: SalariesTab,
  };

  const Screen = S[screen] || S.dashboard;
  const screenProps = {
    dashboard: { adminUser, loans, setLoans, customers, setCustomers, payments, setPayments, workers, interactions, setInteractions, stkRequests, b2cDisbursements, addAudit, onNav: navTo, scrollTop, onOpenCustomerProfile, onRefresh, targets, setTargets, theme },
    calendar: { loans, payments, workers, workerContext: { role: 'admin', name: 'Admin' }, onOpenCustomerProfile, theme },
    loans: { loans, setLoans, customers, setCustomers, payments, setPayments, interactions, setInteractions, workers, addAudit, showToast, onOpenCustomerProfile, onNav: navTo, onRefresh, theme },
    customers: { customers, setCustomers, workers, loans, setLoans, payments, setPayments, interactions, setInteractions, addAudit, showToast, onOpenCustomerProfile, onRefresh, theme },
    leads: { leads, setLeads, workers, customers, setCustomers, loans, addAudit, showToast, onOpenCustomerProfile, onNav: navTo, theme },
    collections: { loans, setLoans, customers, setCustomers, payments, setPayments, interactions, setInteractions, workers, addAudit, showToast, scrollTop, currentUser: 'Admin', onOpenCustomerProfile, onRefresh, theme },
    payments: { payments, setPayments, loans, setLoans, customers, setCustomers, interactions, setInteractions, workers, addAudit, showToast, onOpenCustomerProfile, onRefresh, theme },
    unallocated: { transactions: mpesaTransactions, customers, onRefresh, addAudit, theme },
    workers: { adminUser, workers, setWorkers, loans, setLoans, payments, customers, setCustomers, leads, setLeads, interactions, setInteractions, allState, addAudit, showToast, isMobile, onOpenCustomerProfile, onRefresh, targets, setTargets, onNav: navTo, theme },
    securitysettings: { adminUser, setAdminUser, auditLog, addAudit, showToast, theme, cfg, setCfg },
    database: { allState, setLoans, setCustomers, setPayments, setWorkers, setLeads, setInteractions, setAuditLog, addAudit, showToast, theme },
    reports: { loans, customers, payments, workers, auditLog, salaryPayments, showToast, addAudit, theme },
    performance: { loans, payments, customers, showToast, theme },
    audit: { allState, setAuditLog, theme },
    paymentshub: { customers, setCustomers, loans, payments, setLoans, setPayments, workers, addAudit, showToast, unallocatedC2BCount, setUnallocatedC2BCount, salaryPayments, setSalaryPayments, workerDeductions, setWorkerDeductions, workerAdditions, setWorkerAdditions, onNav: navTo, theme },
    salary_ledger: { workers, salaryPayments, setSalaryPayments, customers, loans, leads, addAudit, showToast, onNav: navTo, workerDeductions, setWorkerDeductions, workerAdditions, setWorkerAdditions, theme },
  };

  const renderScreen = <Screen {...(screenProps[screen] || screenProps.dashboard)} />;

  return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg,fontFamily:T.body,position:'relative'}}>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Backdrop — dims page, closes sidebar on tap */}
      <div onClick={()=>setSb(false)}
        style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:5099,
          backdropFilter:'var(--glass-blur)',WebkitBackdropFilter:'var(--glass-blur)',
          opacity: sb ? 1 : 0, pointerEvents: sb ? 'auto' : 'none',
          transition: 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}/>

      {/* Sidebar — Persistent on Desktop, Overlay on Mobile */}
      <div className="main-sidebar" style={{
        position: isMobile ? 'fixed' : 'sticky',
        top: 0, bottom: 0, left: 0,
        width: sideCollapsed && !isMobile ? 80 : 280,
        zIndex: 5100,
        height: isMobile ? '100dvh' : '100vh',
        background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(13, 20, 33, 0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        transform: isMobile ? `translateX(${sb ? '0%' : '-100%'})` : 'none',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: (isMobile && sb) ? '40px 0 100px rgba(0,0,0,0.8)' : (!isMobile && !sideCollapsed) ? '1px 0 0 rgba(255,255,255,0.05)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        borderRight: `1px solid ${T.border}`
      }}>
        <div style={{ padding: sideCollapsed && !isMobile ? '15px 0' : '15px 14px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: sideCollapsed && !isMobile ? 'center' : 'space-between', minHeight: 64, flexShrink: 0 }}>
          {(!sideCollapsed || isMobile) ? (
            <div style={{ fontFamily: T.head, color: T.accent, fontWeight: 900, fontSize: 13, letterSpacing: -.2, lineHeight: 1.2, textTransform: 'uppercase' }}>
              {(cfg.portalName || 'Adequate Capital').split(' ').map((word, i) => <React.Fragment key={i}>{word}{i === 0 && <br />}</React.Fragment>)}
            </div>
          ) : (
            <div style={{ fontFamily: T.head, color: T.accent, fontWeight: 900, fontSize: 18 }}>
              {(cfg.portalName || 'AC').split(' ').map(w => w[0]).join('')}
            </div>
          )}
          {isMobile && (
            <button onClick={() => setSb(false)} aria-label="Close navigation menu" style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.dim, borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          )}
        </div>
        <nav id="sidebar-nav" aria-label="Main navigation" style={{ flex: 1, padding: '8px 12px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {isRecoveryLock ? (
            <div style={{ padding: 16 }}>
              <div style={{ background: `${T.warn}15`, border: `1px solid ${T.warn}30`, padding: 16, borderRadius: 16, color: T.warn, fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
                ⚠️ SECURITY LOCKDOWN<br/>
                Please reset your password to unlock full access.
              </div>
            </div>
          ) : (
            ADMIN_NAV.map((item, idx) => navItem(item, idx, ADMIN_NAV))
          )}
          <div style={{ height: 16 }} />
        </nav>
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
          {!isRecoveryLock && (
            <button
              id="sidebar-home-btn"
              onClick={() => navTo('dashboard')}
              title="Dashboard (Home)"
              aria-label="Go to Dashboard"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: sideCollapsed && !isMobile ? 0 : 7,
                flex: sideCollapsed && !isMobile ? '0 0 auto' : 1,
                height: 34,
                padding: sideCollapsed && !isMobile ? '0 9px' : '0 14px',
                borderRadius: 10,
                border: `1px solid ${screen === 'dashboard' ? T.accent + '50' : T.border}`,
                background: screen === 'dashboard' ? `${T.accent}15` : T.card2,
                color: screen === 'dashboard' ? T.accent : T.dim,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <Home size={14} strokeWidth={screen === 'dashboard' ? 2.5 : 2} />
              {(!sideCollapsed || isMobile) && <span>Home</span>}
            </button>
          )}
          {/* Back / Forward — sequential scroll through all pages */}
          {(!sideCollapsed || isMobile) && !isRecoveryLock && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                id="sidebar-back-btn"
                onClick={navPrev}
                disabled={!canNavPrev}
                title={canNavPrev ? `Back to ${ADMIN_NAV[_navIdx - 1]?.l}` : 'First page'}
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
                id="sidebar-forward-btn"
                onClick={navNext}
                disabled={!canNavNext}
                title={canNavNext ? `Next: ${ADMIN_NAV[_navIdx + 1]?.l}` : 'Last page'}
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
          {sideCollapsed && !isMobile && !isRecoveryLock && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={navPrev}
                disabled={!canNavPrev}
                title={canNavPrev ? `Back to ${ADMIN_NAV[_navIdx - 1]?.l}` : 'First page'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 28, borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.card2,
                  color: T.dim, cursor: canNavPrev ? 'pointer' : 'not-allowed',
                  opacity: canNavPrev ? 0.8 : 0.3, transition: 'all 0.2s',
                }}
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
              <button
                onClick={navNext}
                disabled={!canNavNext}
                title={canNavNext ? `Next: ${ADMIN_NAV[_navIdx + 1]?.l}` : 'Last page'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 28, borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.card2,
                  color: T.dim, cursor: canNavNext ? 'pointer' : 'not-allowed',
                  opacity: canNavNext ? 0.8 : 0.3, transition: 'all 0.2s',
                }}
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
        <div style={{ 
          padding: sideCollapsed && !isMobile ? '16px 8px' : '16px 16px calc(16px + env(safe-area-inset-bottom))', 
          borderTop: `1px solid ${T.border}`, 
          flexShrink: 0, 
          background: 'rgba(255,255,255,0.02)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: sideCollapsed && !isMobile ? 'center' : 'flex-start', gap: 12, marginBottom: 16, padding: sideCollapsed && !isMobile ? 0 : '0 8px' }}>
             <Av ini={adminUser.avatar || adminUser.ini || 'AD'} size={sideCollapsed && !isMobile ? 40 : 36} color={T.accent} />
             {(!sideCollapsed || isMobile) && (
               <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.txt, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminUser.name}</div>
                  <div style={{ color: T.dim, fontSize: 11, fontWeight: 600 }}>{adminUser.role}</div>
               </div>
             )}
          </div>
          <button onClick={onLogout} className='nb' title={sideCollapsed && !isMobile ? 'Logout' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: sideCollapsed && !isMobile ? 'center' : 'flex-start', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 12, border: 'none', background: `${T.danger}10`, color: T.danger, cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.2s' }}>
            <LogOut size={16} />
            {(!sideCollapsed || isMobile) && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* Main content — always full width, never shifts */}
      <div ref={scrollRef} className='main-scroll' style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        {/* Topbar */}
        <div style={{
          padding: '12px 20px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          position: 'sticky', 
          top: 0, 
          zIndex: 5000, 
          flexShrink: 0, 
          gap: 12,
          background: (theme === 'light' || theme === 'orange') ? 'rgba(255, 255, 255, 0.85)' : 'rgba(6, 10, 16, 0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${T.border}`,
          boxShadow: '0 4px 30px rgba(0,0,0,0.02)'
        }}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={toggleSb} aria-label={isMobile ? "Open navigation menu" : sideCollapsed ? "Expand sidebar" : "Collapse sidebar"} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.dim, cursor: 'pointer', fontSize: 16, padding: '5px 9px', borderRadius: 8, lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 34 }}>
              {isMobile ? <Menu size={18} /> : sideCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>

            <RefreshBtn onRefresh={()=>{ scrollTop(); onRefresh?.(); navTo(screen); }}/>
          </div>
          <div className="topbar-actions" style={{display:'flex',gap:7,alignItems:'center'}}>
            <button onClick={() => setShowSearch(true)} aria-label="Global Search" style={{background:T.card2,border:`1px solid ${T.border}`,color:T.dim,borderRadius:9,padding:'5px 10px',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',width:36,height:34}}>
              <SearchIcon size={16}/>
            </button>

            <button onClick={() => setShowCalc(true)} aria-label="Calculator" style={{background:T.card2,border:`1px solid ${T.border}`,color:T.dim,borderRadius:9,padding:'5px 10px',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',width:36,height:34}}>
              <Calculator size={16}/>
            </button>

            <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle Theme" style={{background:T.card2,border:`1px solid ${T.border}`,color:T.dim,borderRadius:9,padding:'5px 10px',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',width:36,height:34}}>
              {theme === 'dark' ? <Moon size={15} strokeWidth={2} /> : theme === 'dim' ? <Eclipse size={15} strokeWidth={2} /> : theme === 'orange' ? <Flame size={15} strokeWidth={2} /> : theme === 'green' ? <Leaf size={15} strokeWidth={2} /> : <Sun size={15} strokeWidth={2} />}
            </button>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? 4 : 7 }}>
              <button 
                onClick={()=>{setShowReminders(s=>!s);SFX.notify();}} 
                aria-label={'Notifications'} 
                aria-expanded={showReminders} 
                aria-haspopup="dialog" 
                style={{
                  background:showReminders?T.aLo:T.card2,
                  border:`1px solid ${showReminders?T.accent:T.border}`,
                  color:showReminders?T.accent:T.muted,
                  borderRadius:9,padding:'5px 10px',fontSize:14,height: 34, width: 36, 
                  cursor:'pointer',position:'relative',display:'flex',alignItems:'center',justifyContent: 'center',gap:5
                }}
              >
                <span aria-hidden="true">🔔</span>
                {(activeReminderCount + unalloc + overdue) > 0 && (
                  <span style={{
                    position:'absolute',top:-4,right:-4,
                    background: T.danger,
                    borderRadius:99,minWidth:14,height:14,padding:'0 4px',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:8,fontWeight:900,color:'#fff',boxShadow: '0 0 0 2px ' + T.bg
                  }}>
                    {activeReminderCount + unalloc + overdue}
                  </span>
                )}
              </button>

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 2 : 7, alignItems: 'center' }}>
                {pendingApprovals > 0 && (
                  <button 
                    onClick={() => navTo('loans')} 
                    style={{ 
                      background: T.gLo, border: `1px solid ${T.gold}38`, borderRadius: 9, 
                      padding: '0 12px', color: T.gold, fontSize: isMobile ? 9 : 11, height: 34, minWidth: 34,
                      fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {pendingApprovals}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {firingReminder&&<ReminderAlertModal reminder={firingReminder} onDismiss={dismissFiring} onDone={doneReminder}/>}
        {showReminders&&<RemindersPanel theme={theme} reminders={reminders} unallocatedCount={unalloc} overdueCount={overdue} loans={loans} customers={customers} payments={payments} onAction={navTo} onAdd={addReminder} onDone={doneReminder} onRemove={removeReminder} onUpdate={updateReminder} onClose={()=>setShowReminders(false)}/>}
        {showSearch && <CommandCenter customers={customers} onClose={() => setShowSearch(false)} onSelect={onOpenCustomerProfile} />}
        {showCalc && <MultiCalculator onClose={() => setShowCalc(false)} />}
        <div id="main-content" className='admin-content' style={{ padding: '20px 22px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div key={screen} className='fu screen-fade-in' style={{ flex: 1 }}>{renderScreen}</div>
          <footer style={{
            marginTop: 40,
            paddingTop: 16,
            borderTop: `1px solid ${T.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            color: T.dim,
            fontSize: 12,
            fontWeight: 500,
            opacity: 0.8
          }}>
            <div>
              © {new Date().getFullYear()} Adequate Capital Ltd. All rights reserved.
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>📞 0727625470</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>✉️ info@adequatecapital.co.ke</span>
            </div>
          </footer>
        </div>
      </div>

      <style>{`
        .fu { animation: fadeUp .8s cubic-bezier(.22,1,.36,1) both; }
        .fu1, .fu2, .fu3, .fu4, .fu5 { animation-delay: 0s !important; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .nav-item-new:hover {
          background: rgba(255,255,255,0.05) !important;
        }
        .nav-item-new:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
};

// ═══════════════════════════════════════════
//  WORKER PORTAL
// ═══════════════════════════════════════════
const WorkerPortal = ({workers,setWorkers,loans,setLoans,customers,setCustomers,payments,setPayments,leads,setLeads,interactions,setInteractions,repossessedAssets,setRepossessedAssets,auditLog,setAuditLog,onBack,dataLoaded,onOpenCustomerProfile,unallocatedC2BCount,setUnallocatedC2BCount, cfg, showToast, worker, session}) => {
  const { theme, toggleTheme } = useTheme();
  const { session: _authSession, worker: authWorker } = useAuth();
  const [loggedIn,setLoggedIn]=useState(false);
  const [curr,setCurr]=useState(null);
  const [email,setEmail]=useState('');
  const [pw,setPw]=useState('');
  const [err,setErr]=useState('');

  // Restore session automatically if already logged in via Supabase
  useEffect(() => {
    if (session && authWorker && !loggedIn) {
      if (authWorker.status === 'Active') {
        const base = fromSupabaseWorker(authWorker);
        const candidate = {
          ...base,
          name: base.name || 'Worker',
          role: base.role || 'Staff',
          avatar: base.avatar || (base.name || 'W').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
        };
        setCurr(candidate);
        setLoggedIn(true);
      } else {
        // Account is deactivated — revoke the Supabase session immediately
        console.warn('[WorkerPortal] Deactivated account attempted session restore. Signing out:', authWorker.email);
        import('@/config/supabaseClient').then(({ supabase: sb }) => {
          sb?.auth.signOut();
        });
      }
    }
  }, [session, authWorker, loggedIn]);
  const addAudit=(action,target,detail='')=>{
    const entry={ts:ts(),user:curr?.name||curr?.email||'Worker',action,target,detail};
    setAuditLog(l=>[entry,...l].slice(0,500));
    sbAuditInsert({
      ts: new Date().toISOString(),
      user_name: entry.user,
      action: entry.action,
      target_id: String(entry.target),
      detail: entry.detail
    }).catch(console.error);
  };

  const [loading,setLoading]=useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recPhone, setRecPhone] = useState('');
  const [recSent, setRecSent] = useState(false);
  const [recCode, setRecCode] = useState('');
  const [recInput, setRecInput] = useState('');
  const [newPw, setNewPw] = useState('');
  const [recErr, setRecErr] = useState('');
  const [recWorker, setRecWorker] = useState(null);

  const sendWorkerRecoveryCode = async () => {
    if (!recPhone.trim()) return setRecErr('Please enter your registered phone number or email.');
    setLoading(true); setRecErr('');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setRecCode(code);
    
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const isEmail = recPhone.includes('@');
      const payload = {
        code,
        origin: window.location.origin,
        [isEmail ? 'email' : 'phone']: recPhone.trim()
      };
      
      const res = await fetch(`${baseUrl}/functions/v1/send-recovery-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setRecErr(data.error || 'Failed to send recovery code.');
        setLoading(false); return;
      }
      setRecWorker(data.worker);
      setRecSent(true);
      setRecErr('');
    } catch (e) {
      setRecErr('Failed to dispatch recovery code.');
    } finally {
      setLoading(false);
    }
  };

  const verifyAndResetWorkerPw = async () => {
    if (recInput !== recCode) return setRecErr('Incorrect OTP code.');
    if (newPw.length < 6) return setRecErr('New password must be at least 6 chars.');
    setLoading(true); setRecErr('');
    
    try {
      const isEmail = recPhone.includes('@');
      let matchedEmail = recWorker?.email;
      
      if (!matchedEmail) {
        if (isEmail) {
          matchedEmail = recPhone.trim();
        } else {
          const searchPhone = recPhone.replace(/\D/g,'').slice(-9);
          matchedEmail = workers?.find(w => {
             const p1 = (w.phone || '').replace(/\D/g,'');
             const p2 = (w.mfa_phone || '').replace(/\D/g,'');
             return (p1 && p1.endsWith(searchPhone)) || (p2 && p2.endsWith(searchPhone));
          })?.email;
        }
      }
      
      if (!matchedEmail) {
        setRecErr(isEmail ? 'Could not identify your account from this email.' : 'Could not identify your account from this phone number.');
        setLoading(false); return;
      }
      
      const { adminForceResetPassword } = await import('@/services/authService');
      const { error } = await adminForceResetPassword(matchedEmail, newPw);
      if (error) throw error;
      
      import('@/lms-common').then(({ hashPwAsync, sbWrite, toSupabaseWorker }) => {
         hashPwAsync(newPw).then(hp => {
            const w = workers.find(x => x.email === matchedEmail);
            if (w) {
               const nextW = { ...w, pw: hp };
               setWorkers(ws => ws.map(x => x.id === w.id ? nextW : x));
               sbWrite('workers', toSupabaseWorker(nextW)).catch(console.error);
            }
         });
      });
      
      showToast('Password reset successfully! You can now log in.', 'ok');
      setShowRecovery(false); setRecSent(false); setRecInput(''); setRecCode(''); setNewPw(''); setRecPhone('');
    } catch (e) {
      setRecErr(e.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  // Sync curr with worker prop (handles page reload/hydration)
  useEffect(() => {
    if (worker) {
      const base = typeof fromSupabaseWorker === 'function' ? fromSupabaseWorker(worker) : worker;
      setCurr({
        ...base,
        name: base.name || 'Worker',
        role: base.role || 'Staff',
        avatar: base.avatar || (base.name || 'W').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
      });
      setLoggedIn(true);
    }
  }, [worker]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forceChangeErr, setForceChangeErr] = useState('');
  const [forceChangeLoading, setForceChangeLoading] = useState(false);

  const handleForceChangePassword = async (e) => {
    if (e) e.preventDefault();
    if (newPassword.length < 6) {
      setForceChangeErr('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setForceChangeErr('Passwords do not match.');
      return;
    }
    setForceChangeLoading(true);
    setForceChangeErr('');
    try {
      const { supabase, DEMO_MODE } = await import('@/config/supabaseClient');
      if (!supabase) throw new Error('Supabase not initialized');
      
      if (!DEMO_MODE) {
        const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
        if (authError) throw authError;
      }

      const hp = await hashPwAsync(newPassword);
      const nextW = { ...curr, pw: hp, forcePasswordChange: false };
      
      await sbWrite('workers', toSupabaseWorker(nextW));

      setWorkers(ws => ws.map(w => w.id === curr.id ? nextW : w));
      setCurr(nextW);
      showToast('Password updated successfully!', 'ok');
      addAudit('Password Changed (Forced)', curr.id, 'Worker updated temporary password');
    } catch (err) {
      setForceChangeErr(err.message || 'Failed to update password.');
    } finally {
      setForceChangeLoading(false);
    }
  };

  const getResolvedEmail = () => {
    let finalEmail = email.trim();
    if (!finalEmail.includes('@') && workers) {
      const matchByName = workers.find(w => (w.name || '').toLowerCase().replace(/\s+/g, '.') === finalEmail.toLowerCase());
      const matchByEmailPrefix = workers.find(w => (w.email || '').split('@')[0].toLowerCase() === finalEmail.toLowerCase());
      if (matchByName && matchByName.email) return matchByName.email;
      if (matchByEmailPrefix && matchByEmailPrefix.email) return matchByEmailPrefix.email;
    }
    return finalEmail;
  };

  const lastAutoLoginPw = useRef('');

  // Auto-login logic: Instantly trigger if PIN matches the worker's local hash
  useEffect(() => {
    if (pw.length < 4 || loading || loggedIn || !email) return;
    if (pw === lastAutoLoginPw.current) return;
    
    const candidate = workers.find(x => x.email === getResolvedEmail() && x.status === 'Active');
    if (candidate) {
      checkPwAsync(pw, candidate.pwHash || candidate.pw || '').then(isCorrect => {
        const legacyOk = !isCorrect && _checkPw(pw, candidate.pwHash || candidate.pw || '');
        if (isCorrect || legacyOk) {
          lastAutoLoginPw.current = pw;
          login();
        }
      });
    }
  }, [pw, email, loading, loggedIn, workers]);

  const login=()=>{
    if(!email||!pw){setErr('Enter your email and password.');return;}
    setLoading(true);
    console.log('[WorkerPortal] Attempting login for:', getResolvedEmail());
    const loginTimeout = setTimeout(() => {
      setLoading(false);
      setErr('Login timed out. Please check your connection and try again.');
    }, 10000);

    import('@/config/supabaseClient').then(({supabase,DEMO_MODE})=>{
      if(!DEMO_MODE&&supabase){
        const resolvedEmail = getResolvedEmail();
        
        // Authenticate first, because RLS prevents reading the workers table before login
        supabase.auth.signInWithPassword({email:resolvedEmail,password:pw})
          .then(({error})=>{
            clearTimeout(loginTimeout);
            if(error){
              setErr('Incorrect password.');
              setLoading(false);
              try{SFX.error();}catch(e){}
              return;
            }
            // Auth passed — fetch full worker profile from workers table
            supabase.from('workers').select('*').eq('email',resolvedEmail).maybeSingle()
              .then(({data:workerRow,error:wErr})=>{
                if(wErr||!workerRow){
                  // If they authenticate but aren't in the workers table, deny access and sign them out
                  supabase.auth.signOut().then(() => {
                    setErr('No user found.');
                    setLoading(false);
                    try{SFX.error();}catch(e){}
                  });
                  return;
                }

                if(workerRow.status!=='Active'){
                  setErr('Your account is inactive. Contact admin.');
                  setLoading(false);
                  try{SFX.error();}catch(e){}
                  return;
                }
                const base = fromSupabaseWorker(workerRow);
                const candidate = {
                  ...base,
                  name: base.name || 'Worker',
                  role: base.role || 'Staff',
                  avatar: base.avatar || (base.name || 'W').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
                };
                setWorkers(ws=>{
                  const exists=ws.find(w=>w.email===workerRow.email);
                  if(exists) return ws.map(w=>w.email===workerRow.email?{...w,...candidate}:w);
                  return [...ws,candidate];
                });
                setCurr(candidate);setLoggedIn(true);
                addAudit('Worker Login',candidate.id,candidate.name);SFX.login();
                // Note: loading state will be "cleared" by loggedIn changing, but we can set it to false too
                setLoading(false);
              }).catch(() => { setLoading(false); setErr('Account verification failed.'); });
          }).catch(err => { 
            clearTimeout(loginTimeout);
            setLoading(false); 
            setErr(err.message || 'Login failed.'); 
          });
        return;
      }
      // ── Demo/offline fallback — local hash check ──────────
      const candidate=workers.find(x=>x.email===getResolvedEmail()&&x.status==='Active');
      if(!candidate){setErr('Invalid credentials or inactive account.');setLoading(false);try{SFX.error();}catch(e){};return;}
      checkPwAsync(pw,candidate.pwHash||'').then(ok=>{
        const legacyOk=!ok&&_checkPw(pw,candidate.pwHash||candidate.pw||'');
        if(ok||legacyOk){setCurr(candidate);setLoggedIn(true);addAudit('Worker Login',candidate.id,candidate.name);SFX.login();}
        else{setErr('Invalid credentials or inactive account.');try{SFX.error();}catch(e){};}
        setLoading(false);
      }).catch(()=>{
        if(_checkPw(pw,candidate.pwHash||candidate.pw||'')){
          setCurr(candidate);setLoggedIn(true);addAudit('Worker Login',candidate.id,candidate.name);SFX.login();
        }else{setErr('Invalid credentials or inactive account.');try{SFX.error();}catch(e){};}
        setLoading(false);
      });
    }).catch(()=> { setErr('Login failed. Check your connection.'); setLoading(false); });
  };

  if(!loggedIn) {
    if (showRecovery) {
      return (
        <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:T.body,padding:16}}>
          <div style={{background:T.card,border:`1px solid ${T.hi}`,borderRadius:20,padding:'40px 34px',width:'100%',maxWidth:380,boxShadow:'0 50px 90px #00000070'}}>
            <div style={{textAlign:'center',marginBottom:26}}>
              <div style={{fontFamily:T.head,color:T.accent,fontSize:22,fontWeight:900}}>Account Recovery</div>
              <div style={{color:T.muted,fontSize:12,marginTop:4}}>Reset your worker password</div>
            </div>
            {recErr&&<Alert type='danger'>{recErr}</Alert>}
            
            {!recSent ? (
              <>
                <FI label='Registered Phone or Email' type='text' value={recPhone} onChange={setRecPhone} placeholder='e.g. 0712345678 or admin@example.com'/>
                <Btn onClick={sendWorkerRecoveryCode} loading={loading} full>Send OTP</Btn>
              </>
            ) : (
              <>
                <FI label='Enter OTP Code' type='text' value={recInput} onChange={setRecInput} placeholder='6-digit code'/>
                <FI label='New Password' type='password' value={newPw} onChange={setNewPw} placeholder='Min 6 characters'/>
                <Btn onClick={verifyAndResetWorkerPw} loading={loading} full>Reset Password</Btn>
              </>
            )}
            
            <div style={{height:1,background:T.border,margin:'18px 0'}}/>
            <button onClick={() => { setShowRecovery(false); setRecSent(false); setRecErr(''); }} style={{display:'block',width:'100%',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'9px',color:T.muted,fontSize:12,cursor:'pointer',textAlign:'center'}}>← Back to Sign In</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:T.body,padding:16}}>
        <div style={{background:T.card,border:`1px solid ${T.hi}`,borderRadius:20,padding:'40px 34px',width:'100%',maxWidth:380,boxShadow:'0 50px 90px #00000070'}}>
          <div style={{textAlign:'center',marginBottom:26}}>
            <div style={{fontFamily:T.head,color:T.accent,fontSize:22,fontWeight:900}}>{cfg.portalName || 'Adequate Capital'}</div>
            <div style={{color:T.muted,fontSize:12,marginTop:4}}>{cfg.portalName ? 'Worker Portal' : 'Adequate Capital Ltd'}</div>
          </div>
          {err&&<Alert type='danger'>{err}</Alert>}
          <FI label='Email or Username' type='text' value={email} onChange={setEmail} placeholder=''/>
          <FI label='Password' type='password' value={pw} onChange={setPw} placeholder='Your password'/>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <button onClick={()=>setShowRecovery(true)} style={{background:'none',border:'none',color:T.accent,fontSize:12,fontWeight:700,cursor:'pointer',padding:0}}>Forgot Password?</button>
          </div>
          <Btn onClick={login} loading={loading} full>Sign In →</Btn>
          <div style={{height:1,background:T.border,margin:'18px 0'}}/>
          <button onClick={onBack} style={{display:'block',width:'100%',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'9px',color:T.muted,fontSize:12,cursor:'pointer',textAlign:'center'}}>← Back to Admin Login</button>
        </div>
      </div>
    );
  }

  if (!dataLoaded) return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:20}}>
      <div style={{fontFamily:T.head,color:T.accent,fontWeight:900,fontSize:22,letterSpacing:-.5}}>Adequate Capital</div>
      <div style={{width:32,height:32,border:'3px solid ' + T.border,borderTop:`3px solid ${T.accent}`,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
      <div style={{color:T.dim,fontSize:13,fontFamily:T.body,fontWeight:500}}>Hydro-syncing workspace…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (loggedIn && curr?.forcePasswordChange) {
    return (
      <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:T.body,padding:16}}>
        <div style={{background:T.card,border:`1px solid ${T.hi}`,borderRadius:20,padding:'40px 34px',width:'100%',maxWidth:380,boxShadow:'0 50px 90px #00000070'}}>
          <div style={{textAlign:'center',marginBottom:26}}>
            <div style={{fontFamily:T.head,color:T.accent,fontSize:22,fontWeight:900}}>Security Policy</div>
            <div style={{color:T.muted,fontSize:13,marginTop:4,lineHeight:1.4}}>
              A password change is required because a temporary password was generated for your account.
            </div>
          </div>
          
          {forceChangeErr && <Alert type='danger'>{forceChangeErr}</Alert>}
          
          <form onSubmit={handleForceChangePassword}>
            <FI 
              label='New Password' 
              type='password' 
              value={newPassword} 
              onChange={setNewPassword} 
              placeholder='Minimum 6 characters'
            />
            <FI 
              label='Confirm New Password' 
              type='password' 
              value={confirmPassword} 
              onChange={setConfirmPassword} 
              placeholder='Must match exactly'
            />
            <Btn type='submit' loading={forceChangeLoading} full>Update Password & Proceed</Btn>
          </form>
          
          <div style={{height:1,background:T.border,margin:'18px 0'}}/>
          
          <button 
            onClick={() => {
              import('@/config/supabaseClient').then(({supabase}) => { if(supabase) supabase.auth.signOut(); });
              setLoggedIn(false);
              setCurr(null);
            }} 
            style={{display:'block',width:'100%',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'9px',color:T.muted,fontSize:12,cursor:'pointer',textAlign:'center'}}
          >
            ← Cancel & Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:'100vh',background:T.bg}}>
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:'10px 18px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontFamily:T.head,color:T.accent,fontWeight:900,fontSize:14}}>{cfg.portalName || 'Adequate Capital'} — Worker Portal</div>
        <div style={{display:'flex',gap:9,alignItems:'center'}}>
          <button onClick={toggleTheme} aria-label="Toggle Theme" style={{background:T.card2,border:`1px solid ${T.border}`,color:T.muted,borderRadius:8,padding:'4px 10px',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6,marginRight:4}}>
            {theme === 'dark' ? <Moon size={14} strokeWidth={2} /> : theme === 'dim' ? <Eclipse size={14} strokeWidth={2} /> : theme === 'orange' ? <Flame size={14} strokeWidth={2} /> : theme === 'green' ? <Leaf size={14} strokeWidth={2} /> : <Sun size={14} strokeWidth={2} />}
            <span style={{fontSize:10,fontWeight:700,opacity:0.8}}>{theme.charAt(0).toUpperCase()+theme.slice(1)}</span>
          </button>
          <Av ini={curr?.avatar||curr?.name[0]} size={26} color={T.accent}/>
          <span style={{color:T.dim,fontSize:13}}>{curr?.name}</span>
          <Btn sm v='ghost' onClick={()=>{
            import('@/config/supabaseClient').then(async ({supabase}) => { 
              if(supabase) await supabase.auth.signOut(); 
              setLoggedIn(false);
              setCurr(null);
            });
          }}>Logout</Btn>
        </div>
      </div>
      <WorkerPanel 
        worker={curr} 
        workers={workers} 
        setWorkers={setWorkers} 
        loans={loans} 
        setLoans={setLoans} 
        payments={payments} 
        customers={customers} 
        leads={leads} 
        allWorkers={workers} 
        setCustomers={setCustomers} 
        onSubmitLoan={l=>setLoans(ls=>[l,...ls])} 
        setLeads={setLeads} 
        setPayments={setPayments}
        interactions={interactions} 
        setInteractions={setInteractions} 
        repossessedAssets={repossessedAssets} 
        setRepossessedAssets={setRepossessedAssets} 
        addAudit={addAudit} 
        showToast={showToast} 
        onOpenCustomerProfile={onOpenCustomerProfile}
        onLogout={() => { 
          import('@/config/supabaseClient').then(async ({supabase}) => { 
            if(supabase) await supabase.auth.signOut(); 
            setLoggedIn(false); 
            setCurr(null); 
          });
        }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════
//  ADMIN LOGIN
// ═══════════════════════════════════════════
const _LOCK_KEY = '_acl_lockout';
const _LOCK_MS  = 15 * 60 * 1000;
const _getLockout    = () => { try { const v=JSON.parse(localStorage.getItem(_LOCK_KEY)||'null'); return (v&&Date.now()<v.until)?v:null; } catch(e){ return null; } };
const _recordFailure = () => {
  try { 
    const v = JSON.parse(localStorage.getItem(_LOCK_KEY) || 'null') || { count: 0, until: 0 };
    // If the old lockout has expired, we reset the count to 0 for a fresh session
    const isExpired = v.until && Date.now() > v.until;
    const currentCount = isExpired ? 0 : (v.count || 0);
    
    const nextCount = currentCount + 1;
    const nextUntil = nextCount >= 3 ? Date.now() + _LOCK_MS : 0;
    
    localStorage.setItem(_LOCK_KEY, JSON.stringify({ count: nextCount, until: nextUntil }));
    return nextCount;
  } catch (e) { 
    return 1; 
  }
};
const _clearLockout = () => { 
  try { 
    localStorage.removeItem(_LOCK_KEY); 
  } catch(e) {} 
};


const AdminLogin = ({onLogin,onWorkerPortal, session, worker, cfg, workers, showToast}) => {
  const [lockout,setLockout]=useState(_getLockout);
  const locked=!!(lockout&&Date.now()<lockout.until);

  // ── Live countdown ─────────────────────────────────────────
  const [countdown,setCountdown]=useState(0);
  useEffect(()=>{
    if(!locked){setCountdown(0);return;}
    const tick=()=>{
      const rem=Math.max(0,Math.ceil((lockout.until-Date.now())/1000));
      setCountdown(rem);
      if(rem===0){
        setLockout(null);
        setErr('');
      }
    };
    tick();
    const id=setInterval(tick,1000);
    return()=>clearInterval(id);
  },[locked,lockout]);

  const fmtCountdown=(s)=>{const m=Math.floor(s/60);const sec=s%60;return `${m}:${String(sec).padStart(2,'0')}`;}

  // ── Recovery flow ──────────────────────────────────────────
  const [showRecovery,setShowRecovery]=useState(false);
  const [recMethod,setRecMethod]=useState(''); // 'email' | 'sms'
  const [recSent,setRecSent]=useState(false);
  const [recCode,setRecCode]=useState('');
  const [recInput,setRecInput]=useState('');
  const [recErr,setRecErr]=useState('');

  const secCfgForRec=getSecConfig();
  const hasEmail=!!(secCfgForRec.adminEmail);
  const hasPhone=!!(secCfgForRec.adminRecoveryPhone||secCfgForRec.adminPhone);

  const [loginPhone,setLoginPhone]=useState('');
  const [recWorker,setRecWorker]=useState(null);

  const sendRecoveryCode = async (method) => {
    if (loading) return;
    const nowTs = Date.now();
    const lastSent = window._lastRecSent || 0;
    let code = recCode;

    // Reuse code if it exists and was sent less than 90 seconds ago
    if (code && (nowTs - lastSent < 90000)) {
      console.log('[Recovery] Reusing existing code to prevent invalidation.');
    } else {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      window._lastRecSent = nowTs;
    }

    setRecCode(code);
    setRecInput('');   // Clear previous input
    setRecErr('');     // Clear previous errors
    setLoading(true);
    
    const body = { code, method };
    if (method === 'phone') {
      if (!loginPhone.trim()) {
        setRecErr('Please enter your phone number.');
        setLoading(false);
        return;
      }
      body.phone = loginPhone.trim();
    } else {
      if (!loginEmail.trim()) {
        setRecErr('Please type your email in the login field first.');
        setLoading(false);
        return;
      }
      body.email = loginEmail.trim();
    }
    
    setShowRecovery(true);
    setRecSent(true);
    setRecMethod(method);
    sessionStorage.setItem('acl_rec_method', method);
    sessionStorage.setItem('acl_rec_phone', loginPhone.trim());
    
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    try {
      const res = await fetch(`${baseUrl}/functions/v1/send-recovery-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        },
        body: JSON.stringify({ ...body, origin: window.location.origin })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setRecErr(`HTTP ${res.status}: ${data.error || res.statusText || 'Unknown gateway error'}`);
        setLoading(false);
        return;
      }

      if (data && data.success === false) {
        setRecErr(data.error || 'The recovery service encountered an issue.');
        setLoading(false);
        return;
      }

      if (data?.worker) {
        setRecWorker(data.worker);
        sessionStorage.setItem('acl_rec_worker', JSON.stringify(data.worker));
      }

      setRecCode(code);
      setRecInput('');
      setRecSent(true);
      setRecMethod(method);
      setShowRecovery(true); 

      // 2-minute expiry timer (with cleanup)
      if (window._recExpiry) clearTimeout(window._recExpiry);
      window._recExpiry = setTimeout(() => {
        setRecCode('');
        setRecErr('Recovery code has expired. Please request a new one.');
      }, 120000);
    } catch (e) {
      console.error('[Recovery Error]', e);
      setRecErr('Failed to dispatch recovery code. Please contact system support.');
    } finally {
      setLoading(false);
    }
  };


  const verifyRecoveryCode=()=>{
    if (!recCode) {
      setRecErr('No active recovery code. Please click Resend.');
      return;
    }
    
    const input = recInput.trim();
    if (input.length < 6 || input !== recCode) {
      setRecErr('Incorrect code. Try again.');
      return;
    }
    
    // Recovery successful
    _clearLockout();
    setLockout(null);
    setShowRecovery(false);
    
    // Identify the worker (Check local state, then session storage, then worker list)
    let finalWorker = recWorker;
    if (!finalWorker) {
      try {
        finalWorker = JSON.parse(sessionStorage.getItem('acl_rec_worker') || 'null');
      } catch (e) {}
    }

    const searchPhone = (loginPhone || sessionStorage.getItem('acl_rec_phone') || '').replace(/\D/g,'').slice(-9);
    const identifiedEmail = finalWorker?.email || workers?.find(w => {
      const p1 = (w.phone || '').replace(/\D/g,'');
      const p2 = (w.mfa_phone || '').replace(/\D/g,'');
      return (p1 && p1.endsWith(searchPhone)) || (p2 && p2.endsWith(searchPhone));
    })?.email;

    if (identifiedEmail) {
      sessionStorage.setItem('acl_recovery_lock', 'true');
      sessionStorage.setItem('acl_rec_email', identifiedEmail);
      sessionStorage.setItem('acl_start_screen', 'securitysettings');
      onLogin(identifiedEmail);
    } else {
      const dbg = `(W:${!!recWorker} S:${!!sessionStorage.getItem('acl_rec_worker')} L:${workers?.length} P:${!!searchPhone})`;
      setRecErr(`Account Link Error ${dbg}: Your phone number was verified but your admin profile could not be linked. Try resending.`);
      setShowRecovery(true); 
      return;
    }

    if (window._recExpiry) {
      clearTimeout(window._recExpiry);
      window._recExpiry = null;
    }
    sessionStorage.removeItem('acl_rec_worker');
    sessionStorage.removeItem('acl_rec_method');
    sessionStorage.removeItem('acl_rec_phone');
    setRecCode('');setRecInput('');setRecSent(false);setRecErr('');setRecWorker(null);
  };

  // WebOTP for Recovery
  useEffect(() => {
    if (showRecovery && recSent && !recInput && 'OTPCredential' in window) {
      const ac = new AbortController();
      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
      }).then(otp => {
        setRecInput(otp.code);
      }).catch(err => {
        if (err.name !== 'AbortError') console.log('[WebOTP Recovery] Error:', err);
      });
      return () => ac.abort();
    }
  }, [showRecovery, recSent]);

  // ── Main login state ───────────────────────────────────────
  const [step,setStep]=useState(1);
  const [bioScanning, setBioScanning] = useState(false);
  const [loading,setLoading]=useState(false);
  const [loginEmail,setLoginEmail]=useState('');
  const getResolvedEmail = () => {
    let finalEmail = loginEmail.trim();
    if (!finalEmail.includes('@') && workers) {
      const matchByName = workers.find(w => (w.name || '').toLowerCase().replace(/\s+/g, '.') === finalEmail.toLowerCase());
      const matchByEmailPrefix = workers.find(w => (w.email || '').split('@')[0].toLowerCase() === finalEmail.toLowerCase());
      if (matchByName && matchByName.email) return matchByName.email;
      if (matchByEmailPrefix && matchByEmailPrefix.email) return matchByEmailPrefix.email;
    }
    return finalEmail;
  };
  const [pw,setPw]=useState('');
  const [err,setErr]=useState('');
  const [otpCode,setOtpCodeState]=useState(null);
  const [otpInput,setOtpInput]=useState('');
  const [enabledSteps,setEnabledSteps]=useState(['Password']);
  const [storedBioId, setStoredBioId] = useState(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  const lastOtpSent = useRef(0);
  const bioAbortController = useRef(null);
  // Shared global to prevent double-send across component remounts (React Strict Mode etc)
  if (!window._lastOtpSentGlobal) window._lastOtpSentGlobal = 0;

  const triggerOtp = async () => {
    // Prevent double-sending within 6 seconds
    const now = Date.now();
    if (now - window._lastOtpSentGlobal < 6000) {
      console.log('[AdminLogin] Throttling OTP send (last send was < 6s ago)');
      return;
    }
    window._lastOtpSentGlobal = now;
    setResendCountdown(30); // 30s throttle
    
    console.log('[AdminLogin] Triggering security code delivery...');
    const { supabase } = await import('@/config/supabaseClient');
    return supabase.functions.invoke('send-admin-otp', {
      body: { origin: window.location.origin }
    });
  };

  // Removed auto-detect session for MFA skip — USER wants strict password + otp every time.

  // ── Auto-login logic ────────────────────────────────────────
  // Track 1 — Offline / local-hash: fire instantly when pw matches stored hash.
  // Track 2 — Supabase: debounce 600ms after the user stops typing so we don't
  //           spam the auth API on every keystroke. Triggers once email + pw are set.
  const autoSubmitTimer = useRef(null);

  // Removed aggressive auto-submit to prevent accidental lockouts. 
  // User must now explicitly click Login or press Enter.

  const stepPw = () => {
    if (locked) return;
    if (pw.length < 4) { setErr('Password too short.'); return; }
    setLoading(true);
    import('@/config/supabaseClient').then(({ supabase, DEMO_MODE }) => {
      if (!DEMO_MODE && supabase) {
        const resolvedEmail = getResolvedEmail();
        // Admin login: go straight to Supabase auth (no workers pre-check needed here)
        supabase.auth.signInWithPassword({ email: resolvedEmail, password: pw }).then(({ error, data }) => {
          if (error) {
            const c = _recordFailure();
            const lo = _getLockout();
            setLockout(lo);
            const rem = 3 - c;
            setErr(c >= 3
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={14} /> Too many failed attempts. Wait 15 min.</span>
              : `Incorrect password. ${rem} attempt${rem === 1 ? '' : 's'} remaining.`);
            setLoading(false);
            try { SFX.error(); } catch (e) { }
            return;
          }
          setErr('');
          // Check for MFA requirements
          const userId = data?.user?.id;
          supabase.from('workers').select('mfa_enabled, biometric_data, email, name')
            .or(`auth_user_id.eq.${userId},email.ilike."${resolvedEmail}"`)
            .maybeSingle()
            .then(({ data: workerData, error: profileErr }) => {
              console.log('[AdminLogin] Auth Flow Evaluation:', {
                email: resolvedEmail,
                hasWorker: !!workerData,
                mfa: workerData?.mfa_enabled,
              });
              // If no worker profile found, still allow login (super admin may not be in workers table)
              if (!workerData) {
                _clearLockout();
                setLockout(null);
                onLogin(resolvedEmail);
                return;
              }
              const nextSteps = ['Password'];
              if (workerData?.mfa_enabled) nextSteps.push('OTP');
              setEnabledSteps(nextSteps);
              if (nextSteps.length > 1) {
                setStep(2);
                if (workerData?.mfa_enabled) triggerOtp().catch(console.error);
                setLoading(false);
              } else {
                _clearLockout();
                setLockout(null);
                onLogin(resolvedEmail);
              }
            }).catch((err) => {
              console.error('[AdminLogin] Profile Lookup Error:', err);
              // On MFA check error, still allow login rather than blocking
              _clearLockout();
              setLockout(null);
              onLogin(resolvedEmail);
            });
        }).catch(err => {
          setErr(err.message || 'Connection failed.');
          setLoading(false);
        });
        return;
      }
      // Demo/offline fallback
      const stored = secCfg.adminPwHash;
      const ok = stored ? _checkPw(pw, stored) : pw === DEFAULT_ADMIN_PW;
      if (!ok) { setErr('Incorrect password.'); setLoading(false); return; }
      setErr('');
      _clearLockout(); setLockout(null); onLogin();
    });
  };

  const sendOtp = () => {
    setLoading(true);
    setErr('');
    triggerOtp()
      .then((res) => {
        const { data: invokeData, error } = res || {};
        if (error || (invokeData && invokeData.error)) {
           const specificError = invokeData?.error || error?.message || 'Failed to resend code.';
           console.error('[AdminLogin] Resend OTP Error:', specificError);
           setErr(specificError);
        }
        setLoading(false);
      });
  };

  const stepTotp = () => {
    if (otpInput.length < 4) return;
    setLoading(true);
    
    import('@/config/supabaseClient').then(async ({ supabase }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      try {
        const res = await fetch(`${baseUrl}/functions/v1/verify-admin-otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ otp: otpInput })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          const msg = data.error || data.message || (res.status === 401 ? 'Unauthorized' : 'Invalid or expired code.');
          setErr(msg);
          setOtpInput(''); // Clear wrong OTP to stop the auto-submit loop
          setLoading(false);
          try { SFX.error(); } catch (e) { }
        } else {
          setErr('');
          /* 
          const hasBio = enabledSteps.includes('Biometric');
          if (hasBio) {
            setStep(enabledSteps.indexOf('Biometric') + 1);
            setLoading(false);
          } else {
            _clearLockout();
            setLockout(null);
            onLogin(loginEmail.trim());
          } 
          */
          _clearLockout();
          setLockout(null);
          onLogin(getResolvedEmail());
        }
      } catch (err) {
        console.error('[AdminLogin] Fetch Error:', err);
        setErr('Connection failed. Please check your internet.');
        setOtpInput(''); // Prevent auto-submit loop on error
        setLoading(false);
      }
    });
  };

  /* 
  const stepBio = async () => {
    // ... logic ...
  }; 
  */

  // Auto-submit for 4-digit OTP
  useEffect(() => {
    if (otpInput.length === 4 && !loading && enabledSteps[step-1] === 'OTP') {
      stepTotp();
    }
  }, [otpInput, loading]);

  // WebOTP for MFA
  useEffect(() => {
    if (step === 2 && !otpInput && !loading && 'OTPCredential' in window) {
      const ac = new AbortController();
      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
      }).then(otp => {
        setOtpInput(otp.code);
      }).catch(err => {
        if (err.name !== 'AbortError') console.log('[WebOTP MFA] Error:', err);
      });
      return () => ac.abort();
    }
  }, [step, loading]);

  // Resend Countdown Timer
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);


  const steps = enabledSteps;
  return (
    <div style={{ minHeight: '100vh', background: '#02060C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.body, padding: 16, position: 'relative', overflow: 'hidden' }}>

      {/* Animated Immersive Background Elements */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: `radial-gradient(circle, ${T.accent}15 0%, transparent 70%)`, filter: 'blur(80px)', animation: 'float 20s infinite alternate', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '45%', height: '45%', background: `radial-gradient(circle, ${T.gold}10 0%, transparent 70%)`, filter: 'blur(100px)', animation: 'float 25s infinite alternate-reverse', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '20%', right: '10%', width: '30%', height: '30%', background: `radial-gradient(circle, ${T.blue}10 0%, transparent 70%)`, filter: 'blur(90px)', animation: 'float 18s infinite alternate', pointerEvents: 'none' }} />

      <style>{`
        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(40px, 40px) scale(1.1); }
        }
        .login-card {
           background: rgba(13, 20, 33, 0.65);
           backdrop-filter: blur(24px);
           -webkit-backdrop-filter: blur(24px);
           border: 1px solid rgba(255, 255, 255, 0.08);
           border-top: 1px solid rgba(255, 255, 255, 0.15);
           box-shadow: 0 40px 100px rgba(0,0,0,0.6);
           width: 100%;
           max-width: 420px;
           border-radius: 32px;
           padding: 48px 40px;
           position: relative;
           z-index: 10;
        }
        .login-input {
           transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .login-input:focus {
           border-color: var(--accent) !important;
           box-shadow: 0 0 0 4px rgba(0, 212, 170, 0.15) !important;
        }
      `}</style>

      <div className="login-card pop">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
             <div style={{ width: 64, height: 64, borderRadius: 20, background: `linear-gradient(135deg, ${T.accent}, #00BFA5)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 40px ${T.accent}30` }}>
                <Lock size={32} color="#000" strokeWidth={2.5} />
             </div>
          </div>
          <div style={{ fontFamily: T.head, color: '#fff', fontSize: 32, fontWeight: 900, letterSpacing: '-0.04em' }}>{cfg.portalName || 'Adequate'}</div>
          <div style={{ color: T.accent, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginTop: -2 }}>Secure Portal</div>
        </div>

        {/* ── LOCKOUT STATE ─────────────────────── */}
        {locked && !showRecovery && (
          <div style={{ textAlign: 'center' }}>
            {/* ... rest of existing lockout UI ... */}
            <div style={{ color: T.danger, fontWeight: 900, fontSize: 18, fontFamily: T.head, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
               <ShieldAlert size={20} /> Access Restricted
            </div>
            <div style={{ color: T.dim, fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>Too many failed attempts. Security protocol activated.</div>

            <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto 24px' }}>
              <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="65" cy="65" r="58" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <circle cx="65" cy="65" r="58" fill="none" stroke={T.danger} strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 58}`}
                  strokeDashoffset={`${2 * Math.PI * 58 * (1 - countdown / 900)}`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: T.danger, fontFamily: T.mono, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{fmtCountdown(countdown)}</div>
                <div style={{ color: T.dim, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Locked</div>
              </div>
            </div>

            <div style={{ color: T.dim, fontSize: 13, marginBottom: 20 }}>
              {countdown > 0 ? `Unlocks automatically in ${fmtCountdown(countdown)}` : 'Lockout expired — you can try again now.'}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '20px', marginBottom: 20 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><ShieldAlert size={16} color={T.accent} /> System Locked</div>
              <p style={{ color: T.dim, fontSize: 12, marginBottom: 16 }}>Use your registered phone to restore access immediately.</p>
              <Btn full v="accent" onClick={() => { setShowRecovery(true); setRecSent(false); }} style={{ borderRadius: 12 }}>Recover via Phone →</Btn>
            </div>

            {countdown === 0 && (
              <Btn full onClick={() => { setErr(''); setPw(''); }}>Try Again Now →</Btn>
            )}
          </div>
        )}

        {/* ── RECOVERY CODE ENTRY ──────────────── */}
        {showRecovery && (
          <div>
            <button onClick={() => { setShowRecovery(false); setRecErr(''); setRecSent(false); }}
              className="nb"
              style={{ background: 'none', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <ChevronLeft size={16} /> Back to Login
            </button>

            {!recSent ? (
              <div className="fade-in">
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 20, background: `${T.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, margin: '0 auto 16px' }}>
                    <Smartphone size={32} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>Identity Recovery</h3>
                  <p style={{ fontSize: 14, color: T.dim, marginTop: 4 }}>Verify your identity via registered phone.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                   <div style={{ position: 'relative' }}>
                      <input 
                        type="tel" 
                        placeholder="Registered Phone Number" 
                        value={loginPhone} 
                        onChange={e => setLoginPhone(e.target.value)}
                        className="login-input"
                        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: `1px solid ${T.hi}`, borderRadius: 16, padding: '16px 20px', color: '#fff', fontSize: 15, fontWeight: 600, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                      />
                   </div>
                   {recErr && <div style={{ color: T.danger, fontSize: 12, textAlign: 'center', background: 'rgba(255,71,87,0.1)', padding: '10px', borderRadius: 12 }}>⚠ {recErr}</div>}
                   
                   <Btn full loading={loading} onClick={() => sendRecoveryCode('phone')} style={{ height: 52, borderRadius: 16 }}>
                      Send Recovery Code →
                   </Btn>
                   
                   <div style={{ textAlign: 'center', marginTop: 8 }}>
                      <button 
                        onClick={() => { setRecSent(true); setRecErr(''); }}
                        style={{ background: 'none', border: 'none', color: T.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: 0.8 }}>
                        Already have a code? Manual Entry
                      </button>
                   </div>
                </div>
              </div>
            ) : (
              <div className="fade-in">
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 20, background: `${T.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, margin: '0 auto 16px' }}>
                    <Lock size={32} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>Enter Recovery Code</h3>
                  <p style={{ fontSize: 14, color: T.dim, marginTop: 4 }}>Code sent to your phone ending in {loginPhone.slice(-4) || '....'}</p>
                </div>

                <input
                  value={recInput}
                  onChange={e => setRecInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: `1px solid ${T.hi}`, borderRadius: 16, padding: '16px', color: T.accent, fontSize: 32, fontWeight: 900, letterSpacing: 12, textAlign: 'center', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
                />
                {recErr && (
                  <div style={{ background: 'rgba(255,71,87,0.1)', padding: '16px', borderRadius: 16, marginBottom: 20, border: '1px solid rgba(255,71,87,0.2)' }}>
                    <div style={{ color: T.danger, fontSize: 13, textAlign: 'center', fontWeight: 800, marginBottom: 8 }}>⚠ {recErr}</div>
                    {recErr.includes('Account Link Error') && (
                      <div className="fade-in" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
                        <p style={{ color: T.dim, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>We verified your phone, but could not find your admin profile in the local cache. Please enter your admin email manually to finish:</p>
                        <input 
                          type="email"
                          placeholder="Admin Email Address"
                          value={loginEmail}
                          onChange={e => setLoginEmail(e.target.value)}
                          className="login-input"
                          style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: `1px solid ${T.hi}`, borderRadius: 12, padding: '12px', color: '#fff', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
                        />
                        <Btn full onClick={() => {
                          if (!loginEmail.includes('@')) { setRecErr('Please enter a valid admin email.'); return; }
                          sessionStorage.setItem('acl_recovery_lock', 'true');
                          sessionStorage.setItem('acl_start_screen', 'securitysettings');
                          onLogin(loginEmail.trim());
                        }}>Unlock Account Now →</Btn>
                      </div>
                    )}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <Btn full loading={loading} onClick={verifyRecoveryCode} style={{ height: 52, borderRadius: 16 }}>Verify & Unlock →</Btn>
                  <Btn v="secondary" onClick={() => sendRecoveryCode(recMethod)} style={{ height: 52, borderRadius: 16, width: 100 }}>Resend</Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NORMAL LOGIN ─────────────────────── */}
        {!locked && !showRecovery && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
              {steps.map((s, i) => {
                const done = step > i + 1, active = step === i + 1;
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 10,
                      background: done ? T.accent : active ? `${T.accent}20` : 'transparent',
                      border: `1.5px solid ${done || active ? T.accent : 'rgba(255,255,255,0.1)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 900, color: done ? '#000' : active ? T.accent : T.dim,
                      transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    }}>
                      {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                    </div>
                    {active && <span style={{ fontSize: 12, color: T.txt, fontWeight: 800, letterSpacing: -0.2 }}>{s}</span>}
                  </div>
                );
              })}
            </div>
            {err && <Alert type='danger' style={{ marginBottom: 20, borderRadius: 14 }}>⚠ {err}</Alert>}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <FI label='Email or Username' type='text' value={loginEmail} onChange={setLoginEmail} placeholder=''
                   onKeyDown={(e) => { if (e.key === 'Enter' && !loading) stepPw(); }} />
                
                <div style={{ position: 'relative' }}>
                  <FI label='System Password' type='password' value={pw} onChange={setPw} placeholder='••••••••'
                     hint='Secure encrypted connection'
                     onKeyDown={(e) => { if (e.key === 'Enter' && !loading) stepPw(); }} />
                  <button 
                    onClick={() => {
                      setRecErr('');
                      setRecSent(false);
                      setShowRecovery(true);
                    }}
                    className="nb"
                    style={{ 
                      position: 'absolute', 
                      top: -2, 
                      right: 4, 
                      background: 'none', 
                      border: 'none', 
                      color: T.accent, 
                      fontSize: 10, 
                      cursor: 'pointer', 
                      fontWeight: 800, 
                      textTransform: 'none', 
                      letterSpacing: '0.05em',
                      opacity: 0.7, 
                      transition: 'opacity 0.2s',
                      padding: '4px 8px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                  >
                    Forgot Password?
                  </button>
                </div>

                <Btn onClick={stepPw} loading={loading} full style={{ height: 52, borderRadius: 16, fontSize: 16, fontWeight: 850, marginTop: 8 }}>
                   Sign In <ChevronRight size={18} style={{ marginLeft: 4 }} />
                </Btn>
              </div>
            )}
            {(step===2 || step===3) && enabledSteps[step-1]==='OTP' && (
              <div>
                <div style={{textAlign:'center',marginBottom:18}}>
                  <div style={{color:T.txt,fontWeight:800,fontFamily:T.head,fontSize:15,marginBottom:5}}>One-Time Password</div>
                  <div style={{color:T.muted,fontSize:12}}>A 4-digit code was sent to your phone.</div>
                </div>

                <input 
                  value={otpInput} 
                  onChange={e=>setOtpInput(e.target.value.replace(/\D/g,'').slice(0,4))} 
                  placeholder='••••' 
                  maxLength={4}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  onKeyDown={e => { if(e.key === 'Enter' && !loading) stepTotp(); }}
                  style={{width:'100%',background:T.surface,border:`1px solid ${T.hi}`,borderRadius:10,padding:'13px',color:T.accent,fontSize:32,fontWeight:800,letterSpacing:20,textAlign:'center',outline:'none',marginBottom:7,boxSizing:'border-box'}}/>
                <div style={{display:'flex',gap:8,marginBottom:8}}>
                  <Btn 
                    v='secondary' 
                    onClick={sendOtp} 
                    full 
                    disabled={resendCountdown > 0 || loading}
                  >
                    {resendCountdown > 0 ? `Resend Code (${resendCountdown}s)` : 'Resend Code'}
                  </Btn>
                </div>
                <Btn onClick={stepTotp} loading={loading} full style={{ height: 52, borderRadius: 16 }}>Verify & Enter →</Btn>
                <button onClick={() => setStep(1)} className="nb" style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: T.dim, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: 0.6 }}>← Back to Sign In</button>
              </div>
            )}
            {/* 
            {(step===2 || step===3) && enabledSteps[step-1]==='Biometric' && (
               ... biometric UI ...
            )} 
            */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '28px 0' }} />
            <button
              onClick={onWorkerPortal}
              className="hover-pop"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '14px', color: T.accent, fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s' }}
            >
              👷 Access Worker Portal <ChevronRight size={16} />
            </button>
            <div style={{ color: T.dim, fontSize: 11, textAlign: 'center', marginTop: 16, fontWeight: 500 }}>
               Protected by AES-256 standard encryption
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StylesMemo = memo(Styles);

// ═══════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════

const LOANS_FAST = 200;
const CUSTOMERS_FAST = 200;
const PAYMENTS_FAST = 500;
const LOANS_MAX = 2000;
const PAYMENTS_MAX = 5000;
const CUSTOMERS_MAX = 5000;
const CUSTOMERS_PAGE = 200;

export default function App() {
  const { session, worker, loading: authLoading, signOut, DEMO_MODE } = useAuth();
  const [cfg, setCfg] = useState(getSecConfig());

  // Dynamic Branding Integration
  useEffect(() => {
    if (cfg?.primaryColor) {
      document.documentElement.style.setProperty('--accent', cfg.primaryColor);
      // Update related shades for glassmorphism
      document.documentElement.style.setProperty('--a-lo', `${cfg.primaryColor}15`);
      document.documentElement.style.setProperty('--a-mid', `${cfg.primaryColor}30`);
    }
  }, [cfg.primaryColor]);
  const [mode, _setMode] = useState(() => {
    try {
      return localStorage.getItem('acl_mode') || 'admin-login';
    } catch (e) {
      return 'admin-login';
    }
  });
  const setMode = useCallback((m) => {
    _setMode(m);
    try {
      localStorage.setItem('acl_mode', m);
    } catch (e) {}
  }, []);
  const [dataLoaded,setDataLoaded] = useState(false);
  const [adminStartScreen, setAdminStartScreen] = useState(null);

  const [loans,        setLoans]        = useState([]);
  const [customers,    setCustomers]    = useState([]);
  const [payments,     setPayments]     = useState([]);
  const [leads,        setLeads]        = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [workers,      setWorkers]      = useState(SEED_WORKERS);
  const [auditLog,     setAuditLog]     = useState([]);
  
  // ── Local cache (speed up first paint after login) ──────────────────────────
  const CACHE_KEY = 'acl_cache_v4'; // bumped: v3 had stale empty-customers bug, v4 starts clean
  const readCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch(e){ return null; }
  };
  const writeCache = (next) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...next, ts: Date.now() })); } catch(e){}
  };

  // Immediate Cache Restoration
  useLayoutEffect(() => {
    const cache = readCache();
    if (cache) {
      // Use .length guard — empty arrays are truthy in JS, so `if ([])` is true
      // and would incorrectly restore an empty cache over real state
      if (cache.loans?.length)     setLoans(cache.loans);
      if (cache.customers?.length) setCustomers(cache.customers);
      if (cache.payments?.length)  setPayments(cache.payments);
      if (cache.workers?.length)   setWorkers(cache.workers);
      // If we have any data, we can skip the heavy sync screen
      if (cache.ts && (cache.loans?.length || cache.customers?.length)) {
        setDataLoaded(true);
      }
    }
  }, []);
  const hasLoadedRef = useRef(false);
  const [unallocatedC2BCount, setUnallocatedC2BCount] = useState(0);
  const [repossessedAssets, setRepossessedAssets] = useState([]);
  const [stkRequests, setStkRequests] = useState([]);
  const [b2cDisbursements, setB2cDisbursements] = useState([]);
  const [targets, setTargets] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [workerDeductions, setWorkerDeductions] = useState([]);
  const [workerAdditions, setWorkerAdditions] = useState([]);
  const [mpesaTransactions, setMpesaTransactions] = useState([]);

  const { toasts, show: showToast } = useToast();
  const [globalCustomerId, setGlobalCustomerId] = useState(null);
  const [globalCustomerTab, setGlobalCustomerTab] = useState('overview');



  // ── Load all data from Supabase (after session is available) ──────────────────
  const loadAllData = useCallback(async () => {
    try {
      const { supabase, DEMO_MODE } = await import('@/config/supabaseClient');
      if (DEMO_MODE || !supabase) { setDataLoaded(true); return; }

      // Use current session from useAuth if possible, otherwise get it
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        setDataLoaded(true);
        return;
      }

      // ─── fetchAll: pages through a Supabase table with no hardcoded row limit ───
      // Fetches rows 1000 at a time until the DB returns fewer than PAGE_SIZE rows,
      // meaning all records have been retrieved. Works correctly for any table size.
      const PAGE_SIZE = 1000;
      const fetchAll = async (queryBuilder) => {
        let allRows = [];
        let offset = 0;
        while (true) {
          const { data, error } = await queryBuilder(offset, offset + PAGE_SIZE - 1);
          if (error) { console.error('[fetchAll error]', error.message); break; }
          if (!data || data.length === 0) break;
          allRows = allRows.concat(data);
          if (data.length < PAGE_SIZE) break; // last page — we have everything
          offset += PAGE_SIZE;
        }
        return allRows;
      };

      // Load all data with constants in scope

      // Fire individual requests and update as they come.
      // NOTE: We capture loaded data in local vars to avoid stale closure bug —
      // loadAllData has [] deps so loans/customers/payments/workers are always []
      // in the closure. Using the actual fetched data ensures the cache is correct.
      let _loadedLoans = [];
      let _loadedCustomers = [];
      let _loadedPayments = [];
      let _loadedWorkers = [];

      const load = (promise, setter, mapper) => promise.then(({data, error}) => {
        if (!error && data) setter(mapper ? data.map(mapper) : data);
        return { data, error };
      });

      const promises = [
        // Loans — fetch ALL records with no cap, paging automatically
        fetchAll((from, to) => supabase.from('loans').select('*').order('created_at', { ascending: false }).range(from, to))
          .then(data => {
            _loadedLoans = data.map(fromSupabaseLoan);
            setLoans(_loadedLoans);
            return { data, error: null };
          }),
        load(supabase.from('customers').select('id,name,phone,alt_phone,id_no,business,location,residence,officer,loans,risk,gender,dob,blacklisted,bl_reason,n1_name,n1_phone,n1_relation,n2_name,n2_phone,n2_relation,n3_name,n3_phone,n3_relation,joined,created_at,status,assigned_officer,mpesa_registered,business_name,business_type,business_location,gps_coordinates,id_number,account_number,uses_id_as_account,onboarded_by,kyc_status,credit_limit,limit_suspended,suspended_baseline_limit,last_overdue_clear_date,interest_discount,settled_loans_at_limit_increase').order('name', { ascending: true }).range(0, CUSTOMERS_FAST - 1), setCustomers, fromSupabaseCustomer)
          .then(r => { if (!r.error && r.data) _loadedCustomers = r.data.map(fromSupabaseCustomer); return r; }),
        // Payments — fetch ALL records with no cap, paging automatically
        fetchAll((from, to) => supabase.from('payments').select('*').order('date', { ascending: false }).range(from, to))
          .then(data => {
            _loadedPayments = data.map(fromSupabasePayment);
            setPayments(_loadedPayments);
            return { data, error: null };
          }),
        load(supabase.from('workers').select('*').order('name'), setWorkers, fromSupabaseWorker)
          .then(r => { if (!r.error && r.data) _loadedWorkers = r.data.map(fromSupabaseWorker); return r; }),
        load(supabase.from('mpesa_transactions').select('*').order('created_at', { ascending: false }).limit(200), (data) => {
          setMpesaTransactions(data);
          setUnallocatedC2BCount(data.filter(tx => tx.allocation_status === 'unallocated').length);
        }),
        load(supabase.from('leads').select('*').order('date', { ascending: false }).limit(50), setLeads, fromSupabaseLead),
        load(supabase.from('interactions').select('*').order('date', { ascending: false }).limit(50), setInteractions, fromSupabaseInteraction),
        load(supabase.from('audit_log').select('*').order('ts', { ascending: false }).limit(50), setAuditLog)
      ];

      // Show UI as soon as customers load — they're the first thing needed on screen.
      // Hard 3s timeout ensures the loading screen NEVER blocks indefinitely.
      let uiReady = false;
      const showUI = () => {
        if (uiReady) return;
        uiReady = true;
        setDataLoaded(true);
      };

      // Fastest path: customers loaded → show UI immediately
      promises[1].then(showUI);

      // Hard fallback: if 3 seconds pass and we're still loading, show anyway
      const timeout = setTimeout(showUI, 3000);

      // After all 4 essentials finish, write cache
      Promise.all(promises.slice(0, 4)).finally(() => {
        clearTimeout(timeout);
        showUI(); // no-op if already shown
        writeCache({
          loans:     _loadedLoans,
          customers: _loadedCustomers,
          payments:  _loadedPayments,
          workers:   _loadedWorkers,
        });
      });
      // Data sync completed.

      // Phase 1b (background): fetch auxiliary tables only.
      // Loans + payments are already fully loaded above via fetchAll.
      setTimeout(async () => {
        if (!supabase) return;
        Promise.all([
          supabase.from('monthly_targets').select('*'),
          supabase.from('salary_payments').select('*').order('created_at', { ascending: false }).limit(1000),
          supabase.from('leads').select('*').order('date', { ascending: false }).limit(1000),
          supabase.from('interactions').select('*').order('date', { ascending: false }).limit(1000),
          supabase.from('repossessed_assets').select('*').order('possession_date', { ascending: false }),
          supabase.from('stk_requests').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('b2c_disbursements').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('mpesa_transactions').select('*').order('created_at', { ascending: false }).limit(1000),
        ]).then(async ([tFull, sFull, leadFull, intFull, assetFull, stkFull, b2cFull, mFull]) => {
          if (!mFull.error || mFull.error?.code === '42P01') {
            if (mFull.data) {
              setMpesaTransactions(mFull.data);
              setUnallocatedC2BCount(mFull.data.filter(tx => tx.allocation_status === 'unallocated').length);
            }
          }
          if (!tFull.error && tFull.data) setTargets(tFull.data);
          if (!sFull.error && sFull.data) setSalaryPayments(sFull.data);
          if (!leadFull.error && leadFull.data) setLeads(leadFull.data.map(fromSupabaseLead));
          if (!intFull.error && intFull.data) setInteractions(intFull.data.map(fromSupabaseInteraction));
          if (!assetFull.error && assetFull.data) setRepossessedAssets(assetFull.data.map(fromSupabaseAsset));
          if (!stkFull.error || stkFull.error?.code === '42P01') {
            if (stkFull.data) setStkRequests(stkFull.data);
          } else { console.warn('[load stk_requests]', stkFull.error.message); }
          if (!b2cFull.error || b2cFull.error?.code === '42P01') {
            if (b2cFull.data) setB2cDisbursements(b2cFull.data);
          } else { console.warn('[load b2c_disbursements]', b2cFull.error.message); }

          // Update cache with salary payments
          const currentCache = readCache();
          if (currentCache && (!sFull.error && sFull.data)) {
            writeCache({ ...currentCache, salaryPayments: sFull.data });
          }
        }).catch((err) => console.error('[load auxiliary tables]', err?.message || err));

        // Detect fresh state after load
        if (workers.length === 0 && customers.length === 0 && loans.length === 0) {
          const { data: wCount } = await supabase.from('workers').select('*', { count: 'exact', head: true });
          if (wCount === 0) {
             setMode('welcome');
          }
        }

        // Customers (paged for large databases)
        (async () => {
          try {
            if (customers.length < CUSTOMERS_FAST) return;

            let offset = CUSTOMERS_FAST;
            let combined = [...customers];
            while (true) {
              const { data, error } = await supabase
                .from('customers')
                .select('id,name,phone,alt_phone,id_no,business,location,residence,officer,loans,risk,gender,dob,blacklisted,bl_reason,n1_name,n1_phone,n1_relation,n2_name,n2_phone,n2_relation,n3_name,n3_phone,n3_relation,joined,created_at,status,assigned_officer,mpesa_registered,business_name,business_type,business_location,gps_coordinates,id_number,account_number,uses_id_as_account,onboarded_by,kyc_status,credit_limit,limit_suspended,suspended_baseline_limit,last_overdue_clear_date,interest_discount,settled_loans_at_limit_increase')
                .order('name')
                .range(offset, offset + (CUSTOMERS_PAGE || 200) - 1);

              if (error) { console.error('[load customers page]', error.message); break; }
              const page = (data && data.length) ? data.map(fromSupabaseCustomer) : [];
              if (page.length === 0) break;

              combined = combined.concat(page);
              offset += (CUSTOMERS_PAGE || 200);

              setCustomers(prev => {
                const next = [...prev];
                page.forEach(c => {
                  const idx = next.findIndex(x => x.id === c.id);
                  if (idx >= 0) {
                    if (next[idx]._isSynthesized || Object.keys(c).length > Object.keys(next[idx]).length) next[idx] = c;
                  } else {
                    next.push(c);
                  }
                });
                return next;
              });
              writeCache({
                loans: (readCache()?.loans) || loans,
                customers: combined,
                payments: (readCache()?.payments) || payments,
              });

              await new Promise(r => setTimeout(r, 50));

              // Stop when we got a partial page (means we've reached the end)
              if (page.length < (CUSTOMERS_PAGE || 200)) break;
            }
          } catch (e) {
            console.error('[load customers paged]', e?.message || e);
          }
        })();
      }, 300); // slight delay so first paint happens before background work

    } catch (err) {
      console.error('[loadAllData] fatal:', err);
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return; // Don't act until Supabase has finished restoring the session
    if (hasLoadedRef.current) return;

    if (session) {
      hasLoadedRef.current = true;
      loadAllData();
    } else {
      setDataLoaded(true); // No session — allow login screen to show
    }
  }, [authLoading, session, loadAllData]);

  const ADMIN_ROLES = ['admin', 'Admin', 'Super Admin', 'Director'];

  // ── Sync mode from AuthContext session ──────────────────────────────────────
  // IMPORTANT: authLoading is true while Supabase restores a persisted session
  // from localStorage. We must NOT redirect to login until loading is false,
  // otherwise every page refresh triggers a login flash.
  useEffect(() => {
    if (authLoading) return; // Wait for session hydration to complete

    const isVerified = localStorage.getItem('acl_mfa_verified') === 'true';
    const isRecoveryLock = sessionStorage.getItem('acl_recovery_lock') === 'true';

    // 1. IRON-CLAD BYPASS: Recovery lockdown
    if (isRecoveryLock) {
      if (mode !== 'admin') setMode('admin');
      return;
    }

    // 1.5 Security Fix: If there is no active session, revoke any lingering MFA verification
    if (!session && !DEMO_MODE) {
      localStorage.removeItem('acl_mfa_verified');
      sessionStorage.removeItem('acl_mfa_verified');
    }

    // Re-evaluate isVerified since we might have just cleared it
    const isActuallyVerified = localStorage.getItem('acl_mfa_verified') === 'true' || sessionStorage.getItem('acl_mfa_verified') === 'true';

    // 2. Handle Authentication
    if (session || DEMO_MODE) {
      // If worker profile is still loading (and not in demo mode), stay on login for safety.
      // IMPORTANT: Skip this guard when mode === 'worker' — the WorkerPortal manages its
      // own internal login state. Supabase SIGNED_IN events from WorkerPortal.login() also
      // fire here and would incorrectly bounce the worker back to admin-login while their
      // profile is still being fetched from the workers table.
      if (!worker && !DEMO_MODE && mode !== 'worker') {
        if (mode !== 'admin-login') setMode('admin-login');
        return;
      }

      // MFA Gate: If enabled, DO NOT proceed until verified.
      // Skip entirely when mode === 'worker' — WorkerPortal has its own session
      // and acl_mfa_verified is only set by the admin login flow, never by WorkerPortal.
      if (mode !== 'worker' && worker?.mfa_enabled && !isActuallyVerified) {
        if (mode !== 'admin-login') setMode('admin-login');
        return; // HALT HERE
      }

      // Security Policy: Even if a session exists, do not auto-redirect to dashboard 
      // if we are currently on the login screen, UNLESS explicitly verified this session.
      // For non-admin workers, they do not have admin access and thus bypass the MFA gate.
      if (mode === 'admin-login') {
        const isAdmin = DEMO_MODE || (worker && ADMIN_ROLES.includes(worker.role));
        if (worker && !isAdmin) {
          setMode('worker');
        } else if (isActuallyVerified) {
          setMode('admin');
        }
      }
    } else if (mode !== 'admin-login' && mode !== 'welcome' && mode !== 'worker') {
      // Session truly gone (logged out or expired) — force back to login
      setMode('admin-login');
    }
  }, [authLoading, session, worker, mode, setMode, DEMO_MODE]);

  const handleLogout = useCallback(async () => {
    try {
      sessionStorage.removeItem('acl_mfa_verified');
      sessionStorage.removeItem('acl_mode');
    } catch (e) {}
    try {
      localStorage.removeItem('acl_mfa_verified');
      localStorage.removeItem('acl_mode');
      localStorage.removeItem(CACHE_KEY);
    } catch (e) {}
    await signOut();
    setMode('admin-login');
  }, [signOut, setMode]);

  // Inactivity Timeout
  useEffect(() => {
    if (mode === 'admin-login' || mode === 'welcome') return;
    const timeoutMins = cfg?.sessionTimeout || 15;
    const timeoutMs = timeoutMins * 60 * 1000;
    
    let timeoutId;
    let lastActive = Date.now();
    
    const checkTimeout = () => {
      if (Date.now() - lastActive >= timeoutMs) {
        handleLogout();
        showToast('Logged out due to inactivity', 'info');
        return true;
      }
      return false;
    };

    const resetTimer = () => {
      lastActive = Date.now();
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        checkTimeout();
      }, timeoutMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const loggedOut = checkTimeout();
        if (!loggedOut) {
          resetTimer();
        }
      }
    };
    
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('scroll', resetTimer);
    window.addEventListener('click', resetTimer);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    resetTimer(); // init
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('click', resetTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mode, cfg?.sessionTimeout, handleLogout, showToast]);

  const handleLogin = (email) => {
    SFX.login();
    sessionStorage.setItem('acl_mfa_verified', 'true');
    localStorage.setItem('acl_mfa_verified', 'true');
    
    // Check for recovery redirect
    const startScreen = sessionStorage.getItem('acl_start_screen');
    if (startScreen) {
      setAdminStartScreen(startScreen);
      sessionStorage.removeItem('acl_start_screen');
    }

    // Immediately set mode to avoid "hanging" on the login screen while importing config
    setMode('admin');

    import('@/config/supabaseClient').then(({supabase,DEMO_MODE})=>{
      if(!DEMO_MODE && supabase && email){
        // Now that auth succeeded, load the protected data immediately.
        // This restores customers/loans/payments that are hidden when unauthenticated.
        loadAllData();
        const currTs = new Date().toISOString();
        sbAuditInsert({
          ts: currTs,
          user_name: email.trim(),
          action: 'Admin Login',
          target_id: 'System',
          detail: 'Login successful via Admin Portal'
        }).catch(console.error);
        setAuditLog(l => [{ ts: ts(), user: email.trim(), action: 'Admin Login', target: 'System', detail: 'Login successful via Admin Portal' }, ...l].slice(0, 10));
        supabase.from('workers').select('role').eq('email', email.trim()).maybeSingle()
          .then(({data,error})=>{
            const role = (!error&&data)?data.role:null;
            if (role && !ADMIN_ROLES.includes(role)) setMode('worker');
          }).catch(()=>{});
        return;
      }
      const w = SEED_WORKERS.find(w=>w.email===email?.trim());
      setMode(w&&!ADMIN_ROLES.includes(w.role)?'worker':'admin');
    }).catch(()=>setMode('admin'));
  };

  const shared={
    loans,setLoans,customers,setCustomers,workers,setWorkers,payments,setPayments,
    leads,setLeads,interactions,setInteractions,auditLog,setAuditLog,
    unallocatedC2BCount,setUnallocatedC2BCount,repossessedAssets,setRepossessedAssets,
    stkRequests, setStkRequests, b2cDisbursements, setB2cDisbursements,
    mpesaTransactions, setMpesaTransactions,
    targets,setTargets,salaryPayments,setSalaryPayments,workerDeductions,setWorkerDeductions,
    workerAdditions,setWorkerAdditions,
    onOpenCustomerProfile: (id, tab = 'overview') => { 
      setGlobalCustomerId(id); 
      setGlobalCustomerTab(tab);
    }, onRefresh: loadAllData,
    onGlobalReset: () => setMode('welcome'),
    cfg, setCfg // Shared branding state
  };

  // While Supabase is restoring the persisted session, show a neutral splash
  // screen instead of the login form to avoid the flash-of-login-screen effect.
  if (authLoading) return (
    <>
      <StylesMemo/>
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontFamily: T.head, color: T.accent, fontWeight: 900, fontSize: 22, letterSpacing: -.5 }}>Adequate Capital</div>
        <div style={{ width: 32, height: 32, border: '3px solid ' + T.border, borderTop: `3px solid ${T.accent}`, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );

  return (
    <>
      <StylesMemo/>
      {mode==='admin-login'&&<AdminLogin onLogin={handleLogin} onWorkerPortal={()=>setMode('worker')} session={session} worker={worker} cfg={cfg} workers={workers} showToast={showToast} />}
      {mode==='admin' && (!dataLoaded ? (
        <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:20}}>
          <div style={{fontFamily:T.head,color:T.accent,fontWeight:900,fontSize:22,letterSpacing:-.5}}>Adequate Capital</div>
          <div style={{width:32,height:32,border:'3px solid ' + T.border,borderTop:'3px solid ' + T.accent,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
          <div style={{color:T.muted,fontSize:13,fontFamily:T.body,fontWeight:500}}>Hydro-syncing workspace…</div>
        </div>
      ) : <AdminPanel {...shared} showToast={showToast} onLogout={handleLogout} initialScreen={adminStartScreen}/>)}
      {mode==='worker'&&<WorkerPortal {...shared} showToast={showToast} dataLoaded={dataLoaded} onBack={handleLogout} worker={worker} session={session}/>}
      {mode === 'welcome' && (
        <WelcomeExperience 
          onStartSetup={(targetScreen) => {
            setAdminStartScreen(targetScreen);
            setMode('admin'); 
            setDataLoaded(true);
          }} 
          onLogout={handleLogout} 
        />
      )}

      <ToastContainer toasts={toasts}/>

      {/* Global Customer Profile Overlay */}
      {globalCustomerId && (
        <CustomerProfile
          key={globalCustomerId}
          customerId={globalCustomerId}
          initialTab={globalCustomerTab}
          onSelectLoan={(row) => { setGlobalCustomerId(null); /* Could add navigation here later */ }}
          workerContext={mode === 'worker' ? worker : { role: 'admin', name: 'Admin' }}
          onClose={(e) => { if(e) e.stopPropagation(); setGlobalCustomerId(null); }}
          loans={loans} setLoans={setLoans}
          payments={payments} setPayments={setPayments}
          interactions={interactions} setInteractions={setInteractions}
          customers={customers} setCustomers={setCustomers}
          workers={workers} setWorkers={setWorkers}
          addAudit={(action, target, detail) => {
            const userName = worker?.name || session?.user?.email || 'admin';
            const entry = { ts: ts(), user: userName, action, target, detail };
            setAuditLog(l => [entry, ...l].slice(0, 10));
            sbAuditInsert({
              ts: new Date().toISOString(),
              user_name: entry.user,
              action: entry.action,
              target_id: String(entry.target),
              detail: entry.detail
            }).catch(console.error);
          }}
          onRefresh={loadAllData}
          showToast={showToast}
        />

      )}
    </>
  );
}



// ═══════════════════════════════════════════
//  WELCOME EXPERIENCE (AFTER RESET)
// ═══════════════════════════════════════════
const WelcomeExperience = ({ onStartSetup, onLogout }) => {
  return (
    <div className="fade" style={{ minHeight: '100vh', background: '#02060C', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ background: T.aLo, width: 80, height: 80, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: T.accent, border: `1px solid ${T.accent}30` }}>
            <Zap size={40} fill={T.accent} style={{ opacity: 0.8 }} />
          </div>
          <h1 style={{ fontFamily: T.head, fontSize: 40, fontWeight: 900, marginBottom: 16, letterSpacing: '-0.03em' }}>System Initialized.</h1>
          <p style={{ color: T.muted, fontSize: 18, lineHeight: 1.6 }}>Welcome to your fresh LMS workspace. The database has been cleared and is ready for your unique configuration.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr)', gap: 20 }}>
          <Card onClick={() => onStartSetup('settings')} style={{ padding: 32, borderRadius: 32, cursor: 'pointer', border: `1px solid ${T.border}`, textAlign: 'left', transition: 'all .3s ease', background: T.surface }} className="hover-scale">
            <div style={{ width: 48, height: 48, background: `${T.accent}20`, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, marginBottom: 20 }}>
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: T.txt }}>Setup Admin</h3>
            <p style={{ fontSize: 14, color: T.muted }}>Configure your root administrative credentials and system preferences.</p>
            <div style={{ marginTop: 20, color: T.accent, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              Get Started <ArrowRight size={14} />
            </div>
          </Card>

          <Card onClick={() => onStartSetup('workers')} style={{ padding: 32, borderRadius: 32, cursor: 'pointer', border: `1px solid ${T.border}`, textAlign: 'left', background: T.surface }} className="hover-scale">
            <div style={{ width: 48, height: 48, background: `${T.warn}20`, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.warn, marginBottom: 20 }}>
              <Users size={24} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: T.txt }}>Build Team</h3>
            <p style={{ fontSize: 14, color: T.muted }}>Start adding your loan officers and collection agents to the platform.</p>
            <div style={{ marginTop: 20, color: T.warn, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              Next Step <ArrowRight size={14} />
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 48 }}>
           <Btn onClick={onLogout} v="ghost" style={{ opacity: 0.6 }}>Back to Login Screen</Btn>
        </div>
      </div>
    </div>
  );
};
