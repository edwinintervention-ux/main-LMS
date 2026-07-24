import CustomerProfile from "@/modules/customers/CustomerProfile";
import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import {
  TrendingUp, Calendar, AlertTriangle, CreditCard, XCircle, ClipboardList, 
  Users, UserCog, Lock, BarChart, Download, FileSpreadsheet, FileText, 
  FileCode, Filter, ChevronRight, PieChart, Activity, ShieldCheck, 
  Phone, Briefcase, MapPin, UserPlus, Search as SearchIcon
} from 'lucide-react';
import {
  T, SC, RC, SFX, Card, CH, KPI, DT, Btn, Badge, Av, Bar, BackBtn, RefreshBtn,
  FI, PhoneInput, NumericInput, Search, Pills, Alert, Dialog, ConfirmDialog, ToastContainer,
  LoanModal, LoanForm, RepayTracker, CustomerDetail,
  fmt, fmtM, now, uid, ts, escHtml, toCSV, dlCSV, buildFullBackup,
  calculateLoanStatus, toSupabaseCustomer,
  sbWrite, sbInsert,
  toSupabaseLoan, toSupabasePayment, toSupabaseInteraction,
  generateLoanAgreementHTML, generateAssetListHTML, downloadLoanDoc,
  useContactPopup, useToast, useReminders, useModalLock,
  ModuleHeader
} from '@/lms-common';
import { useModuleFilter } from '@/hooks/useModuleFilter';


