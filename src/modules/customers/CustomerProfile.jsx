import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/config/supabaseClient';
import { Image as ImageIcon, FileText, File, Download, Maximize2, Eye, X, Loader2, FolderIcon, HardDrive, PhoneCall, MessageSquare, MapPin, Monitor, CheckCircle2, Rocket, Wallet, CheckCircle, Clock, Zap, AlertCircle, ShieldCheck, Mail, Send, RotateCcw, BadgeCheck, ArrowRightLeft, Calendar, ShieldAlert, AlertTriangle, Flame, CreditCard, XCircle } from 'lucide-react';
import { T, SC, RC, Card, DT, Btn, Pills, Badge, FI, Alert, Dialog, ConfirmDialog, CustomerEditForm, fmt, now, ts, calculateLoanStatus, uid, useToast, useModalLock, fromSupabaseLoan, fromSupabaseCustomer, fromSupabasePayment, fromSupabaseInteraction, toSupabaseCustomer, toSupabaseInteraction, sbUploadDoc, sbAuditInsert, QueuedSmsTab } from '@/lms-common';

// ── PaymentNoteCell ──
// Inline editable cell for the payment history table.
const PaymentNoteCell = ({ payment, onUpdate, addAudit, showToast, disabled }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(payment.notes || '');
  const [saving, setSaving] = useState(false);

  if (disabled) {
    return (
      <div style={{ fontSize: 10, color: payment.notes ? T.txt : T.muted, padding: '2px 8px', fontStyle: payment.notes ? 'normal' : 'italic' }}>
        {payment.notes || '—'}
      </div>
    );
  }

  // Sync with prop if it changes externally
  useEffect(() => {
    setVal(payment.notes || '');
  }, [payment.notes]);

  const handleSave = async () => {
    const trimmed = val.trim();
    if (trimmed === (payment.notes || '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('payments')
        .update({ notes: trimmed })
        .eq('id', payment.id);
      if (error) throw error;
      
      onUpdate(payment.id, trimmed);
      
      // Audit log
      if (addAudit) {
        addAudit(`Updated note for payment ${payment.id}`, payment.customerId, 'Financial');
      }
      
      showToast('Payment note updated', 'success');
      setEditing(false);
    } catch (e) {
      showToast(e.message || 'Failed to update note', 'danger');
      setVal(payment.notes || '');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div style={{ padding: '0 4px', width: '100%' }}>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') {
              setVal(payment.notes || '');
              setEditing(false);
            }
          }}
          disabled={saving}
          placeholder="Enter note..."
          style={{
            width: '100%',
            fontSize: 11,
            padding: '4px 8px',
            background: T.cardHi,
            color: T.txt,
            border: `1px solid ${T.accent}`,
            borderRadius: 8,
            outline: 'none',
            boxShadow: `0 4px 12px rgba(0,212,170,0.2)`,
            fontFamily: 'inherit'
          }}
        />
      </div>
    );
  }

  return (
    <div 
      onClick={(e) => { 
        e.preventDefault();
        e.stopPropagation(); 
        setEditing(true); 
      }}
      style={{ 
        cursor: 'pointer',
        fontSize: 10,
        color: payment.notes ? T.txt : T.muted,
        fontStyle: payment.notes ? 'normal' : 'italic',
        minHeight: 24,
        display: 'flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        transition: 'all 0.2s',
        width: '100%',
        maxWidth: 200,
        position: 'relative',
        group: 'true' // For hover children if we used tailwind, but we use JS hover
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        e.currentTarget.querySelector('.edit-hint').style.opacity = '1';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.querySelector('.edit-hint').style.opacity = '0';
      }}
      title={payment.notes || 'Click to add a note'}
    >
      <span style={{ 
        overflow: 'hidden', 
        textOverflow: 'ellipsis', 
        whiteSpace: 'nowrap',
        flex: 1
      }}>
        {payment.notes || '—'}
      </span>
      <span className="edit-hint" style={{ 
        opacity: 0, 
        marginLeft: 6, 
        fontSize: 12, 
        color: T.accent,
        transition: 'opacity 0.2s'
      }}>✎</span>
    </div>
  );
};

// ── Shimmer Component ──
const ShimmerLimit = ({ value }) => (
  <span style={{
    display: 'inline-block',
    minWidth: '60px',
    color: 'transparent',
    backgroundImage: `linear-gradient(90deg, rgba(0,212,170,0.1) 25%, rgba(0,212,170,0.3) 50%, rgba(0,212,170,0.1) 75%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmerPulse 1.5s infinite linear',
    borderRadius: '6px',
    userSelect: 'none',
    lineHeight: 'inherit'
  }}>
    {value || '00000'}
    <style>{`
      @keyframes shimmerPulse {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .fade-in-limit {
        animation: fadeInLimit 0.4s ease-out forwards;
      }
      @keyframes fadeInLimit {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `}</style>
  </span>
);

export default function CustomerProfile({ 
  customerId, workerContext, onClose, onSelectLoan, 
  loans: globalLoans, setLoans: setGlobalLoans, 
  payments: globalPayments, setPayments: setGlobalPayments, 
  interactions: globalInteractions, setInteractions: setGlobalInteractions, 
  customers, setCustomers, 
  workers: globalWorkers,
  addAudit,
  onRefresh,
  initialTab = 'overview',
  showToast
}) {
  // Lock body scroll and restore position when the overlay closes
  useModalLock();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [riskProfile, setRiskProfile] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [fetching, setFetching]   = useState(true);
  const [errorMsg, setErrorMsg]   = useState(null);
  const [showEdit, setShowEdit]   = useState(false);
  const [showBlacklistDialog, setShowBlacklistDialog] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [unblacklistConfirm, setUnblacklistConfirm] = useState(false);
  const [savingBl, setSavingBl] = useState(false);

  // ── Customer Tag State ──
  const [customerTags, setCustomerTags] = useState([]);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagType, setTagType] = useState('Red');
  const [tagReason, setTagReason] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [showRemoveTagConfirm, setShowRemoveTagConfirm] = useState(false);

  // Initial populate from provided props
  const [customer, setCustomer]   = useState(() => customers?.find(x => x.id === customerId) || null);
  const [loans, setLoans]         = useState(() => globalLoans?.filter(l => l.customerId === customerId) || []);
  const [payments, setPayments]   = useState(() => globalPayments?.filter(p => p.customerId === customerId) || []);
  const [interactions, setInters] = useState(() => globalInteractions?.filter(i => i.customerId === customerId) || []);
  const [smsLogs, setSmsLogs]         = useState([]);
  const [queuedSms, setQueuedSms]     = useState([]);
  const [workers, setWorkers]     = useState(globalWorkers || []);

  // ── Baseline Eligibility Logic ──
  // The user wants the first loan to be the baseline start limit, not a generic 5k.
  const startingLimit = useMemo(() => {
    if (!loans || loans.length === 0) return 5000;
    const sorted = [...loans].filter(l => l.disbursed || l.createdAt).sort((a, b) => {
      return new Date(a.disbursed || a.createdAt) - new Date(b.disbursed || b.createdAt);
    });
    return sorted[0]?.amount || 5000;
  }, [loans]);

  const currentLimit = useMemo(() => {
    if (customer?.limitSuspended) return 0;
    
    // Calculate actual baseline
    let baseline = customer?.creditLimit || 0;
    if (!baseline || baseline === 5000) {
      baseline = startingLimit;
    }
    
    // If they have currently overdue loans, scale baseline dynamically
    const overdueLoans = loans.filter(l => (l.status || '').toLowerCase() === 'overdue' && Number(l.actualBalance || l.balance || 0) > 0);
    if (overdueLoans.length > 0) {
      const maxOverdueDays = Math.max(...overdueLoans.map(l => l.overdueDays || l.daysOverdue || 0), 0);
      if (maxOverdueDays >= 1 && maxOverdueDays <= 5) return Math.round(baseline * 0.95);
      if (maxOverdueDays >= 6 && maxOverdueDays <= 10) return Math.round(baseline * 0.90);
      if (maxOverdueDays >= 11 && maxOverdueDays <= 15) return Math.round(baseline * 0.85);
      if (maxOverdueDays >= 16 && maxOverdueDays <= 20) return Math.round(baseline * 0.80);
      if (maxOverdueDays >= 21 && maxOverdueDays <= 25) return Math.round(baseline * 0.75);
      if (maxOverdueDays >= 26 && maxOverdueDays <= 30) return Math.round(baseline * 0.70);
      return 0;
    }
    
    // Otherwise fallback to riskProfile current_limit if it's set and not standard fallback
    const dbLimit = riskProfile?.current_limit;
    if (dbLimit === 0) return 0;
    if (dbLimit !== undefined && dbLimit !== null && dbLimit !== 5000) return dbLimit;
    
    return baseline;
  }, [riskProfile, customer, loans, startingLimit]);

  // Loans settled since the last credit limit increase was applied.
  // A new increase is only suggested after 3 settled loans post-increase.
  const loansSinceIncrease = useMemo(() => {
    const settledAtIncrease = customer?.settledLoansAtLimitIncrease || 0;
    return Math.max(0, (riskProfile?.settled_loans || 0) - settledAtIncrease);
  }, [riskProfile?.settled_loans, customer?.settledLoansAtLimitIncrease]);

  const suggestedLimit = useMemo(() => {
    if (customer?.limitSuspended) return 0;
    const dbSug = riskProfile?.suggested_limit;
    if (dbSug === 0) return 0;
    if (dbSug && dbSug > currentLimit && customer?.creditLimit !== 5000) return dbSug;
    // Must have 3+ settled loans since the last increase, zero overdue days, AND zero currently-overdue loans
    const isEligible = loansSinceIncrease >= 3
      && (riskProfile?.max_overdue_days || 0) === 0
      && (riskProfile?.currently_overdue_count || 0) === 0;
    return isEligible ? (currentLimit + 2000) : currentLimit;
  }, [riskProfile, currentLimit, customer?.limitSuspended, customer?.creditLimit, loansSinceIncrease]);

  const restorationDate = useMemo(() => {
    if (!customer?.lastOverdueClearDate) return null;
    const d = new Date(customer.lastOverdueClearDate);
    d.setDate(d.getDate() + 30);
    return d;
  }, [customer?.lastOverdueClearDate]);

  const dynamicReductionInfo = useMemo(() => {
    if (!riskProfile || !(riskProfile.currently_overdue_count > 0)) return null;
    const maxOverdueDays = riskProfile.max_overdue_days || 0;
    let pct = 0;
    if (maxOverdueDays >= 1 && maxOverdueDays <= 5) pct = 5;
    else if (maxOverdueDays >= 6 && maxOverdueDays <= 10) pct = 10;
    else if (maxOverdueDays >= 11 && maxOverdueDays <= 15) pct = 15;
    else if (maxOverdueDays >= 16 && maxOverdueDays <= 20) pct = 20;
    else if (maxOverdueDays >= 21 && maxOverdueDays <= 25) pct = 25;
    else if (maxOverdueDays >= 26 && maxOverdueDays <= 30) pct = 30;
    else if (maxOverdueDays > 30) pct = 100;
    return { maxOverdueDays, percentage: pct };
  }, [riskProfile]);

  const [applyingLimit, setApplyingLimit] = useState(false);
  const handleApplyLimit = async () => {
    if (suggestedLimit <= currentLimit) return;
    setApplyingLimit(true);
    try {
      // Snapshot the current settled loans count so the next increase
      // is only suggested after 3 more settled loans from this point.
      const currentSettledLoans = riskProfile?.settled_loans || 0;
      const { error } = await supabase.from('customers').update({
        credit_limit: suggestedLimit,
        settled_loans_at_limit_increase: currentSettledLoans
      }).eq('id', customerId);
      if (error) throw error;
      
      setRiskProfile(prev => ({ ...prev, current_limit: suggestedLimit }));
      setCustomer(prev => prev ? { ...prev, settledLoansAtLimitIncrease: currentSettledLoans, creditLimit: suggestedLimit } : prev);
      addAudit?.(`Approved credit limit increase to ${fmt(suggestedLimit)} for ${customer.name}`, customerId, 'Security');
      showToast('Credit limit updated successfully', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      setApplyingLimit(false);
    }
  };



  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);



  useEffect(() => {
    let active = true;

    // ALWAYS fetch the full record from Supabase when a profile is opened.
    // The partial/cached global state (set via useState above) renders the name+phone
    // instantly while the network call runs. This fixes the bug where synthesized or
    // fast-page-loaded customer records were missing gender, location, n2/n3 NOK etc.
    // because the old early-exit guard (`customer.gender`) was preventing the fetch.
    if (!customer) setLoading(true);
    setFetching(true);

    async function fetchAll() {
      try {
        setErrorMsg(null);

        // Fetch the complete customer row (SELECT * to guarantee all columns)
        const { data: cData, error: cErr } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();

        if (cErr) {
          if (cErr.code === 'PGRST116') {
             // Profile doesn't exist on server yet (e.g. schema cache failure during registration)
             const localCust = customers?.find(c => c.id === customerId);
             if (!localCust) throw new Error('Customer not found in database or local cache.');
             console.warn('[CustomerProfile] Server says profile missing. Falling back to local cache.');
             // Skip network dependent steps and return early with local fallback
             if (active) {
                setCustomer(localCust);
                setLoans([]);
                setPayments([]);
                setInters([]);
                setLoading(false);
             }
             return;
          }
          throw cErr;
        }
        if (!cData) throw new Error('Customer not found');

        const [lRes, pRes, iRes, rRes, smsRes, qRes, tagsRes] = await Promise.allSettled([
          supabase.from('loans').select('*').eq('customer_id', customerId),
          supabase.from('payments').select('*').eq('customer_id', customerId).order('date', { ascending: false }),
          supabase.from('interactions').select('*').eq('customer_id', customerId).order('date', { ascending: false }),
          supabase.from('customer_risk_profiles').select('*').eq('customer_id', customerId).maybeSingle(),
          supabase.from('sms_logs').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
          supabase.from('queued_sms').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
          supabase.from('customer_tags').select('*').eq('customer_id', customerId).order('applied_at', { ascending: false }),
        ]);

        if (!active) return;

        const customerMapped = fromSupabaseCustomer(cData);
        // Keep the raw Supabase row on the mapped object so handleUpdate can
        // safely merge form changes on top of the ground-truth DB state.
        customerMapped._raw = cData;
        const currentWorkers = globalWorkers || workers || [];
        customerMapped.onboarded_by_worker = currentWorkers.find(w => w.id === cData.onboarded_by);
        customerMapped.assigned_officer_worker = currentWorkers.find(w => w.id === cData.assigned_officer);

        setCustomer(customerMapped);

        if (lRes.status === 'fulfilled' && lRes.value.data) setLoans(lRes.value.data.map(fromSupabaseLoan));
        if (pRes.status === 'fulfilled' && pRes.value.data) setPayments(pRes.value.data.map(fromSupabasePayment));
        if (iRes.status === 'fulfilled' && iRes.value.data) setInters(iRes.value.data.map(fromSupabaseInteraction));
        if (rRes.status === 'fulfilled' && rRes.value.data) setRiskProfile(rRes.value.data);
        if (smsRes.status === 'fulfilled' && smsRes.value.data) setSmsLogs(smsRes.value.data);
        if (qRes.status === 'fulfilled' && qRes.value.data) setQueuedSms(qRes.value.data);
        if (tagsRes.status === 'fulfilled' && tagsRes.value.data) setCustomerTags(tagsRes.value.data);

      } catch (err) {
        if (active) setErrorMsg(err.message || 'Unknown database fetch error');
      } finally {
        if (active) {
          setLoading(false);
          setFetching(false);
        }
      }
    }
    fetchAll();
    return () => { active = false; };
  }, [customerId]);


  const handlePaymentNoteUpdate = (payId, newNote) => {
    const updated = payments.map(p => p.id === payId ? { ...p, notes: newNote } : p);
    setPayments(updated);
    if (setGlobalPayments) {
      setGlobalPayments(prev => prev.map(p => p.id === payId ? { ...p, notes: newNote } : p));
    }
  };

  const workerMap = useMemo(() => {
    const map = {};
    workers.forEach(w => map[w.id] = w.name);
    return map;
  }, [workers]);

  const handleUpdate = async (updated) => {
    if (isCollectionsOrRecovery) {
      showToast('Permission denied: Collections and Asset Recovery officers cannot modify customer profiles.', 'danger');
      return;
    }
    try {
      // ── Sync Documents to Storage ──
      // If the update includes new structured documents (e.g. from CustomerEditForm),
      // we move them from base64 JSONB to the 'documents' storage bucket.
      if (updated.docs && updated.docs.length > 0) {
        const hasNewDocs = updated.docs.some(d => d.file || (d.dataUrl && d.dataUrl.startsWith('data:')));
        if (hasNewDocs) {
          showToast('Syncing documents to secure storage...', 'info');
          for (const d of updated.docs) {
            if (d.file || (d.dataUrl && d.dataUrl.startsWith('data:'))) {
               try { 
                 await sbUploadDoc(customerId, d);
                 // Once uploaded, strip the massive base64 string/file object
                 // to prevent database bloat and ensure the row stays within size limits.
                 delete d.dataUrl;
                 delete d.file; 
               } catch(e) { 
                 console.error('[doc-sync]', e);
                 throw new Error(`Failed to upload ${d.name}. Please check your network connection and try again.`);
               }
            }
          }
        }
      }

      // Build the DB payload from the form data.
      // We explicitly EXCLUDE created_at (server-managed) and server-only flags
      // (mpesa_registered, status) so they are never accidentally nulled out.
      const dbPayload = toSupabaseCustomer(updated);
      delete dbPayload.created_at; // server-managed — never overwrite

      const { error } = await supabase.from('customers').update(dbPayload).eq('id', customerId);
      if (error) throw error;

      // Merge the updated form data back onto the in-memory customer, preserving
      // any server-side fields (mpesaRegistered, _raw, worker references, etc.)
      // that the edit form does not touch.
      const merged = { ...customer, ...updated, _raw: customer._raw };
      setCustomer(merged);
      if (setCustomers) {
        setCustomers(prev => prev.map(c => c.id === customerId ? merged : c));
      }
      addAudit('Profile Updated', customerId, `KYC details modified`);
      showToast('Profile updated successfully', 'ok');
      setShowEdit(false);
    } catch (err) {
      showToast('Failed to update: ' + err.message, 'danger');
    }
  };

  const handleBlacklist = async () => {
    if (!blacklistReason.trim()) {
      showToast('Please provide a reason for blacklisting', 'warn');
      return;
    }
    try {
      setSavingBl(true);
      const { error } = await supabase
        .from('customers')
        .update({ blacklisted: true, bl_reason: blacklistReason })
        .eq('id', customerId);
      if (error) throw error;

      const updated = { ...customer, blacklisted: true, blReason: blacklistReason };
      setCustomer(updated);
      if (setCustomers) setCustomers(prev => prev.map(c => c.id === customerId ? updated : c));
      
      addAudit('Customer Blacklisted', customerId, `Reason: ${blacklistReason}`);
      showToast('Customer blacklisted successfully', 'warn');
      setShowBlacklistDialog(false);
      setBlacklistReason('');
    } catch (err) {
      showToast('Failed to blacklist: ' + err.message, 'danger');
    } finally {
      setSavingBl(false);
    }
  };

  const handleUnblacklist = async () => {
    try {
      setSavingBl(true);
      const { error } = await supabase
        .from('customers')
        .update({ blacklisted: false, bl_reason: null })
        .eq('id', customerId);
      if (error) throw error;

      const updated = { ...customer, blacklisted: false, blReason: null };
      setCustomer(updated);
      if (setCustomers) setCustomers(prev => prev.map(c => c.id === customerId ? updated : c));
      
      addAudit('Customer Unblacklisted', customerId);
      showToast('Customer reinstated successfully', 'ok');
      setUnblacklistConfirm(false);
    } catch (err) {
      showToast('Failed to unblacklist: ' + err.message, 'danger');
    } finally {
      setSavingBl(false);
    }
  };

  // ── Role flags ──
  const isCollectionsOrRecovery = workerContext?.role === 'Collections Officer' || workerContext?.role === 'Asset Recovery';

  // Helper: normalise a Kenyan phone number to international format for WhatsApp deep-links
  const normalizePhoneForWhatsApp = (msisdn) => {
    if (!msisdn) return '';
    let phone = msisdn.replace(/[\s\-()]/g, '').replace(/^\+/, '');
    if (phone.startsWith('0')) phone = '254' + phone.substring(1);
    return phone;
  };

  // Collections & Recovery officers cannot send custom SMS – hide that tab for them
  const tabs = [
    'Overview', 'Risk Analysis', 'Loan History', 'Payment History',
    'Interactions',
    ...(!isCollectionsOrRecovery ? ['Queued Messages'] : []),
    'Documents', 'Next of Kin', 'Tag History'
  ];
  // Map label to internal ID for switching
  const tabId = v => v.toLowerCase().replace(/ /g, '');


  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9900, background: 'rgba(4,8,16,0.85)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className='pop' style={{ background: T.card, border: `1px solid ${T.hi}`, borderRadius: 24, padding: '40px 60px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: 44, marginBottom: 20, animation: 'pulse 1s infinite' }}>👤</div>
          <div style={{ color: T.txt, fontWeight: 900, fontSize: 16, fontFamily: T.head, letterSpacing: 1 }}>ANALYZING PROFILE</div>
          <div style={{ color: T.muted, fontSize: 12, marginTop: 8, fontFamily: T.mono }}>Standardizing KYC & Financial Data...</div>
          <div style={{ width: 140, height: 4, background: T.border, borderRadius: 99, margin: '20px auto 0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '50%', background: T.accent, borderRadius: 99, animation: 'progress 1.5s infinite ease-in-out' }} />
          </div>
        </div>
        <style>{`
          @keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        `}</style>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9900, background: T.bg, padding: 32 }}>
        <Alert type='danger'><b>Profile Fetch Error:</b> {errorMsg}</Alert>
        <Btn onClick={onClose} v='secondary'>Go Back</Btn>
      </div>
    );
  }

  // Derived Info
  const isBlacklisted = customer?.blacklisted === true || customer?.blacklisted === 'true';
  const totalBorrowed = loans
    .filter(l => {
      const s = (l.status || '').toLowerCase();
      return !['approved', 'application submitted', 'worker-pending', 'rejected', 'declined'].includes(s);
    })
    .reduce((acc, l) => acc + Number(l.amount || 0), 0);
  
  if (!customer) return null; // Defensive check for initial render before useEffect hydration
  
  // Calculate Live Loan Statuses using identical logic to lms-core
  // IMPORTANT: must pass totalPaid as 3rd arg — otherwise the function derives it
  // from balance (which is 0 in records that track balance separately), causing
  // every loan to appear fully-paid/settled and the "Account is clean" message to
  // show even when active loans exist.
  const processedLoans = loans.map(l => {
    const totalPaid = l.disbursed ? payments
      .filter(p => p.loanId === l.id)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0) : 0;
    const stub = { 
      ...l,
      balance: Number(l.balance || 0), 
      daysOverdue: Number(l.daysOverdue || 0), 
      status: l.status, 
      amount: Number(l.amount || 0),
      disbursed: l.disbursed,
    };
    const snap = calculateLoanStatus(stub, null, totalPaid);
    // Preserve the original DB status BEFORE snap can override it.
    // This lets the filter below trust the ground-truth DB value.
    return { ...l, dbStatus: l.status, ...snap, actualBalance: snap.totalAmountDue, totalPayable: snap.totalPayable, totalPaid };
  });

  // A loan is shown as "active" if EITHER:
  //  (a) The DB explicitly marks it as an in-progress status — always trust the
  //      ground truth. The calculateLoanStatus heuristics (isWrittenOff, isSettled)
  //      can misfire when payments aren't loaded yet or disbursed date is missing.
  //  (b) The computed badgeStatus is not a terminal state.
  const ACTIVE_DB_STATUSES = ['Active', 'Overdue', 'Disbursing', 'Approved', 'Application submitted', 'worker-pending'];
  const activeLoans = processedLoans.filter(l =>
    ['Active', 'Overdue', 'Disbursing', 'Frozen'].includes(l.badgeStatus)
  );
  const transferableLoans = useMemo(() => 
    activeLoans.filter(l => l.badgeStatus === 'Active' || l.badgeStatus === 'Overdue'),
    [activeLoans]
  );

  const unallocatedPayments = useMemo(() => payments.filter(p => p.status === 'Unallocated' && p.customerId === customerId), [payments, customerId]);
  const overpaidLoans = useMemo(() => processedLoans.filter(l => l.isSettled && l.actualBalance < 0), [processedLoans]);
  const totalAvailableCredit = useMemo(() => {
    const unallocSum = unallocatedPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const overpaidSum = overpaidLoans.reduce((s, l) => s + Math.abs(l.actualBalance), 0);
    return unallocSum + overpaidSum;
  }, [unallocatedPayments, overpaidLoans]);

  // ── Credit allocation: destination selection prompt ─────────────────────────
  const [creditPending, setCreditPending] = useState(null); // { sourceType, sourceId, amount }
  const [allocatingCredit, setAllocatingCredit] = useState(false);

  const handleAllocateCredit = async (sourceType, sourceId, amount) => {
    if (isCollectionsOrRecovery) {
      showToast('Permission denied: Collections and Asset Recovery officers cannot allocate credit.', 'danger');
      return;
    }
    // Show the picker dialog even if no loans exist (to allow Registration Fee allocation)
    setCreditPending({ sourceType, sourceId, amount });
  };

  // Core transfer logic — accepts pending data and target loan ID directly
  const executeCreditTransferDirect = async (pending, targetLoanId) => {
    const { sourceType, sourceId, amount } = pending;
    const targetLoan = activeLoans.find(l => l.id === targetLoanId);
    if (!targetLoan) { showToast('Target loan not found.', 'danger'); return; }
    setCreditPending(null);
    setAllocatingCredit(true);
    try {
      const targetLoanIdFinal = targetLoan.id;
      // 1. If it's an unallocated payment, just update it
      if (sourceType === 'payment') {
        const isRegFee = targetLoanId === 'REG_FEE';
        const finalLoanId = isRegFee ? null : targetLoanId;

        const { error } = await supabase.from('payments').update({
          loan_id: finalLoanId,
          is_reg_fee: isRegFee,
          status: 'Allocated',
          notes: isRegFee ? `Registration fee marked manually` : `Credit allocated manually from unallocated payment ${sourceId}`
        }).eq('id', sourceId);
        if (error) throw error;

        if (isRegFee) {
           await supabase.from('customers').update({ mpesa_registered: true }).eq('id', customerId);
           setCustomer(prev => ({ ...prev, mpesaRegistered: true }));
           if (setCustomers) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, mpesaRegistered: true } : c));
        }
      } else {
        // 2. Overpayment on a settled loan:
        //    - Insert a negative payment on the source loan to offset the overpayment in the ledger.
        //    - Explicitly lock the source loan's status to 'Settled' in the DB.
        //    - Create the IN credit on the target loan.
        const creditId = uid('PAY');

        // Debit the source loan (negative payment to reduce its totalPaid)
        const { error: errOut } = await supabase.from('payments').insert([{
           id: `${creditId}-OUT`,
           customer_id: customerId,
           customer_name: customer.name,
           loan_id: sourceId,
           amount: -Math.abs(amount),
           status: 'Allocated',
           type: 'Transfer',
           date: new Date().toISOString(),
           notes: `Overpayment transferred to loan ${targetLoanIdFinal}`
        }]);
        if (errOut) throw errOut;

        // Lock source loan status to Settled
        const { error: errLock } = await supabase.from('loans').update({
          status: 'Settled'
        }).eq('id', sourceId);
        if (errLock) throw errLock;

        // Credit the target loan
        const { error: errIn } = await supabase.from('payments').insert([{
           id: `${creditId}-IN`,
           customer_id: customerId,
           customer_name: customer.name,
           loan_id: targetLoanIdFinal,
           amount: Math.abs(amount),
           status: 'Allocated',
           type: 'Transfer',
           date: new Date().toISOString(),
           notes: `Credit received from settled loan ${sourceId}`
        }]);
        if (errIn) throw errIn;
      }
      showToast('Credit allocated successfully', 'success');
      addAudit?.(`Credit Transfer: KES ${amount}`, customerId, `Transferred from ${sourceId} to ${targetLoanIdFinal} (${sourceType})`);
      if (sourceType === 'payment') {
        const isRegFee = targetLoanId === 'REG_FEE';
        setPayments(prev => prev.map(p => p.id === sourceId ? { ...p, status: 'Allocated', loanId: isRegFee ? null : targetLoanId, isRegFee } : p));
      } else {
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('[AllocateCredit]', err);
      let msg = err.message || 'Failed to allocate credit.';
      if (msg.includes('check constraint') || msg.includes('400')) {
        msg = 'Negative payments are blocked by DB security. Please run the migration script.';
      }
      showToast('Allocation Failed: ' + msg, 'danger');
    } finally {
      setAllocatingCredit(false);
    }
  };

  // Wrapper called from the loan-picker dialog (reads creditPending from state)
  const executeCreditTransfer = async (targetLoanId) => {
    if (!creditPending) return;
    await executeCreditTransferDirect(creditPending, targetLoanId);
  };

  const handleReversePayment = async (pId, amount) => {
    if (isCollectionsOrRecovery) {
      showToast('Permission denied: Collections and Asset Recovery officers cannot reverse payments.', 'danger');
      return;
    }
    try {
      const { error } = await supabase.from('payments').update({
        status: 'Reversed',
        notes: `Payment reversed/refunded by admin on ${new Date().toLocaleDateString()}`
      }).eq('id', pId);
      if (error) throw error;
      
      showToast('Payment marked as reversed', 'success');
      addAudit?.(`Reversed payment ${pId} (KES ${amount}) for customer ${customer.name}`, customerId, 'Security');
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  // ── Customer Tag Handlers ──
  const handleApplyTag = async () => {
    if (!tagReason.trim()) { showToast('Please provide a reason for the tag', 'warn'); return; }
    setSavingTag(true);
    try {
      const appliedByName = workerContext?.name || 'Staff';
      const { data: authData } = await supabase.auth.getUser();
      const { error: tagErr } = await supabase.from('customer_tags').insert({
        customer_id: customerId,
        tag_type: tagType,
        reason: tagReason.trim(),
        applied_by: authData?.user?.id || null,
        applied_by_name: appliedByName,
      });
      if (tagErr) throw tagErr;
      const { error: custErr } = await supabase.from('customers').update({
        customer_tag: tagType,
        customer_tag_reason: tagReason.trim(),
      }).eq('id', customerId);
      if (custErr) throw custErr;
      const newEntry = { id: String(Date.now()), customer_id: customerId, tag_type: tagType, reason: tagReason.trim(), applied_by: authData?.user?.id, applied_by_name: appliedByName, applied_at: new Date().toISOString() };
      setCustomerTags(prev => [newEntry, ...prev]);
      setCustomer(prev => prev ? { ...prev, customerTag: tagType, customerTagReason: tagReason.trim() } : prev);
      if (setCustomers) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, customerTag: tagType, customerTagReason: tagReason.trim() } : c));
      addAudit?.(`Applied ${tagType} Tag to ${customer.name}`, customerId, `Reason: ${tagReason.trim()}`);
      showToast(`${tagType} Tag applied successfully`, tagType === 'Red' ? 'danger' : 'warn');
      setShowTagDialog(false); setTagReason('');
    } catch (err) { showToast('Failed to apply tag: ' + err.message, 'danger'); }
    finally { setSavingTag(false); }
  };

  const handleRemoveTag = async () => {
    setSavingTag(true);
    try {
      const appliedByName = workerContext?.name || 'Admin';
      const prevTag = customer.customerTag;
      const { data: authData } = await supabase.auth.getUser();
      const { error: tagErr } = await supabase.from('customer_tags').insert({
        customer_id: customerId, tag_type: 'Removed',
        reason: `${prevTag} Tag removed by ${appliedByName}`,
        applied_by: authData?.user?.id || null, applied_by_name: appliedByName,
      });
      if (tagErr) throw tagErr;
      const { error: custErr } = await supabase.from('customers').update({ customer_tag: null, customer_tag_reason: null }).eq('id', customerId);
      if (custErr) throw custErr;
      const removalEntry = { id: String(Date.now()), customer_id: customerId, tag_type: 'Removed', reason: `${prevTag} Tag removed by ${appliedByName}`, applied_by: authData?.user?.id, applied_by_name: appliedByName, applied_at: new Date().toISOString() };
      setCustomerTags(prev => [removalEntry, ...prev]);
      setCustomer(prev => prev ? { ...prev, customerTag: null, customerTagReason: null } : prev);
      if (setCustomers) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, customerTag: null, customerTagReason: null } : c));
      addAudit?.(`Removed ${prevTag} Tag from ${customer.name}`, customerId, 'Security');
      showToast('Tag removed successfully', 'ok');
      setShowRemoveTagConfirm(false);
    } catch (err) { showToast('Failed to remove tag: ' + err.message, 'danger'); }
    finally { setSavingTag(false); }
  };

  return (
    <div 
      className="fade ios-sheet-overlay" 
      style={{ 
        position: 'fixed', 
        inset: 0, 
        zIndex: 99000, 
        background: 'rgba(0,0,0,0.7)', 
        backdropFilter: 'blur(12px)', 
        display: 'flex', 
        alignItems: 'flex-end', // Pin to bottom like a real iOS sheet
        justifyContent: 'center' 
      }}
      onClick={onClose}
    >
      <style>{`
        .profile-container { display: flex; flex-direction: column; flex: 1; min-height: 0; box-sizing: border-box; padding: 0 24px 24px; }
        .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding-bottom: 24px; }
        .row-grouped { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
        .row-grouped:last-child { border-bottom: none; }
        @media (max-width: 800px) {
          .profile-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
      `}</style>
      
      <div 
        className="ios-sheet" 
        style={{ 
          width: '100%', 
          maxWidth: 1000, 
          height: '96vh', // Increased for a 'fuller' feel
          borderBottomLeftRadius: 0, 
          borderBottomRightRadius: 0, 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Visual Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0 }}>
           <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 10 }} />
        </div>

        <div className="profile-container">
          
          {/* HEADER AREA */}
          <div style={{ padding: '8px 0 20px', borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h1 style={{ color: T.txt, margin: 0, fontSize: 26, fontWeight: 900, fontFamily: T.head, letterSpacing: '-0.02em' }}>
                    {customer.name}
                  </h1>
                  {isBlacklisted ? <Badge color={T.danger}>BLACKLISTED</Badge> : <Badge color={T.ok}>ACTIVE</Badge>}
                  {customer.customerTag === 'Red' && <Badge color="#ef4444">🔴 RED TAG</Badge>}
                  {customer.customerTag === 'Amber' && <Badge color={T.warn}>🟡 AMBER TAG</Badge>}
                </div>
                <div style={{ color: T.muted, fontSize: 13, marginTop: 4, fontWeight: 600 }}>
                  <span style={{ color: T.accent }}>{customer.id}</span> · {customer.idNo || 'N/A'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {workerContext?.role === 'admin' && (
                  isBlacklisted ? (
                    <Btn v='secondary' sm onClick={() => setUnblacklistConfirm(true)}>Unblacklist</Btn>
                  ) : (
                    <Btn v='danger' sm onClick={() => setShowBlacklistDialog(true)}>Blacklist</Btn>
                  )
                )}
                <Btn
                  v={customer.customerTag === 'Red' ? 'danger' : customer.customerTag === 'Amber' ? 'gold' : 'ghost'}
                  sm
                  onClick={() => { setTagType(customer.customerTag || 'Red'); setShowTagDialog(true); }}
                  style={customer.customerTag ? { fontWeight: 800 } : {}}
                >
                  {customer.customerTag ? `${customer.customerTag} Tagged ▸` : '+ Tag Customer'}
                </Btn>
                {!isCollectionsOrRecovery && (
                  <Btn v='gold' sm onClick={() => setShowEdit(true)}>Edit Profile</Btn>
                )}
                <div onClick={onClose} style={{ background: T.surface, color: T.txt, borderRadius: 99, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 900, border: `1px solid ${T.border}` }}>✕</div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <Pills opts={tabs} val={tabs.find(t=>tabId(t)===activeTab)} onChange={v=>setActiveTab(tabId(v))} sm />
          </div>

          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            paddingRight: 4,
            paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
            minHeight: 0, // CRITICAL: allows flex child to be smaller than content and thus scroll
            WebkitOverflowScrolling: 'touch' 
          }}>
        {activeTab === 'overview' && (
          <>
            {customer.limitSuspended && (
              <div className="fu pop-in" style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 197, 24, 0.08) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid rgba(239, 68, 68, 0.3)`,
                borderRadius: '20px',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.1)',
                marginBottom: 20
              }}>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  borderRadius: '12px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: T.danger
                }}>
                  <ShieldAlert size={24} style={{ animation: 'pulse 2s infinite' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h4 style={{ color: T.danger, fontSize: 15, fontWeight: 800, margin: 0, fontFamily: T.head }}>CREDIT LIMIT SUSPENDED</h4>
                    <span style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: T.danger,
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '99px',
                      textTransform: 'uppercase',
                      border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>30+ Days Overdue Settlement Penalty</span>
                  </div>
                  <p style={{ color: T.dim, fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
                    This customer's borrowing privileges have been fully suspended because a loan was settled after being overdue for more than 30 days. To recover credit eligibility, the customer must complete a <strong>1-month borrowing break</strong> with no active or new loans.
                  </p>
                  <div style={{
                    marginTop: 14,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    {restorationDate && (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        fontSize: 12.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <Calendar size={14} style={{ color: T.gold }} />
                        <span style={{ color: T.muted }}>Restoration Date:</span>
                        <strong style={{ color: T.txt }}>{restorationDate.toLocaleDateString('en-KE', { dateStyle: 'medium' })}</strong>
                      </div>
                    )}
                    {customer.suspendedBaselineLimit && (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        fontSize: 12.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <Zap size={14} style={{ color: T.accent }} />
                        <span style={{ color: T.muted }}>Restored Limit:</span>
                        <strong style={{ color: T.accent }}>{fmt(Math.round(Number(customer.suspendedBaselineLimit) * 0.5))}</strong>
                        <span style={{ color: T.muted, fontSize: 11 }}>(50% of baseline {fmt(customer.suspendedBaselineLimit)})</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {riskProfile?.currently_overdue_count > 0 && dynamicReductionInfo && (
              <div className="fu pop-in" style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(239, 68, 68, 0.04) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid rgba(245, 158, 11, 0.3)`,
                borderRadius: '20px',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                boxShadow: '0 8px 32px 0 rgba(245, 158, 11, 0.1)',
                marginBottom: 20
              }}>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  borderRadius: '12px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: T.warn
                }}>
                  <AlertTriangle size={24} style={{ animation: 'pulse 2s infinite' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h4 style={{ color: T.warn, fontSize: 15, fontWeight: 800, margin: 0, fontFamily: T.head }}>DYNAMIC LIMIT REDUCTION ACTIVE</h4>
                    <span style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: T.warn,
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '99px',
                      textTransform: 'uppercase',
                      border: '1px solid rgba(245, 158, 11, 0.2)'
                    }}>Arrears Penalty Applied</span>
                  </div>
                  <p style={{ color: T.dim, fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
                    The customer's credit limit has been temporarily scaled down by <strong>{dynamicReductionInfo.percentage}%</strong> due to an active default. Overdue periods of 1 to 30 days trigger dynamic credit limits. Settle all outstanding arrears immediately to restore the full baseline limit and maintain borrowing eligibility.
                  </p>
                  <div style={{
                    marginTop: 14,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      fontSize: 12.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <Clock size={14} style={{ color: T.danger }} />
                      <span style={{ color: T.muted }}>Max Days Overdue:</span>
                      <strong style={{ color: T.danger }}>{dynamicReductionInfo.maxOverdueDays} {dynamicReductionInfo.maxOverdueDays === 1 ? 'day' : 'days'}</strong>
                    </div>
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      fontSize: 12.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <Flame size={14} style={{ color: T.warn }} />
                      <span style={{ color: T.muted }}>Penalty Reduction:</span>
                      <strong style={{ color: T.warn }}>-{dynamicReductionInfo.percentage}%</strong>
                    </div>
                    {riskProfile && (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        fontSize: 12.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <CreditCard size={14} style={{ color: T.ok }} />
                        <span style={{ color: T.muted }}>Scaled Credit Limit:</span>
                        <strong style={{ color: T.ok }}>{fetching ? <ShimmerLimit value={fmt(currentLimit)} /> : <span className="fade-in-limit">{fmt(currentLimit)}</span>}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="profile-grid">
            <Card style={{ padding: 24, borderRadius: 20 }}>
              <h3 style={{ color: T.accent, fontSize: 12, fontWeight: 800, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Identification & Origin</h3>
              <div className="grouped-list">
                <div className="row-grouped"><span style={{ color: T.dim, fontSize: 13 }}>Paybill Account</span><span style={{ color: T.accent, fontWeight: 800, fontFamily: T.mono }}>{customer.accountNumber || customer.id}</span></div>
                <div className="row-grouped">
                  <span style={{ color: T.dim, fontSize: 13 }}>Phone</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: T.txt, fontWeight: 700 }}>{customer.phone || '—'}</span>
                    {customer.phone && (
                      <>
                        <a href={`tel:${customer.phone}`} title="Call customer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: `${T.ok}18`, color: T.ok, border: `1px solid ${T.ok}35`, textDecoration: 'none', flexShrink: 0, transition: 'all 0.2s' }}><PhoneCall size={13} strokeWidth={2.5} /></a>
                        <a href={`https://wa.me/${normalizePhoneForWhatsApp(customer.phone)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp customer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.28)', textDecoration: 'none', flexShrink: 0, transition: 'all 0.2s' }}><MessageSquare size={13} strokeWidth={2.5} /></a>
                      </>
                    )}
                  </div>
                </div>
                <div className="row-grouped">
                  <span style={{ color: T.dim, fontSize: 13 }}>Alt. Phone</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: T.txt }}>{customer.altPhone || '—'}</span>
                    {customer.altPhone && (
                      <>
                        <a href={`tel:${customer.altPhone}`} title="Call alt. number" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: `${T.ok}18`, color: T.ok, border: `1px solid ${T.ok}35`, textDecoration: 'none', flexShrink: 0, transition: 'all 0.2s' }}><PhoneCall size={13} strokeWidth={2.5} /></a>
                        <a href={`https://wa.me/${normalizePhoneForWhatsApp(customer.altPhone)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp alt. number" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.28)', textDecoration: 'none', flexShrink: 0, transition: 'all 0.2s' }}><MessageSquare size={13} strokeWidth={2.5} /></a>
                      </>
                    )}
                  </div>
                </div>
                <div className="row-grouped"><span style={{ color: T.dim, fontSize: 13 }}>Gender</span><span style={{ color: T.txt }}>{customer.gender || '—'}</span></div>
                <div className="row-grouped" style={{ borderBottom: '1px solid var(--border-subtle)', alignItems: 'flex-start' }}>
                  <span style={{ color: T.dim, fontSize: 13 }}>Home / Residence</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {(() => {
                      if (!customer.residence) return <span style={{ color: T.txt, textAlign: 'right' }}>—</span>;
                      if (!customer.residence.includes(' | ')) return <span style={{ color: T.txt, textAlign: 'right', fontSize: 12 }}>{customer.residence}</span>;
                      
                      const parts = customer.residence.split(' | ');
                      const area = parts[0];
                      const details = parts.slice(1).join(' | ').split(', ');

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 280 }}>
                           <Badge color={T.ok} style={{ padding: '2px 8px', fontSize: 11 }}>{area}</Badge>
                           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                             {details.map((d, i) => {
                               const splitIdx = d.indexOf(': ');
                               if (splitIdx === -1) return <span key={i} style={{ color: T.txt, fontSize: 11, textAlign: 'right', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: 4, border: `1px solid ${T.hi}` }}>{d}</span>;
                               const label = d.substring(0, splitIdx);
                               const val = d.substring(splitIdx + 2);
                               return (
                                 <span key={i} style={{ color: T.txt, fontSize: 10, background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: 4, border: `1px solid ${T.hi}`, display: 'inline-flex', gap: 4 }}>
                                   <span style={{ color: T.dim, fontWeight: 700 }}>{label}</span>
                                   <span style={{ fontWeight: 600 }}>{val}</span>
                                 </span>
                               );
                             })}
                           </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="row-grouped"><span style={{ color: T.dim, fontSize: 13 }}>Date Joined</span><span style={{ color: T.txt }}>{customer.joined ? new Date(customer.joined).toLocaleDateString() : '—'}</span></div>
                <div className="row-grouped"><span style={{ color: T.dim, fontSize: 13 }}>Credit Limit</span><span style={{ color: T.ok, fontWeight: 800 }}>{fetching ? <ShimmerLimit value={fmt(currentLimit)} /> : <span className="fade-in-limit">{fmt(currentLimit)}</span>}</span></div>
                <div className="row-grouped"><span style={{ color: T.dim, fontSize: 13 }}>Assigned Officer</span><span style={{ color: T.txt }}>{customer.assigned_officer_worker?.name || 'Unassigned'}</span></div>
                <div className="row-grouped" style={{ border: 'none' }}>
                  <span style={{ color: T.dim, fontSize: 13 }}>Risk Profile</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge color={RC[riskProfile?.calculated_risk] || T.ok}>{riskProfile?.calculated_risk || 'Low'}</Badge>
                    {riskProfile && <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: 'uppercase' }}>{riskProfile.repayment_style}</span>}
                  </div>
                </div>
                {isBlacklisted && (
                  <div className="row-grouped" style={{ border: 'none', background: `${T.danger}10`, padding: '12px 16px', borderRadius: 12, marginTop: 12 }}>
                    <span style={{ color: T.danger, fontSize: 12, fontWeight: 800 }}>BLACKLIST REASON</span>
                    <span style={{ color: T.danger, fontWeight: 700, fontSize: 13 }}>{customer.blReason || 'Admin Action'}</span>
                  </div>
                )}
              </div>
            </Card>

            <Card style={{ padding: 24, borderRadius: 20 }}>
              <h3 style={{ color: T.accent, fontSize: 12, fontWeight: 800, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Business Profile</h3>
              <div className="grouped-list">
                <div className="row-grouped"><span style={{ color: T.dim, fontSize: 13 }}>Trading Name</span><span style={{ color: T.txt, fontWeight: 700 }}>{customer.businessName || '—'}</span></div>
                <div className="row-grouped"><span style={{ color: T.dim, fontSize: 13 }}>Business Category</span><span style={{ color: T.txt }}>{customer.businessType || '—'}</span></div>
                <div className="row-grouped" style={{ border: 'none', alignItems: 'flex-start' }}>
                  <span style={{ color: T.dim, fontSize: 13 }}>Premises / Location</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    {(() => {
                      if (!customer.location) return <span style={{ color: T.txt, textAlign: 'right' }}>—</span>;
                      if (!customer.location.includes(' | ')) return <span style={{ color: T.txt, textAlign: 'right', fontSize: 12 }}>{customer.location}</span>;
                      
                      const parts = customer.location.split(' | ');
                      const area = parts[0];
                      const details = parts.slice(1).join(' | ').split(', ');

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, maxWidth: 280 }}>
                           <Badge color={T.accent} style={{ padding: '2px 8px', fontSize: 11 }}>{area}</Badge>
                           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                             {details.map((d, i) => {
                               const splitIdx = d.indexOf(': ');
                               if (splitIdx === -1) return <span key={i} style={{ color: T.txt, fontSize: 11, textAlign: 'right', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: 4, border: `1px solid ${T.hi}` }}>{d}</span>;
                               const label = d.substring(0, splitIdx);
                               const val = d.substring(splitIdx + 2);
                               return (
                                 <span key={i} style={{ color: T.txt, fontSize: 10, background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: 4, border: `1px solid ${T.hi}`, display: 'inline-flex', gap: 4 }}>
                                   <span style={{ color: T.dim, fontWeight: 700 }}>{label}</span>
                                   <span style={{ fontWeight: 600 }}>{val}</span>
                                 </span>
                               );
                             })}
                           </div>
                        </div>
                      );
                    })()}
                    {customer.gps && (
                      <button 
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.gps.replace(' ', ''))}`, '_blank')}
                        style={{
                           display: 'inline-flex', alignItems: 'center', gap: 6,
                           background: `${T.accent}15`, color: T.accent,
                           border: `1px solid ${T.accent}40`, borderRadius: 99,
                           padding: '6px 14px', fontSize: 12, fontWeight: 800,
                           cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                           boxShadow: `0 4px 12px rgba(0, 212, 170, 0.1)`,
                           letterSpacing: 0.5, textTransform: 'uppercase'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = `${T.accent}25`}
                        onMouseLeave={e => e.currentTarget.style.background = `${T.accent}15`}
                      >
                        <MapPin size={14} strokeWidth={2.5} /> View GPS Map
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <div style={{ gridColumn: 'span 1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                 <h3 style={{ color: T.txt, fontSize: 16, fontWeight: 900, margin: 0 }}>Active Lifetime Loans</h3>
                 {totalAvailableCredit > 0 && (
                   <Badge color={T.accent} style={{ padding: '4px 12px' }}>KES {totalAvailableCredit.toLocaleString()} CREDIT AVAILABLE</Badge>
                 )}
              </div>

              {totalAvailableCredit > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                   {unallocatedPayments.map(p => (
                     <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${T.accent}05`, border: `1px dashed ${T.accent}30`, padding: '12px 16px', borderRadius: 16 }}>
                        <div>
                           <div style={{ fontSize: 10, color: T.dim, fontWeight: 800, textTransform: 'uppercase' }}>Unallocated Deposit</div>
                           <div style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>{fmt(p.amount)} <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.6 }}>Ref: {p.mpesa}</span></div>
                        </div>
                        {!isCollectionsOrRecovery && (
                          <div style={{ display: 'flex', gap: 8 }}>
                             <Btn sm v="secondary" onClick={() => handleReversePayment(p.id, p.amount)}>Reverse</Btn>
                             <Btn sm onClick={() => handleAllocateCredit('payment', p.id, p.amount)} disabled={allocatingCredit || transferableLoans.length === 0}>
                                {allocatingCredit ? '...' : 'Apply to Loan'}
                             </Btn>
                          </div>
                        )}
                     </div>
                   ))}
                   {overpaidLoans.map(l => (
                     <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${T.ok}05`, border: `1px dashed ${T.ok}30`, padding: '12px 16px', borderRadius: 16 }}>
                        <div>
                           <div style={{ fontSize: 10, color: T.dim, fontWeight: 800, textTransform: 'uppercase' }}>Overpayment from {l.id}</div>
                           <div style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>{fmt(Math.abs(l.actualBalance))}</div>
                        </div>
                        {!isCollectionsOrRecovery && (
                          <Btn sm v="gold" onClick={() => handleAllocateCredit('overpayment', l.id, Math.abs(l.actualBalance))} disabled={allocatingCredit || transferableLoans.length === 0}>
                             {allocatingCredit ? '...' : 'Transfer Credit'}
                          </Btn>
                        )}
                     </div>
                   ))}
                </div>
              )}
              {activeLoans.length === 0 ? (
                <div style={{ background: T.aLo, padding: 20, borderRadius: 16, border: `1px solid ${T.accent}30`, color: T.accent, fontWeight: 700, textAlign: 'center' }}>
                   No active loans. Account is clean.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  {activeLoans.map(l => (
                    <Card key={l.id} style={{ padding: 20, borderRadius: 24, borderLeft: `6px solid ${SC[l.phase === 'frozen' ? 'Written off' : l.phase === 'none' ? 'Active' : 'Overdue'] || T.accent}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontWeight: 900, color: T.txt, fontSize: 16 }}>{l.id}</div>
                        <Badge color={l.isFrozen ? T.danger : T.ok}>{l.status}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>Disbursed: {l.disbursed || 'Pending'} · {l.repaymentType || 'Monthly'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, alignItems: 'flex-end' }}>
                        <div>
                          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Principal</div>
                          <div style={{ fontSize: 14, color: T.txt, fontWeight: 800 }}>{fmt(l.amount)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Paid</div>
                          <div style={{ fontSize: 14, color: T.ok, fontWeight: 800 }}>{fmt(l.totalPaid)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Balance</div>
                          <div style={{ fontSize: 18, color: l.actualBalance > 0 ? T.warn : T.ok, fontWeight: 900 }}>{fmt(l.actualBalance)}</div>
                        </div>
                      </div>
                      {l.overdueDays > 0 && <div style={{ fontSize: 11, color: T.danger, marginTop: 12, textAlign: 'right', fontWeight: 800 }}>⚠ {l.overdueDays} DAYS OVERDUE</div>}
                    </Card>
                  ))}
                </div>
              )}
            </div>
            
            <Card style={{ padding: 24, borderRadius: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Lifetime Borrowed</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: T.txt }}>{fmt(totalBorrowed)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Total Repaid</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: T.ok }}>{fmt(payments.filter(p => p.status !== 'Reversed').reduce((a, p) => a + Number(p.amount||0), 0))}</div>
                </div>
              </div>
            </Card>
          </div>
          </>
        )}


        {activeTab === 'riskanalysis' && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 20 }}>
                <Card style={{ padding: 24, borderRadius: 28, background: `linear-gradient(135deg, ${T.card}, ${T.surface})`, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent }}>
                      <ShieldCheck size={20} />
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Risk Rating</div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: RC[riskProfile?.calculated_risk] || T.txt, marginBottom: 4 }}>{riskProfile?.calculated_risk || 'Standard'}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>Based on {riskProfile?.total_loans || 0} historical records</div>
                </Card>

                <Card style={{ padding: 24, borderRadius: 28, background: `linear-gradient(135deg, ${T.card}, ${T.surface})`, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.ok}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ok }}>
                      <RotateCcw size={20} />
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Repayment Behavior</div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: T.ok, marginBottom: 4 }}>{riskProfile?.repayment_style || 'Reliable'}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>{riskProfile?.payment_count || 0} repayments tracked</div>
                </Card>

                <Card style={{ padding: 24, borderRadius: 28, background: `linear-gradient(135deg, ${T.card}, ${T.surface})`, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${(riskProfile?.max_overdue_days || 0) > 0 ? T.danger : T.ok}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: (riskProfile?.max_overdue_days || 0) > 0 ? T.danger : T.ok }}>
                      <Clock size={20} />
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Arrears Exposure</div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: (riskProfile?.max_overdue_days || 0) > 0 ? T.danger : T.txt, marginBottom: 4 }}>{riskProfile?.max_overdue_days || 0} Days</div>
                  <div style={{ fontSize: 12, color: T.muted }}>Max historical delay recorded</div>
                </Card>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 24 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                    Credit Limit Progression <Badge color={T.accent} style={{ fontSize: 9 }}>Auto-Scaling</Badge>
                  </h3>
                  <Card style={{ padding: 32, borderRadius: 32, background: `linear-gradient(165deg, ${T.card}, rgba(0,212,170,0.03))`, border: `1px solid ${T.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Active Account Limit</div>
                        <div style={{ fontSize: 42, fontWeight: 900, color: T.txt, letterSpacing: -1 }}>{fetching ? <ShimmerLimit value={fmt(currentLimit)} /> : <span className="fade-in-limit">{fmt(currentLimit)}</span>}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Growth Phase</div>
                        <Badge style={{ padding: '6px 12px', fontSize: 11 }} color={loansSinceIncrease >= 3 ? T.ok : T.accent}>
                          {loansSinceIncrease >= 3 ? 'SCALING PHASE' : 'STABILIZATION PHASE'}
                        </Badge>
                      </div>
                    </div>

                    {/* Enhanced Progress Visualization */}
                    <div style={{ position: 'relative', height: 60, marginBottom: 40, display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', width: '100%', height: 4, background: T.border, borderRadius: 2 }} />
                      <div style={{ position: 'absolute', width: `${Math.min(loansSinceIncrease / 3 * 100, 100)}%`, height: 4, background: T.accent, borderRadius: 2, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                      
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                        {[1, 2, 3].map(step => {
                           const done = loansSinceIncrease >= step;
                           return (
                             <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                               <div style={{ 
                                 width: 24, height: 24, borderRadius: 12, 
                                 background: done ? T.accent : T.surface, 
                                 border: `2px solid ${done ? T.accent : T.border}`,
                                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                                 color: done ? '#000' : T.muted,
                                 fontSize: 10, fontWeight: 900,
                                 transition: 'all 0.3s'
                               }}>
                                 {done ? <CheckCircle size={14} /> : step}
                               </div>
                               <span style={{ fontSize: 10, color: done ? T.txt : T.dim, fontWeight: 700 }}>Loan {step}</span>
                             </div>
                           );
                        })}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <div style={{ 
                            width: 44, height: 44, borderRadius: 16, 
                            background: loansSinceIncrease >= 3 ? T.accent : T.surface, 
                            border: `2px solid ${loansSinceIncrease >= 3 ? T.accent : T.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginTop: -10,
                            boxShadow: loansSinceIncrease >= 3 ? `0 0 20px ${T.accent}40` : 'none'
                          }}>
                             <Rocket size={24} color={loansSinceIncrease >= 3 ? '#000' : T.dim} />
                          </div>
                          <span style={{ fontSize: 10, color: loansSinceIncrease >= 3 ? T.accent : T.dim, fontWeight: 900 }}>ELITE</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px 24px', borderRadius: 20, border: `1px solid ${T.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, color: T.dim, fontWeight: 700 }}>Suggested Limit Adjustment</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: T.accent, marginTop: 4 }}>{fetching ? <ShimmerLimit value={fmt(suggestedLimit)} /> : <span className="fade-in-limit">{fmt(suggestedLimit)}</span>}</div>
                        </div>
                        {!isCollectionsOrRecovery && (
                          <Btn small disabled={suggestedLimit <= currentLimit || applyingLimit} onClick={handleApplyLimit}>
                            {applyingLimit ? 'Applying...' : 'Apply Increase'}
                          </Btn>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>

                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 20 }}>Eligibility Insights</h3>
                  <Card style={{ padding: 24, borderRadius: 28, height: 'calc(100% - 40px)', background: T.surface, border: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                       {[
                         { label: 'Maturity', val: (riskProfile?.total_loans || 0) >= 3 ? 'Mature' : 'Early', color: (riskProfile?.total_loans || 0) >= 3 ? T.ok : T.warn, icon: '🎯' },
                         { label: 'Repayment', val: (riskProfile?.max_overdue_days || 0) === 0 && (riskProfile?.currently_overdue_count || 0) === 0 ? 'Perfect' : 'Arrears', color: (riskProfile?.max_overdue_days || 0) === 0 && (riskProfile?.currently_overdue_count || 0) === 0 ? T.ok : T.danger, icon: '⚡' },
                         { label: 'Integrity', val: 'Verified', color: T.ok, icon: '🛡️' }
                       ].map((row, i) => (
                         <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${T.border}40` }}>
                           <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <span style={{ fontSize: 18 }}>{row.icon}</span>
                              <span style={{ fontSize: 12, color: T.dim, fontWeight: 700 }}>{row.label}</span>
                           </div>
                           <Badge color={row.color}>{row.val}</Badge>
                         </div>
                       ))}

                       <div style={{ marginTop: 'auto', padding: 16, background: `${T.accent}10`, borderRadius: 16, border: `1px solid ${T.accent}20` }}>
                          <div style={{ fontSize: 11, color: T.accent, fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>System Advice</div>
                          <div style={{ fontSize: 13, color: T.txt, fontWeight: 800 }}>
                             {fetching ? <ShimmerLimit value={"Ready for limit upgrade."} /> :
                               (suggestedLimit > currentLimit 
                                 ? `Ready for ${fmt(suggestedLimit)} upgrade.`
                                 : "Maintain current baseline.")}
                          </div>
                       </div>
                    </div>
                  </Card>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 20 }}>Risk Factor Breakdown</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 16 }}>
                 {[
                   { icon: '⏱️', label: 'Punctuality', val: (riskProfile?.currently_overdue_count || 0) > 0 ? 'Arrears' : (riskProfile?.max_overdue_days || 0) === 0 ? '100%' : 'Standard', color: (riskProfile?.currently_overdue_count || 0) > 0 ? T.danger : (riskProfile?.max_overdue_days || 0) === 0 ? T.ok : T.warn },
                   { icon: '📈', label: 'Growth', val: (riskProfile?.total_loans || 0) > 1 ? `+${((riskProfile?.total_loans || 0) - 1) * 15}%` : 'Baseline', color: (riskProfile?.total_loans || 0) > 1 ? T.ok : T.accent },
                   { icon: '💎', label: 'Integrity', val: (riskProfile?.max_overdue_days || 0) > 30 ? 'Compromised' : (riskProfile?.settled_loans || 0) > 0 ? 'Proven' : 'Standard', color: (riskProfile?.max_overdue_days || 0) > 30 ? T.danger : (riskProfile?.settled_loans || 0) > 0 ? T.ok : T.accent },
                   { icon: '⭐', label: 'Trust', val: (riskProfile?.current_limit || 0) >= 10000 ? 'Tier 3' : (riskProfile?.current_limit || 0) >= 6000 ? 'Tier 2' : 'Tier 1', color: (riskProfile?.current_limit || 0) >= 10000 ? T.gold : (riskProfile?.current_limit || 0) >= 6000 ? T.ok : T.accent }
                 ].map((s, i) => (
                   <Card key={i} style={{ padding: 20, borderRadius: 24, textAlign: 'center', background: T.surface, border: `1px solid ${T.border}40` }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                      <div style={{ fontSize: 10, color: T.muted, fontWeight: 800, textTransform: 'uppercase' }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.val}</div>
                   </Card>
                 ))}
              </div>
              </div>
            </div>
          </div>
        )}


        {activeTab === 'loanhistory' && (
          <div className='dt-shell' style={{ maxHeight: '100%' }}>
            <DT cols={[
              { k: 'id', l: 'Loan ID', r: (v, row) => <span onClick={() => onSelectLoan && onSelectLoan(row)} style={{color:T.accent,fontFamily:T.mono,fontWeight:700,cursor:'pointer',borderBottom:`1px dashed ${T.accent}50`}}>{v}</span> },
              { k: 'amount', l: 'Principal', r: v => <span style={{fontFamily:T.mono}}>{fmt(v)}</span> },
              { k: 'totalPayable', l: 'Total Due', r: v => <span style={{fontFamily:T.mono,color:T.accent}}>{fmt(v)}</span> },
              { k: 'actualBalance', l: 'Remaining', r: v => <span style={{fontFamily:T.mono,color:v>0?T.warn:v<0?T.ok:T.muted,fontWeight:700}}>{fmt(v)}</span> },
              { k: 'disbursed', l: 'Disbursed', r: v => v || '—' },
              { k: 'status', l: 'Status', r: v => <Badge color={SC[v]||T.muted}>{v}</Badge> }
            ]} rows={processedLoans} />
            {processedLoans.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>No loans found for this customer.</div>}
          </div>
        )}

        {activeTab === 'paymenthistory' && (
          <div className='dt-shell' style={{ maxHeight: '100%' }}>
            <DT cols={[
              { k: 'id', l: 'Receipt ID', r: v => <span style={{color:T.muted,fontFamily:T.mono,fontSize:11}}>{v}</span> },
              { k: 'amount', l: 'Amount', r: v => <span style={{color: v < 0 ? T.warn : T.ok, fontFamily: T.mono, fontWeight: 700}}>{fmt(v)}</span> },
              { k: 'date', l: 'Date', r: v => ts(v) },
              { k: 'mpesa', l: 'Transaction', r: v => <span style={{fontFamily:T.mono}}>{v||'Manual'}</span> },
              { k: 'loanId', l: 'Allocation Map', r: (v, row) => {
                const isReg = row.isRegFee || (row.notes && (row.notes.toLowerCase().includes('registration') || row.notes.toLowerCase().includes('reg fee')));
                if (isReg) return <Badge color={T.accent} style={{fontSize:10}}>Registration Fee</Badge>;
                return v ? <span style={{color:T.accent,fontFamily:T.mono,fontSize:11}}>{v}</span> : 'Unallocated';
              }},
              { k: 'notes', l: 'Notes', r: (v, row) => <PaymentNoteCell payment={row} onUpdate={handlePaymentNoteUpdate} addAudit={addAudit} showToast={showToast} disabled={isCollectionsOrRecovery} /> }
            ]} rows={payments} />
            {payments.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>No payments recorded.</div>}
          </div>
        )}

        {activeTab === 'interactions' && (
          <InteractionsTab customerId={customerId} initialRecords={interactions} loans={processedLoans} payments={payments} smsLogs={smsLogs} queuedSms={queuedSms} workerContext={workerContext} setGlobalInteractions={setGlobalInteractions} addAudit={addAudit} workerMap={workerMap} showToast={showToast} />
        )}

        {!isCollectionsOrRecovery && activeTab === 'queuedmessages' && (
          <div style={{ padding: 24 }}>
            <QueuedSmsTab customer={customer} showToast={showToast} setSmsLogs={setSmsLogs} />
          </div>
        )}

        {activeTab === 'documents' && (
          <DocumentsTab customerId={customerId} customer={customer} showToast={showToast} />
        )}

        {activeTab === 'nextofkin' && (
          <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
             {[
               { n: 1, name: customer.n1n, phone: customer.n1p, rel: customer.n1r },
               { n: 2, name: customer.n2n, phone: customer.n2p, rel: customer.n2r },
               { n: 3, name: customer.n3n, phone: customer.n3p, rel: customer.n3r }
             ].map(nok => nok.name && (
               <Card key={nok.n} style={{ padding: 24 }}>
                  <h3 style={{ color: T.accent, fontSize: 13, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>{nok.n === 1 ? 'Primary' : nok.n === 2 ? 'Secondary' : 'Tertiary'} Next of Kin</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, auto) 1fr', gap: '12px 24px', fontSize: 13 }}>
                    <span style={{ color: T.muted }}>Name</span><span style={{ color: T.txt, fontWeight: 600 }}>{nok.name}</span>
                    <span style={{ color: T.muted }}>Relation</span><span style={{ color: T.txt }}>{nok.rel}</span>
                    <span style={{ color: T.muted }}>Phone</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: T.txt }}>{nok.phone || '—'}</span>
                      {nok.phone && (
                        <>
                          <a href={`tel:${nok.phone}`} title={`Call ${nok.name}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: `${T.ok}18`, color: T.ok, border: `1px solid ${T.ok}35`, textDecoration: 'none', flexShrink: 0, transition: 'all 0.2s' }}><PhoneCall size={12} strokeWidth={2.5} /></a>
                          <a href={`https://wa.me/${normalizePhoneForWhatsApp(nok.phone)}`} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${nok.name}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.28)', textDecoration: 'none', flexShrink: 0, transition: 'all 0.2s' }}><MessageSquare size={12} strokeWidth={2.5} /></a>
                        </>
                      )}
                    </div>
                  </div>
               </Card>
             ))}
             {!customer.n1n && <Alert type='warn'>No Next of Kin registered on file.</Alert>}
          </div>
        )}

        {/* ── Tag History Tab ── */}
        {activeTab === 'taghistory' && (
          <div>
            {/* Current Tag Status Banner */}
            {customer.customerTag === 'Red' && (
              <div className="fu pop-in" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.04) 100%)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 20, padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, boxShadow: '0 8px 32px rgba(239,68,68,0.08)' }}>
                <div style={{ background: 'rgba(239,68,68,0.15)', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0, border: '1px solid rgba(239,68,68,0.25)' }}>
                  <Flame size={24} style={{ animation: 'pulse 2s infinite' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h4 style={{ color: '#ef4444', fontSize: 14, fontWeight: 800, margin: 0, fontFamily: T.head }}>RED TAG — BAD FAITH CUSTOMER</h4>
                    <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', border: '1px solid rgba(239,68,68,0.20)', letterSpacing: 0.4 }}>Disbursement Blocked</span>
                  </div>
                  <p style={{ color: T.dim, fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>{customer.customerTagReason || 'No reason on record.'}</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Btn v='secondary' sm onClick={() => { setTagType('Red'); setShowTagDialog(true); }}>Change Tag</Btn>
                    {workerContext?.role === 'admin' && (
                      <Btn v='danger' sm onClick={() => setShowRemoveTagConfirm(true)}>Remove Tag</Btn>
                    )}
                  </div>
                </div>
              </div>
            )}
            {customer.customerTag === 'Amber' && (
              <div className="fu pop-in" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.04) 100%)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 20, padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, boxShadow: '0 8px 32px rgba(245,158,11,0.08)' }}>
                <div style={{ background: 'rgba(245,158,11,0.15)', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.warn, flexShrink: 0, border: '1px solid rgba(245,158,11,0.25)' }}>
                  <AlertTriangle size={24} style={{ animation: 'pulse 2s infinite' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h4 style={{ color: T.warn, fontSize: 14, fontWeight: 800, margin: 0, fontFamily: T.head }}>AMBER TAG — BAD LUCK CUSTOMER</h4>
                    <span style={{ background: 'rgba(245,158,11,0.15)', color: T.warn, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', border: '1px solid rgba(245,158,11,0.20)', letterSpacing: 0.4 }}>Disbursement Blocked</span>
                  </div>
                  <p style={{ color: T.dim, fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>{customer.customerTagReason || 'No reason on record.'}</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Btn v='secondary' sm onClick={() => { setTagType('Amber'); setShowTagDialog(true); }}>Change Tag</Btn>
                    {workerContext?.role === 'admin' && (
                      <Btn v='danger' sm onClick={() => setShowRemoveTagConfirm(true)}>Remove Tag</Btn>
                    )}
                  </div>
                </div>
              </div>
            )}
            {!customer.customerTag && (
              <div style={{ background: T.aLo, border: `1px solid ${T.accent}25`, borderRadius: 16, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                <ShieldCheck size={20} style={{ color: T.ok, flexShrink: 0 }} />
                <span style={{ color: T.dim, fontSize: 13, fontWeight: 600 }}>No active tag — this customer's account is clean.</span>
                <Btn v='secondary' sm style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={() => setShowTagDialog(true)}>Apply Tag</Btn>
              </div>
            )}

            {/* History Log */}
            <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>Tag History</div>
            {customerTags.length === 0 ? (
              <Alert type='info'>No tags have been applied to this customer yet.</Alert>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {customerTags.map((tag) => {
                  const isRed = tag.tag_type === 'Red';
                  const isAmber = tag.tag_type === 'Amber';
                  const tagColor = isRed ? '#ef4444' : isAmber ? T.warn : T.ok;
                  const tagIcon = isRed ? '🔴' : isAmber ? '🟡' : '✅';
                  const tagLabel = isRed ? 'Red Tag Applied' : isAmber ? 'Amber Tag Applied' : 'Tag Removed';
                  return (
                    <div key={tag.id} style={{ background: T.card, border: `1px solid ${tagColor}25`, borderLeft: `3px solid ${tagColor}`, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{tagIcon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                          <span style={{ color: tagColor, fontWeight: 800, fontSize: 13 }}>{tagLabel}</span>
                          <span style={{ color: T.dim, fontSize: 11, fontWeight: 600, fontFamily: T.mono }}>
                            {new Date(tag.applied_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <div style={{ color: T.txt, fontSize: 13, lineHeight: 1.45, marginBottom: 4 }}>{tag.reason}</div>
                        <div style={{ color: T.muted, fontSize: 11, fontWeight: 600 }}>By: {tag.applied_by_name || 'System'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>

      {showEdit && (
        <CustomerEditForm customer={customer} workers={workers} allCustomers={customers} onSave={handleUpdate} onClose={() => setShowEdit(false)} />
      )}

      {showBlacklistDialog && (
        <Dialog title="Blacklist Customer" onClose={() => setShowBlacklistDialog(false)} width={450}>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Alert type='danger'>
                 <b>Warning:</b> Blacklisting {customer.name} will freeze their credit accessibility and flag them across all dashboards.
              </Alert>
              <FI 
                label="Reason for Blacklisting" 
                type="textarea" 
                placeholder="e.g. Chronic default, fraud suspicion, etc." 
                value={blacklistReason} 
                onChange={setBlacklistReason} 
              />
              <div style={{ display: 'flex', gap: 12 }}>
                 <Btn v='secondary' onClick={() => setShowBlacklistDialog(false)} full>Cancel</Btn>
                 <Btn v='danger' onClick={handleBlacklist} disabled={savingBl} full>Confirm Blacklist</Btn>
              </div>
           </div>
        </Dialog>
      )}

      {unblacklistConfirm && (
        <ConfirmDialog 
          title="Unblacklist Customer" 
          message={`Are you sure you want to remove ${customer.name} from the blacklist? This will restore their eligibility for new loans.`} 
          confirmLabel="Yes, Reinstate" 
          confirmVariant="ok" 
          onConfirm={handleUnblacklist} 
          onCancel={() => setUnblacklistConfirm(false)} 
        />
      )}

      {/* ── Apply / Change Customer Tag Dialog ── */}
      {showTagDialog && (
        <Dialog title={customer.customerTag ? 'Change Customer Tag' : 'Apply Customer Tag'} onClose={() => { setShowTagDialog(false); setTagReason(''); }} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {customer.customerTag && (
              <Alert type='warn'>
                This customer currently has a <b>{customer.customerTag} Tag</b>. Applying a new tag will replace it.
              </Alert>
            )}
            <div>
              <div style={{ color: T.muted, fontSize: 11, fontWeight: 800, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Select Tag Type</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => setTagType('Red')}
                  style={{ padding: '14px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left', background: tagType === 'Red' ? 'rgba(239,68,68,0.12)' : T.card, border: tagType === 'Red' ? '2px solid #ef4444' : `1px solid ${T.border}`, color: T.txt, transition: 'all 0.2s' }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🔴</div>
                  <div style={{ fontWeight: 800, color: '#ef4444', fontSize: 13, marginBottom: 4 }}>Red Tag</div>
                  <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.4 }}>Fraud, forgery, deliberate default, bad faith conduct</div>
                </button>
                <button
                  onClick={() => setTagType('Amber')}
                  style={{ padding: '14px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left', background: tagType === 'Amber' ? 'rgba(245,158,11,0.12)' : T.card, border: tagType === 'Amber' ? `2px solid ${T.warn}` : `1px solid ${T.border}`, color: T.txt, transition: 'all 0.2s' }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🟡</div>
                  <div style={{ fontWeight: 800, color: T.warn, fontSize: 13, marginBottom: 4 }}>Amber Tag</div>
                  <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.4 }}>Illness, job loss, accident, genuine hardship</div>
                </button>
              </div>
            </div>
            <FI
              label="Reason / Comments (required)"
              type="textarea"
              placeholder="Describe the circumstances or evidence leading to this classification..."
              value={tagReason}
              onChange={setTagReason}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn v='secondary' onClick={() => { setShowTagDialog(false); setTagReason(''); }} full>Cancel</Btn>
              <Btn v={tagType === 'Red' ? 'danger' : 'gold'} onClick={handleApplyTag} disabled={savingTag || !tagReason.trim()} full>
                {savingTag ? 'Applying...' : `Apply ${tagType} Tag`}
              </Btn>
            </div>
          </div>
        </Dialog>
      )}

      {/* ── Remove Tag Confirm ── */}
      {showRemoveTagConfirm && (
        <ConfirmDialog
          title="Remove Customer Tag"
          message={`Remove the ${customer.customerTag} Tag from ${customer.name}? This will unblock disbursements. The action will be recorded in the tag history.`}
          confirmLabel="Yes, Remove Tag"
          confirmVariant="danger"
          onConfirm={handleRemoveTag}
          onCancel={() => setShowRemoveTagConfirm(false)}
        />
      )}

      {/* ── Credit Transfer Loan Picker / Confirm Dialog ── */}
      {creditPending && (
        <Dialog title="Select Allocation Target" onClose={() => setCreditPending(null)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: T.aLo, padding: 16, borderRadius: 16, border: `1px solid ${T.accent}20` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Transferring Credit
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.txt }}>
                KES {Number(creditPending.amount).toLocaleString('en-KE')}
              </div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 4, fontWeight: 600 }}>
                Source: {creditPending.sourceType === 'payment' 
                  ? `Unallocated deposit (${creditPending.sourceId})` 
                  : `Overpayment on loan ${creditPending.sourceId}`}
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: T.txt, marginTop: 8, paddingLeft: 4 }}>
              Apply to which target?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {creditPending.sourceType === 'payment' && (
                 <button
                   onClick={() => executeCreditTransfer('REG_FEE')}
                   disabled={allocatingCredit}
                   style={{
                     display: 'flex', alignItems: 'center', gap: 16,
                     padding: '16px 20px', borderRadius: 18, cursor: 'pointer',
                     background: T.card, border: `1px solid ${T.border}`,
                     color: T.txt, textAlign: 'left', transition: 'all 0.2s'
                   }}
                   onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.aLo; }}
                   onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.card; }}
                 >
                   <div style={{ width: 44, height: 44, borderRadius: 14, background: `${T.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent }}>
                      <BadgeCheck size={24} />
                   </div>
                   <div>
                      <div style={{ fontWeight: 900, fontSize: 15 }}>Registration Fee</div>
                      <div style={{ fontSize: 12, color: T.dim, fontWeight: 600 }}>Mark this payment as the customer's onboarding fee</div>
                   </div>
                 </button>
              )}
              {transferableLoans.map(l => {
                const newBal = Math.max(0, l.actualBalance - creditPending.amount);
                return (
                  <button
                    key={l.id}
                    onClick={() => executeCreditTransfer(l.id)}
                    disabled={allocatingCredit}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 10,
                      padding: '16px 20px', borderRadius: 18, cursor: 'pointer',
                      background: T.card, border: `1px solid ${T.border}`,
                      color: T.txt, textAlign: 'left', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.aLo; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.card; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 15, fontFamily: T.mono }}>{l.id}</div>
                        <div style={{ fontSize: 12, color: T.dim, fontWeight: 600 }}>{l.repaymentType} · {l.status}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: T.dim, fontWeight: 800, textTransform: 'uppercase' }}>Current Balance</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: T.warn }}>{fmt(l.actualBalance)}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: T.surface, padding: '10px 14px', borderRadius: 12, border: `1px solid ${T.border}` }}>
                       <div>
                          <div style={{ fontSize: 9, color: T.dim, fontWeight: 800, textTransform: 'uppercase' }}>New Balance</div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: newBal <= 0 ? T.ok : T.txt }}>
                             {fmt(newBal)}
                          </div>
                       </div>
                       {newBal <= 0 && (
                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                           <Badge v='success' sm>Will Settle ✓</Badge>
                         </div>
                       )}
                    </div>
                  </button>
                );
              })}
            </div>
            
            <Btn v='secondary' onClick={() => setCreditPending(null)} style={{ marginTop: 10 }}>Cancel</Btn>
          </div>
        </Dialog>
      )}
    </div>

  );
}

// =========================================================
// INTERACTIONS SUB-COMPONENT
// =========================================================
function InteractionsTab({ customerId, initialRecords, loans = [], payments = [], smsLogs = [], queuedSms = [], workerContext, setGlobalInteractions, addAudit, workerMap, showToast }) {
  const [logs, setLogs] = useState(initialRecords);
  const [f, setF] = useState({ type: 'Phone Call', notes: '', date: now() });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL');

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [editingId, setEditingId] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const handleUpdate = async (item) => {
    if (!editNotes.trim() || editNotes.trim() === item.notes) {
      setEditingId(null);
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase.from('interactions').update({ notes: editNotes.trim() }).eq('id', item.id);
      if (error) throw error;
      
      const updated = logs.map(l => l.id === item.id ? { ...l, notes: editNotes.trim() } : l);
      setLogs(updated);
      if (setGlobalInteractions) setGlobalInteractions(prev => prev.map(l => l.id === item.id ? { ...l, notes: editNotes.trim() } : l));
      
      if (addAudit) addAudit('Updated Interaction', customerId, `ID: ${item.id}`);
      showToast('Interaction updated', 'ok');
      setEditingId(null);
    } catch (e) {
      showToast('Failed to update interaction', 'danger');
    } finally {
      setSavingEdit(false);
    }
  };

  // Unified Timeline Logic
  const timeline = useMemo(() => {
    const events = [];

    // 1. Manual Interactions (Communication)
    // Prefer created_at (full ISO timestamp from Supabase) over date (which may be
    // a date-only string like "2026-05-05" that JS parses as UTC midnight → 03:00 EAT).
    logs.forEach(l => {
      events.push({
        id: l.id,
        category: 'COMMUNICATION',
        type: l.type,
        date: l.createdAt || l.created_at || l.date,
        notes: l.notes,
        officer: l.officer || 'System',
        _isNew: l._isNew
      });
    });

    // 2. Loan Lifecycle Events
    loans.forEach(l => {
      // Application
      events.push({
        id: `loan-app-${l.id}`,
        category: 'SYSTEM',
        type: 'Application',
        date: l.createdAt || l.created_at,
        notes: `Loan application ${l.id} submitted for ${fmt(l.amount)}.`,
        officer: l.officer || 'System'
      });

      // Approval
      if (l.status === 'Approved' || l.status === 'Active' || l.status === 'Overdue' || l.status === 'Settled') {
         events.push({
           id: `loan-appr-${l.id}`,
           category: 'SYSTEM',
           type: 'Approval',
           date: l.disbursed || l.createdAt, // Fallback to createdAt if date unknown
           notes: `Loan ${l.id} was reviewed and approved.`,
           officer: l.officer || 'System'
         });
      }

      // Disbursement
      if (l.disbursed) {
        events.push({
          id: `loan-disb-${l.id}`,
          category: 'FINANCIAL',
          type: 'Disbursement',
          date: l.disbursed,
          notes: `Funds of ${fmt(l.amount)} were released via ${l.mpesa || 'M-Pesa'}.`,
          officer: 'System'
        });
      }
    });

    // 3. Payment Events
    payments.forEach(p => {
      const isTransfer = (p.amount < 0 || (p.notes && p.notes.toLowerCase().includes('transfer')));
      let label = p.isRegFee ? 'Registration fee' : (isTransfer ? 'Credit transfer' : 'Loan payment');
      let notes = `${label} of ${fmt(p.amount)} ${p.amount < 0 ? 'processed' : 'received'}. Ref: ${p.mpesa || 'Manual'}`;
      if (p.notes) notes += ` (${p.notes})`;
      events.push({
        id: `pay-${p.id}`,
        category: 'FINANCIAL',
        type: p.isRegFee ? 'Registration' : (isTransfer ? 'Transfer' : 'Payment'),
        date: p.date,
        notes: notes,
        officer: p.allocatedBy || 'M-Pesa'
      });
    });

    // 4. SMS Logs (Automated)
    smsLogs.forEach(s => {
      events.push({
        id: `sms-${s.id}`,
        category: 'COMMUNICATION',
        type: 'SMS Sent',
        date: s.created_at,
        notes: s.message,
        officer: 'Automated System'
      });
    });

    // 5. Queued Messages
    queuedSms.forEach(q => {
      if (q.status === 'sent') return; // Hide sent queued messages to prevent duplication with sms_logs
      events.push({
        id: `queued-${q.id}`,
        category: 'COMMUNICATION',
        type: `Queued SMS (${q.status})`,
        date: q.send_at,
        notes: `Scheduled for ${new Date(q.send_at).toLocaleString('en-KE')}:\n"${q.message}"`,
        officer: 'System'
      });
    });

    // Sort descending
    const sorted = events.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Apply Filter
    const filtered = activeFilter === 'ALL' ? sorted : sorted.filter(e => e.category === activeFilter);

    // Group by Date
    const groups = {};
    filtered.forEach(item => {
      const dt = new Date(item.date);
      const today = new Date();
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      
      let key = dt.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
      if (dt.toDateString() === today.toDateString()) key = 'Today';
      else if (dt.toDateString() === yesterday.toDateString()) key = 'Yesterday';
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return groups;
  }, [logs, loans, payments, smsLogs, queuedSms, activeFilter]);

  const CAT_CONFIG = {
    COMMUNICATION: { icon: <MessageSquare size={16} />, color: T.accent, label: 'Communications' },
    FINANCIAL: { icon: <Wallet size={16} />, color: T.ok, label: 'Financial' },
    SYSTEM: { icon: <ShieldCheck size={16} />, color: T.warn, label: 'System' },
  };

  const TYPE_ICONS = {
    'Phone Call': <PhoneCall size={14} />,
    'SMS': <MessageSquare size={14} />,
    'SMS Sent': <Send size={14} />,
    'WhatsApp': <MessageSquare size={14} color="#25D366" />,
    'Field Visit': <MapPin size={14} />,
    'System Note': <Monitor size={14} />,
    'Demand Letter': <FileText size={14} />,
    'Application': <FileText size={14} />,
    'Approval': <CheckCircle size={14} />,
    'Disbursement': <Rocket size={14} />,
    'Payment': <Zap size={14} />,
    'Transfer': <ArrowRightLeft size={14} />,
    'Registration': <BadgeCheck size={14} />,
    'Queued SMS (queued)': <Clock size={14} color={T.warn} />,
    'Queued SMS (sent)': <CheckCircle size={14} color={T.ok} />,
    'Queued SMS (failed)': <AlertTriangle size={14} color={T.danger} />,
    'Queued SMS (cancelled)': <XCircle size={14} color={T.muted} />
  };

  const handleSave = async () => {
    if (!f.notes) { showToast('Notes required', 'warn'); return; }
    try {
      setSaving(true);
      const interactionId = uid('LOG');
      const nowTs = new Date().toISOString();
      const interactionObj = {
        id: interactionId,
        customerId: customerId,
        type: f.type,
        notes: f.notes,
        date: f.date || now(),
        officer: workerContext?.name || 'Self',
      };


      const entry = toSupabaseInteraction(interactionObj);
      const { error } = await supabase.from('interactions').insert([entry]);
      if (error) throw error;

      // Audit Trail
      await sbAuditInsert({
        action: 'Customer Interaction Logged',
        user_name: workerContext?.name || 'System',
        target_id: customerId,
        detail: `${f.type}: ${f.notes.substring(0, 50)}${f.notes.length > 50 ? '...' : ''}`
      });
      
      // Use the full ISO timestamp (nowTs) so the timeline shows the correct time,
      // not the date-only string which parses as UTC midnight and shows 03:00 in EAT.
      const interactionFull = fromSupabaseInteraction({...entry, date: nowTs, created_at: nowTs});

      if (!interactionFull.officer) interactionFull.officer = interactionObj.officer;
      
      // Attach a temporary animated flag
      interactionFull._isNew = true;
      setLogs([interactionFull, ...logs]);
      if (setGlobalInteractions) setGlobalInteractions(prev => [interactionFull, ...prev]);

      
      // UX Feedback
      setF({ type: 'Phone Call', notes: '', date: now() });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);

    } catch (e) {
      show('Failed to log interaction', 'danger');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ 
      display: isMobile ? 'flex' : 'grid', 
      flexDirection: 'column',
      gridTemplateColumns: isMobile ? 'none' : 'minmax(300px, 360px) 1fr', 
      gap: isMobile ? 24 : 40, 
      paddingBottom: 32,
      padding: isMobile ? '0 4px' : 0
    }}>
      <div style={{ position: isMobile ? 'relative' : 'sticky', top: 0, height: 'fit-content', zIndex: 10 }}>
        <Card style={{ 
          padding: isMobile ? 20 : 28, 
          background: `linear-gradient(145deg, ${T.card}, rgba(0,0,0,0.4))`, 
          border: `1px solid ${T.hi}`, 
          borderRadius: isMobile ? 20 : 24,
          boxShadow: `0 12px 32px rgba(0,0,0,0.15)`
        }}>
          <h3 style={{ color: T.txt, fontSize: isMobile ? 15 : 17, fontWeight: 800, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: isMobile ? 18 : 22, filter: 'drop-shadow(0 2px 8px rgba(0,212,170,0.3))' }}>💬</span> Record Interaction
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <FI label="Communication Type" type="select" options={['Phone Call', 'SMS', 'WhatsApp', 'Field Visit', 'System Note', 'Demand Letter']} 
               value={f.type} onChange={v=>setF({...f, type: v})} />
            <FI label="Log Date" type="date" value={f.date} onChange={v=>setF({...f, date: v})} />
            <FI label="Notes & Outcome" type="textarea" value={f.notes} onChange={v=>setF({...f, notes: v})} placeholder="Summarize the discussion..." />
          </div>
          
          <button 
            onClick={handleSave} 
            disabled={saving || justSaved}
            style={{ 
              width: '100%',
              height: 48, 
              marginTop: 16,
              borderRadius: 14,
              border: 'none',
              background: justSaved ? `linear-gradient(135deg, ${T.ok} 0%, #00a884 100%)` : saving ? `${T.cardHi}` : `linear-gradient(135deg, ${T.accent} 0%, #00a884 100%)`,
              color: justSaved ? '#fff' : saving ? T.muted : '#000',
              fontWeight: 800,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: saving || justSaved ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: justSaved ? `0 8px 24px ${T.ok}40` : saving ? 'none' : `0 8px 24px ${T.accent}40`,
              transform: saving ? 'scale(0.98)' : 'scale(1)'
            }}
          >
            {justSaved ? <><CheckCircle2 size={18} /> Recorded Successfully</> : saving ? <><Loader2 className="spin" size={18} /> Processing...</> : '+ Save to Timeline'}
          </button>
        </Card>
      </div>

      <div style={{ paddingLeft: isMobile ? 0 : 10 }}>
        {/* Modern Filter Pills */}
        <div style={{ 
          display: 'flex', 
          gap: 10, 
          marginBottom: 24, 
          overflowX: 'auto', 
          paddingBottom: 4,
          maskImage: 'linear-gradient(to right, black 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 100%)'
        }}>
          {['ALL', 'FINANCIAL', 'COMMUNICATION', 'SYSTEM'].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: 12,
                border: `1px solid ${activeFilter === cat ? T.accent : T.border}`,
                background: activeFilter === cat ? `${T.accent}20` : 'rgba(255,255,255,0.03)',
                color: activeFilter === cat ? T.accent : T.muted,
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 1,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap'
              }}
            >
              {cat === 'ALL' ? 'Everything' : cat}
            </button>
          ))}
        </div>

        {Object.keys(timeline).length === 0 ? <Alert type='info'>No prior interactions recorded on this file.</Alert> : (
          <div style={{ position: 'relative' }}>
            {/* Master Timeline Line */}
            <div style={{ position: 'absolute', left: 24, top: 40, bottom: 0, width: 2, background: `linear-gradient(to bottom, ${T.border}, transparent)`, zIndex: 0 }} />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32, position: 'relative', zIndex: 1 }}>
               {Object.entries(timeline).map(([dateKey, items], gIdx) => (
                 <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Date Header */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 16, 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 10, 
                      background: 'rgba(6,10,16,0.6)', 
                      backdropFilter: 'blur(10px)',
                      padding: '8px 0',
                      margin: '0 -4px'
                    }}>
                      <div style={{ width: 10, height: 10, borderRadius: 5, background: T.border, marginLeft: 20 }} />
                      <span style={{ color: T.muted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2 }}>{dateKey}</span>
                      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${T.border}, transparent)` }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {items.map((item, idx) => {
                        const dt = new Date(item.date);
                        const time = dt.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });
                        const cat = CAT_CONFIG[item.category] || CAT_CONFIG.SYSTEM;
                        const typeColor = item._isNew ? T.accent : cat.color;
                        
                        return (
                          <div key={item.id} style={{ position: 'relative', display: 'flex', gap: isMobile ? 16 : 24, paddingLeft: isMobile ? 4 : 8 }}>
                            {/* Modern Icon Bubble */}
                            <div style={{ 
                              flexShrink: 0,
                              width: 32, height: 32, borderRadius: 10, 
                              background: `${typeColor}15`, border: `1px solid ${typeColor}40`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', color: typeColor,
                              boxShadow: `0 4px 12px ${typeColor}20`,
                              marginTop: 4,
                              position: 'relative',
                              zIndex: 2,
                              animation: item._isNew ? 'pulseGlow 2s forwards' : 'none'
                            }}>
                              {TYPE_ICONS[item.type] || cat.icon}
                            </div>
                            
                            <div className="pop" style={{ 
                              flex: 1, 
                              animationName: item._isNew ? 'slideInRight' : 'none',
                              animationDuration: '0.5s',
                              animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                              animationFillMode: 'forwards',
                              animationDelay: `${idx * 0.05}s`
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ color: T.txt, fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>{item.type}</span>
                                    <span style={{ color: T.dim, fontSize: 10, fontWeight: 700, fontFamily: T.mono }}>{time}</span>
                                  </div>
                                  <div style={{ fontSize: 9, color: typeColor, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, background: `${typeColor}10`, padding: '2px 8px', borderRadius: 6 }}>{item.category}</div>
                              </div>
                              
                              <Card style={{ 
                                padding: '16px 20px', 
                                background: 'var(--card, #FFFFFF)',
                                border: `1px solid ${item.category === 'COMMUNICATION' ? `${T.accent}40` : item._isNew ? typeColor : 'var(--border, #E2E8F0)'}`,
                                borderRadius: 16,
                                borderTopLeftRadius: 4,
                                boxShadow: item.category === 'COMMUNICATION' ? `0 8px 24px ${T.accent}10` : '0 2px 12px rgba(0,0,0,0.06)',
                                position: 'relative',
                                overflow: 'hidden'
                              }}>
                                {item.category === 'COMMUNICATION' && (
                                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: T.accent }} />
                                )}
                                <div style={{ 
                                  color: T.txt, 
                                  fontSize: 13, 
                                  lineHeight: 1.6, 
                                  whiteSpace: 'pre-wrap', 
                                  marginBottom: 10
                                }}>
                                  {editingId === item.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                                      <textarea 
                                        autoFocus
                                        value={editNotes} 
                                        onChange={e => setEditNotes(e.target.value)} 
                                        disabled={savingEdit}
                                        style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 8, background: T.cardHi, color: T.txt, border: `1px solid ${T.accent}`, fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                                      />
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <Btn sm onClick={() => handleUpdate(item)} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save'}</Btn>
                                        <Btn sm v="ghost" onClick={() => setEditingId(null)} disabled={savingEdit}>Cancel</Btn>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ position: 'relative' }}>
                                      {item.notes}
                                      {item.category === 'COMMUNICATION' && (
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setEditingId(item.id); setEditNotes(item.notes || ''); }} 
                                          style={{ marginLeft: 8, background: `${T.accent}15`, border: `1px solid ${T.accent}30`, color: T.accent, cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                                        >
                                          Edit
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.dim, fontSize: 10, fontWeight: 600 }}>
                                     <div style={{ width: 14, height: 14, borderRadius: 7, background: T.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: T.txt }}>
                                       {item.officer?.charAt(0) || 'S'}
                                     </div>
                                     {item.officer || 'System'}
                                  </div>
                                  {item.category === 'COMMUNICATION' && (
                                    <div style={{ fontSize: 9, color: T.muted, fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <ShieldCheck size={10} /> Verified Delivery
                                    </div>
                                  )}
                                </div>
                              </Card>
                            </div>
                            
                            {/* Inline animation styles for new logs */}
                            {item._isNew && (
                              <style>{`
                                @keyframes slideInRight {
                                  0% { opacity: 0; transform: translateX(20px) scale(0.95); }
                                  100% { opacity: 1; transform: translateX(0) scale(1); }
                                }
                                @keyframes pulseGlow {
                                  0% { box-shadow: 0 0 0 0 ${typeColor}80; }
                                  70% { box-shadow: 0 0 0 10px ${typeColor}00; }
                                  100% { box-shadow: 0 0 0 0 ${typeColor}00; }
                                }
                              `}</style>
                            )}
                          </div>
                        );
                      })}
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================
// DOCUMENTS SUB-COMPONENT
// =========================================================
function DocPreviewModal({ preview, onClose, T }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  
  return (
    <div className="dialog-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column', padding: 'clamp(12px, 4vw, 40px)', alignItems: 'center' }}>
      <div className="pop" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%', maxWidth: 1100, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
             {preview.type.startsWith('image/') ? <ImageIcon size={22} /> : <FileText size={22} />}
           </div>
           <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview.type.toUpperCase()}</div>
           </div>
        </div>
        <button 
          onClick={onClose} 
          className="hover-pop"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          Close <X size={18} />
        </button>
      </div>
      
      <div className="pop" style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: 28, boxShadow: '0 40px 100px rgba(0,0,0,0.8)', width: '100%', maxWidth: 1100, background: '#000', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
         {!imgLoaded && (
           <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', gap: 16 }}>
              <div className="spin" style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: T.accent, borderRadius: '50%' }} />
              <div style={{ color: T.dim, fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>LOADING ASSET</div>
           </div>
         )}
         {preview.type.startsWith('image/') ? (
           <img 
              src={preview.url} 
              alt={preview.name} 
              onLoad={() => setImgLoaded(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.4s ease' }} 
           />
         ) : (
           <iframe 
              src={preview.url} 
              title={preview.name} 
              onLoad={() => setImgLoaded(true)}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.4s ease' }} 
           />
         )}
      </div>
    </div>
  );
}

function DocumentsTab({ customerId, customer, showToast }) {
  const [storageDocs, setStorageDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null); // { url, name, type }

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.storage.from('documents').list(customerId);
      if (error) { 
        if(error.message.includes('Bucket not found')) throw new Error('Storage bucket "documents" does not exist yet.');
        throw error; 
      }
      setStorageDocs(data || []);
    } catch(e) {
      console.error(e);
      showToast(e.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [customerId, showToast]);

  useEffect(() => { loadDocs(); }, [customerId, loadDocs]);

  // Combined documents view
  const allDocs = useMemo(() => {
    // 1. Documents already in Supabase Storage
    const fromStorage = storageDocs.map(d => {
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(`${customerId}/${d.name}`);
      return {
        id: d.id,
        name: d.name,
        size: d.metadata?.size,
        source: 'storage',
        dataUrl: publicUrl, // Use the public URL for rendering
        type: d.name.match(/\.(pdf)$/i) ? 'application/pdf' : 'image/jpeg'
      };
    });

    // 2. Documents linked in the JSONB column (customer.docs)
    // If a document lacks a dataUrl, it means it has already been uploaded to Storage 
    // and its dataUrl was stripped to save DB space. We should NOT render these ghost records 
    // from JSONB; they will be naturally rendered from the 'storageDocs' array above.
    const fromJson = (customer?.docs || [])
      .filter(d => !!d.dataUrl) // Only keep documents that actually hold base64 data (still need syncing)
      .map(d => ({
        ...d,
        name: d.name || d.originalName || d.key,
        source: 'jsonb'
      }));

    return [...fromStorage, ...fromJson];
  }, [storageDocs, customer?.docs, customerId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('Uploading...', 'info');
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}_doc.${ext}`;
      const path = `${customerId}/${filename}`;

      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw error;
      
      showToast('Uploaded successfully!', 'ok');
      await loadDocs();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const handleDownload = async (doc) => {
    try {
      if (doc.source === 'jsonb' && doc.dataUrl) {
         const a = document.createElement('a');
         a.href = doc.dataUrl;
         a.download = doc.name;
         a.click();
         return;
      }
      const { data, error } = await supabase.storage.from('documents').download(`${customerId}/${doc.name}`);
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) {
      showToast('Download failed', 'danger');
    }
  };

  const handlePreview = async (doc) => {
    try {
      if (doc.source === 'jsonb' && doc.dataUrl) {
         setPreview({ url: doc.dataUrl, name: doc.name, type: doc.type });
         return;
      }
      showToast('Fetching preview...', 'info');
      const { data, error } = await supabase.storage.from('documents').download(`${customerId}/${doc.name}`);
      if (error) throw error;
      
      const type = data.type; 
      const url = URL.createObjectURL(data);
      setPreview({ url, name: doc.name, type });
    } catch(e) {
      showToast('Preview failed', 'danger');
    }
  };

  const handleOpen = (doc) => {
    handlePreview(doc);
  };

  const closePreview = () => {
    if (preview?.url && !preview.url.startsWith('data:')) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ color: T.txt, fontSize: 15, margin: 0 }}>Customer KYC Documents</h3>
        <label style={{ background: T.accent, color: '#000', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Upload File
          <input type="file" style={{ display: 'none' }} onChange={handleUpload} accept="image/*,.pdf" />
        </label>
      </div>

      {loading ? <div style={{ color: T.muted }}>Loading documents...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {allDocs.length === 0 && <span style={{ color: T.muted }}>No documents uploaded.</span>}
          {allDocs.map(doc => {
            const isImg = doc.type?.startsWith('image/') || doc.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const isPdf = doc.type === 'application/pdf' || doc.name.match(/\.(pdf)$/i);
            
            return (
              <Card key={doc.id || doc.name} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: T.card, border: `1px solid ${doc.source === 'jsonb' ? T.warn + '40' : T.border}`, transition: 'transform 0.2s, border-color 0.2s' }}>
                <div style={{ height: 130, background: T.surface, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `1px solid ${T.border}`, color: T.muted, position: 'relative' }}>
                   {isImg ? (doc.source === 'jsonb' ? <img src={doc.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={32} opacity={0.6} />) : isPdf ? <FileText size={32} opacity={0.6} /> : <File size={32} opacity={0.6} />}
                   {doc.source === 'jsonb' && (
                     <div style={{ position: 'absolute', top: 8, right: 8, background: T.warn, color: '#000', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4 }}>SYNCING</div>
                   )}
                </div>
                <div style={{ padding: '0 4px' }}>
                  <div style={{ color: T.txt, fontWeight: 700, fontSize: 13, wordBreak: 'break-all', marginBottom: 2 }}>{doc.name}</div>
                  <div style={{ color: T.dim, fontSize: 11, fontWeight: 600 }}>{doc.size ? (doc.size / 1024).toFixed(1) : '—'} KB</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                   {(isImg || isPdf) && <Btn onClick={() => handlePreview(doc)} sm v='gold' icon={Eye}>View</Btn>}
                   <Btn onClick={() => handleOpen(doc)} sm v='secondary' icon={Maximize2}>Open</Btn>
                   <Btn onClick={() => handleDownload(doc)} sm v='secondary' icon={Download}>Save</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {preview && <DocPreviewModal preview={preview} onClose={closePreview} T={T} />}
    </div>
  );
}