const CustomersTab = ({ customers, setCustomers, workers, loans, setLoans, payments, setPayments, interactions, setInteractions, addAudit, showToast = () => { }, onOpenCustomerProfile }) => {
  const { open: openContact, Popup: ContactPopup } = useContactPopup();
  const [sel, setSel] = useState(null);
  const [selLoan, setSelLoan] = useState(null);
  const [isMob, setIsMob] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMob(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Build a set of customerIds who have an Active, Overdue or Frozen loan right now
  const activeBorrowerIds = useMemo(() =>
    new Set((loans || []).filter(l => ['Active', 'Overdue', 'Frozen'].includes(l.status)).map(l => l.customerId).filter(Boolean))
    , [loans]);

  // Build a set of all customerIds who have at least one loan record (ever)
  const allBorrowerIds = useMemo(() =>
    new Set((loans || []).map(l => l.customerId).filter(Boolean))
    , [loans]);

  // Build a set of customerIds who have a Settled loan
  const settledBorrowerIds = useMemo(() =>
    new Set((loans || []).filter(l => l.status === 'Settled').map(l => l.customerId).filter(Boolean))
    , [loans]);

  // Pre-calculate loan counts for each customer
  const loanCounts = useMemo(() => {
    const map = {};
    (loans || []).forEach(l => {
      if (l.customerId) map[l.customerId] = (map[l.customerId] || 0) + 1;
    });
    return map;
  }, [loans]);

  const STATUS_OPTS = ['All', 'Active', 'Settled', 'Blacklisted', 'No Loan'];

  const {
    q, setQ, tab: statusFlt, setTab: setStatusFlt,
    startDate, setStartDate, endDate, setEndDate, applyFilter,
    filtered, handleExport
  } = useModuleFilter({
    data: customers,
    initialTab: 'All',
    dateKey: 'joined',
    searchFields: ['id', 'name', 'phone', 'altPhone', 'idNo', 'business', 'location', 'officer', 'risk', 'residence', 'n1n', 'n1p', 'n2n', 'n2p', 'n3n', 'n3p'],
    reportId: 'customers',
    showToast,
    addAudit,
    customFilter: (c, t) => {
      if (t === 'Active' && !activeBorrowerIds.has(c.id)) return false;
      if (t === 'Blacklisted' && !c.blacklisted) return false;
      if (t === 'No Loan' && (c.blacklisted || allBorrowerIds.has(c.id))) return false;
      if (t === 'Settled' && (activeBorrowerIds.has(c.id) || !settledBorrowerIds.has(c.id))) return false;
      return true;
    },
    initialStartDate: '2024-01-01'
  });

  const counts = useMemo(() => {
    const total = (customers || []).length;
    const blacklisted = (customers || []).filter(c => c.blacklisted).length;
    const activeBorrowers = (customers || []).filter(c => activeBorrowerIds.has(c.id)).length;
    const inArrears = (customers || []).filter(c => {
      const borrowerLoans = (loans || []).filter(l => l.customerId === c.id);
      return borrowerLoans.some(l => {
        const paid = (payments || []).filter(p => p.loanId === l.id && p.status === 'Allocated').reduce((s, p) => s + p.amount, 0);
        return ['Overdue', 'Frozen'].includes(calculateLoanStatus(l, null, paid).badgeStatus);
      });
    }).length;
    return { total, blacklisted, activeBorrowers, inArrears };
  }, [customers, activeBorrowerIds, loans, payments]);

  const statsText = `${counts.total} registered · ${counts.activeBorrowers} active borrowers · ${counts.blacklisted} blacklisted`;

  const blacklist = c => {
    const upd = { ...c, blacklisted: true, blReason: 'Admin action' };
    setCustomers(cs => cs.map(x => x.id === c.id ? upd : x));
    sbWrite('customers', toSupabaseCustomer(upd));
    addAudit('Customer Blacklisted', c.id, c.name);
    showToast(`⚠ ${c.name} has been blacklisted`, 'warn');
    setSel(null);
  };
  const [blConfirm, setBlConfirm] = useState(null);

  const exportCols = [
    { k: 'id', l: 'ID' },
    { k: 'name', l: 'Name' },
    { k: 'phone', l: 'Phone' },
    { k: 'business', l: 'Business' },
    { k: 'location', l: 'Location' },
    { k: 'officer', l: 'Officer' },
    { k: 'id', l: 'Loans', r: v => loanCounts[v] || 0 },

    { k: 'joined', l: 'Joined' }
  ];

  return (
    <div className='fu'>
      {ContactPopup}
      
      <ModuleHeader
        title="CRM Hub"
        sub="Manage and track your customer base, financial health, and interactions."
        stats={statsText}
        refreshProps={{ onRefresh: () => { setQ(''); setStatusFlt('All'); setSel(null); } }}
        search={{ value: q, onChange: setQ, placeholder: 'Search name, phone or ID…' }}
        dateRange={{ start: startDate, end: endDate, onStartChange: setStartDate, onEndChange: setEndDate, onSearch: applyFilter }}
        exportProps={{ onExport: (fmt) => handleExport(fmt, 'Customer Report', exportCols) }}
        pillsProps={{ opts: STATUS_OPTS, val: statusFlt, onChange: setStatusFlt }}
      />

      <div className="mob-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <KPI label="Total Customers" value={counts.total} icon={Users} color={T.accent} />
        <KPI label="Active Borrowers" value={counts.activeBorrowers} icon={Activity} color={T.ok} />
        <KPI label="In Arrears" value={counts.inArrears} icon={AlertTriangle} color={T.danger} sub={counts.inArrears > 0 ? "Requires Attention" : "All Good"} />
      </div>

      <div style={{ marginTop: 4 }}>
        <Card noPadding>
          <DT
            cols={[
              { 
                k: 'name', l: 'Customer', r: (v, r) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Av ini={v.split(' ').map(n => n[0]).join('').slice(0, 2)} size={isMob ? 34 : 38} color={r.blacklisted ? T.danger : T.accent} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span onClick={e => { e.stopPropagation(); onOpenCustomerProfile?.(r.id); }} style={{ color: T.txt, cursor: 'pointer', fontWeight: 700, fontSize: isMob ? 13 : 13.5 }}>{v}</span>
                       <span style={{ fontSize: 10.5, color: T.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => { e.stopPropagation(); openContact(v, r.phone, e, r.alt_phone, r.id); }}>
                        <Phone size={10} /> {r.phone}
                       </span>
                    </div>
                  </div>
                )
              },
              !isMob && { 
                k: 'business', l: 'Engagement', r: (v, r) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.txt, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Briefcase size={12} style={{ color: T.accent }} /> {v || 'Personal'}
                    </div>
                    <div style={{ fontSize: 11, color: T.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={12} /> {r.location}
                    </div>
                  </div>
                )
              },
              !isMob && { k: 'officer', l: 'Credit Officer', r: v => <span style={{ fontSize: 12.5, fontWeight: 600, color: T.dim }}>{v}</span> },
              !isMob && { k: 'id', l: 'Count', r: v => <span style={{ fontSize: 13, fontWeight: 800 }}>{loanCounts[v] || 0}</span> },

              {
                k: 'id', l: 'Status', r: (v, row) => {
                  if (row.blacklisted) return <Badge color={T.danger} variant="solid" sm={isMob}>{isMob ? 'BL' : 'Blacklisted'}</Badge>;
                  const borrowerLoans = loans.filter(l => l.customerId === v);
                  const hasArrears = borrowerLoans.some(l => {
                    const paid = payments.filter(p => p.loanId === l.id && p.status === 'Allocated').reduce((s, p) => s + p.amount, 0);
                    const e = calculateLoanStatus(l, null, paid);
                    return ['Overdue', 'Frozen'].includes(e.badgeStatus);
                  });
                  if (hasArrears) return <Badge color={T.danger} outline sm={isMob}>{isMob ? '⚠️' : 'Critical Arrears'}</Badge>;
                  if (activeBorrowerIds.has(v)) return <Badge color={T.ok} variant="subtle" sm={isMob}>Active</Badge>;
                  if (allBorrowerIds.has(v)) return <Badge color={T.muted} sm={isMob}>{isMob ? 'Clear' : 'No Debt'}</Badge>;
                  return <Badge color={T.blue} sm={isMob}>{isMob ? 'New' : 'New Client'}</Badge>;
                }
              },
              {
                k: 'id', l: '', r: (v, row) => (
                  <Btn icon={ChevronRight} onClick={() => onOpenCustomerProfile?.(v)} variant="ghost" size="sm" />
                )
              }
            ].filter(Boolean)}
            rows={filtered} onRow={r => onOpenCustomerProfile?.(r.id)}
          />
        </Card>
      </div>
      {blConfirm && <ConfirmDialog title="Blacklist Customer" message={blConfirm.msg} confirmLabel="Yes, Blacklist" confirmVariant="danger" onConfirm={() => { blacklist(blConfirm.c); setBlConfirm(null); }} onCancel={() => setBlConfirm(null)} />}

      {selLoan && <LoanModal loan={selLoan} customers={customers} payments={payments} interactions={interactions || []} onClose={() => setSelLoan(null)} onViewCustomer={cust => { setSelLoan(null); setSel(cust); }} />}
    </div>
  );
};

export default CustomersTab;