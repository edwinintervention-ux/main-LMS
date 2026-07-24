import CustomerProfile from "@/modules/customers/CustomerProfile";
import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { T, SC, RC, SFX, Card, CH, KPI, DT, Btn, Badge, Av, Bar, BackBtn, RefreshBtn,
  FI, PhoneInput, NumericInput, Search, Pills, Alert, Dialog, ConfirmDialog, ToastContainer,
  LoanModal, LoanForm, RepayTracker, DocViewer, hashPwAsync, ModuleHeader,
  fmt, fmtM, now, uid, ts, escHtml, toCSV, dlCSV, buildFullBackup,
  calculateLoanStatus, DOC_SLOTS,
  sbWrite, sbInsert, toSupabaseWorker,
  toSupabaseLoan, toSupabaseCustomer, toSupabasePayment, toSupabaseInteraction,
  generateLoanAgreementHTML, generateAssetListHTML, downloadLoanDoc,
  useContactPopup, useToast, useReminders, useModalLock, compressImage } from '@/lms-common';
import WorkerPanel from './WorkerPanel';
import { 
  Users, UserPlus, Target, TrendingUp, ShieldCheck, Briefcase, Phone, Mail, Calendar, Info, X, ExternalLink, 
  Image as ImageIcon, FileText, Gavel, Landmark, ShieldAlert, Activity, ShieldOff, Eye,
  CheckCircle, ArrowUpRight, FileSpreadsheet, MapPin, Hammer, AlertTriangle, RefreshCw, Check, Search as SearchIcon, User as UserIcon, Shield as ShieldIcon,
  Plus, CreditCard, Zap, Download, Key, Edit2
} from 'lucide-react';

function WorkerDocPreview({ doc, onClose, T }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="dialog-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column', padding: 'clamp(12px, 4vw, 40px)', alignItems: 'center' }}>
      <div className="pop" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%', maxWidth: 1100, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
             {doc.type?.startsWith('image/') ? <ImageIcon size={22} /> : <FileText size={22} />}
           </div>
           <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.type?.toUpperCase()}</div>
           </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          Close <X size={18} />
        </button>
      </div>
      <div className="pop" style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: 28, boxShadow: '0 40px 100px rgba(0,0,0,0.8)', width: '100%', maxWidth: 1100, background: '#000', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
         {!loaded && <div className="spin" style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: T.accent, borderRadius: '50%' }} />}
         {doc.type?.startsWith('image/') ? (
           <img src={doc.dataUrl} alt={doc.name} onLoad={() => setLoaded(true)} style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: loaded ? 1 : 0, transition: 'opacity 0.4s' }} />
         ) : (
           <iframe src={doc.dataUrl} title={doc.name} onLoad={() => setLoaded(true)} style={{ width: '100%', height: '100%', border: 'none', background: '#fff', opacity: loaded ? 1 : 0 }} />
         )}
      </div>
    </div>
  );
}

const WorkersTab = ({adminUser,workers,setWorkers,loans,setLoans,payments,customers,setCustomers,leads,setLeads,interactions,setInteractions,allState,targets=[],setTargets,addAudit,showToast=()=>{}, isMobile, onNav }) => {
  const {open:openContact, Popup:ContactPopup} = useContactPopup();
  const [sel, setSel] = useState(null);
  const [deductions, setDeductions] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [showAddDeduction, setShowAddDeduction] = useState(false);
  const [newDeduction, setNewDeduction] = useState({ amount: '', reason: '', month: now().slice(0, 7) });
  const [detailTab, setDetailTab] = useState('overview');
  const [viewDoc, setViewDoc] = useState(null);
  const [workQ, setWorkQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [targetMonth, setTargetMonth] = useState(now().slice(0, 7));
  const [totalTarget, setTotalTarget] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwData, setResetPwData] = useState({ id: '', email: '', pw: '' });
  
  const blankF = { name: '', email: '', phone: '', idNo: '', role: 'Loan Officer', pw: '', staffNo: '' };
  const [f, setF] = useState(blankF);
  const ROLES = ['Admin', 'Super Admin', 'Finance', 'Loan Officer', 'Collections Officer', 'Asset Recovery'];

  useEffect(() => {
    if (sel) {
      import('@/config/supabaseClient').then(({ supabase }) => {
        if(supabase) {
          supabase.from('worker_deductions').select('*').eq('worker_id', sel.id).order('created_at', { ascending: false })
            .then(({ data }) => setDeductions(data || []));
          supabase.from('salary_payments').select('*').eq('worker_id', sel.id).order('created_at', { ascending: false })
            .then(({ data }) => setPayslips(data || []));
        }
      });
    }
  }, [sel]);

  const addDeduction = async () => {
    if(!newDeduction.amount || !newDeduction.reason) return;
    try {
      const { supabase } = await import('@/config/supabaseClient');
      if (!supabase) throw new Error('Supabase not initialized');
      const payload = { worker_id: sel.id, amount: parseFloat(newDeduction.amount), reason: newDeduction.reason, month: newDeduction.month };
      const { error } = await supabase.from('worker_deductions').insert(payload);
      if (error) throw error;
      setDeductions(p => [payload, ...p]);
      setShowAddDeduction(false);
      setNewDeduction({ amount: '', reason: '', month: now().slice(0, 7) });
      showToast('Deduction added', 'ok');
      addAudit('Deduction added', sel.id, `Amount: ${payload.amount}, Reason: ${payload.reason}`);
    } catch (err) {
      showToast('Failed to add deduction: ' + err.message, 'danger');
    }
  };

  const addW = async () => {
    if (!f.name || !f.phone || !f.idNo || !f.pw) return showToast('Please fill all required fields', 'warn');
    if (f.pw.length < 6) return showToast('Password must be at least 6 characters', 'warn');
    if (!f.email) return showToast('Email is required to create a portal login', 'warn');
    try {
      const hp = await hashPwAsync(f.pw);
      const nw = { ...f, id: 'W-' + uid(), status: 'Active', joined: now().slice(0, 10), pw: hp, forcePasswordChange: true };
      const next = [nw].concat(workers);
      setWorkers(next);
      setShowNew(false);
      setF(blankF);
      showToast('Creating worker account...', 'info');
      addAudit('Worker Created', nw.id, `Name: ${nw.name}, Role: ${nw.role}`);

      // 1. Save worker row to DB
      await sbWrite('workers', toSupabaseWorker(nw)).catch(console.error);

      // 2. Provision Supabase Auth account so the worker can log into the portal
      try {
        const { supabase } = await import('@/config/supabaseClient');
        if (supabase) {
          const { data, error } = await supabase.functions.invoke('create-worker-auth', {
            body: { email: nw.email, password: f.pw, worker_id: nw.id }
          });
          if (error || data?.error) {
            console.warn('[addW] Auth provisioning warning:', error?.message || data?.error);
            showToast(
              `Worker added but portal login setup failed: ${data?.error || error?.message}. Use the reset password flow to fix.`,
              'warn'
            );
          } else {
            showToast(`✅ ${nw.name} added — portal login ready!`, 'ok');
          }
        }
      } catch (authErr) {
        console.warn('[addW] Auth provisioning error:', authErr.message);
        showToast('Worker saved. Portal login setup failed — contact admin.', 'warn');
      }
    } catch (err) {
      showToast('Failed to add worker: ' + err.message, 'danger');
    }
  };

  const deleteWorker = async (workerToDelete) => {
    try {
      const { supabase } = await import('@/config/supabaseClient');
      if (!supabase) throw new Error('Supabase not initialized');
      const { error } = await supabase.from('workers').delete().eq('id', workerToDelete.id);
      if (error) throw error;
      setWorkers(workers.filter(w => w.id !== workerToDelete.id));
      setSel(null);
      setShowDeleteConfirm(null);
      showToast('Worker deleted permanently', 'info');
      addAudit('Worker Deleted', workerToDelete.id, `Deleted ${workerToDelete.name}`);
    } catch (err) {
      showToast('Failed to delete worker: ' + err.message, 'danger');
    }
  };

  const handleSaveTarget = async () => {
     if(!totalTarget) return;
     const officers = workers.filter(w => w.role === 'Loan Officer' && w.status === 'Active');
     if(officers.length === 0) return showToast('No active loan officers found', 'danger');
     const amt = Math.round(Number(totalTarget) / officers.length);
     try {
        const { supabase } = await import('@/config/supabaseClient');
        for(let off of officers) {
           const payload = { worker_id: off.id, month: targetMonth, total_target_amount: Number(totalTarget), target: amt };
           await supabase.from('monthly_targets').upsert(payload, { onConflict: 'worker_id,month' });
        }
        showToast(`Targets set for ${targetMonth}`, 'ok');
        setShowTargets(false);
        setTotalTarget('');
        // Refresh local targets
        const { data } = await supabase.from('monthly_targets').select('*').eq('month', targetMonth);
        if(data) setTargets(data);
     } catch (err) {
        showToast('Failed to save targets', 'danger');
     }
  };

  const removeDoc = async (wid, docId) => {
    if(!confirm('Delete this document?')) return;
    const w = workers.find(x => x.id === wid);
    const nextDocs = (w.docs || []).filter(d => d.id !== docId);
    const nextW = { ...w, docs: nextDocs };
    setWorkers(workers.map(x => x.id === wid ? nextW : x));
    setSel(nextW);
    sbWrite('workers', toSupabaseWorker(nextW)).catch(console.error);
    showToast('Document removed', 'info');
  };

  const handleAdminResetPw = async () => {
    if (!resetPwData.email) return showToast('Worker has no email address', 'warn');
    if (resetPwData.pw.length < 6) return showToast('Password must be at least 6 characters', 'warn');
    try {
      showToast('Resetting password...', 'info');
      const { supabase } = await import('@/config/supabaseClient');
      if (!supabase) throw new Error('Supabase client not initialized');
      
      const { data, error } = await supabase.functions.invoke('create-worker-auth', {
        body: { email: resetPwData.email, password: resetPwData.pw, worker_id: resetPwData.id }
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      
      const hp = await hashPwAsync(resetPwData.pw);
      const w = workers.find(x => x.id === resetPwData.id);
      if (w) {
         const nextW = { ...w, pw: hp, forcePasswordChange: true };
         setWorkers(workers.map(x => x.id === resetPwData.id ? nextW : x));
         if (sel?.id === w.id) setSel(nextW);
         sbWrite('workers', toSupabaseWorker(nextW)).catch(console.error);
      }
      addAudit('Password Reset', resetPwData.id, `Admin forced password reset for ${w?.name}`);
      showToast('Password successfully updated', 'ok');
      setShowResetPw(false);
      setResetPwData({ id: '', email: '', pw: '' });
    } catch (err) {
      showToast('Failed to reset password: ' + err.message, 'danger');
    }
  };

  const uploadDoc = async (wid, slot, file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const doc = { id: uid(), key: slot.key, name: slot.label, type: file.type, dataUrl, uploaded: now().slice(0, 10) };
      const w = workers.find(x => x.id === wid);
      const nextDocs = [doc].concat(w.docs || []);
      const nextW = { ...w, docs: nextDocs };
      setWorkers(workers.map(x => x.id === wid ? nextW : x));
      setSel(nextW);
      sbWrite('workers', toSupabaseWorker(nextW)).catch(console.error);
      showToast(slot.label + ' uploaded', 'ok');
    };
    reader.readAsDataURL(file);
  };

  const teamStats = useMemo(() => {
    return {
      total: workers.length,
      active: workers.filter(w => w.status === 'Active').length,
      book: loans.filter(l => l.status !== 'Settled').reduce((s, l) => s + l.balance, 0),
      capacity: Math.round((workers.filter(w => w.status === 'Active').length / (workers.length || 1)) * 100)
    };
  }, [workers, loans]);

  const activeOfficers = workers.filter(w => w.role === 'Loan Officer' && w.status === 'Active');
  const activeTarget = targets.find(t => t.month === targetMonth);

  if (sel) {
    const w = sel;
    const wLoans = loans.filter(l => l.officer === w.name);
    const wCusts = customers.filter(c => c.officer === w.name);
    const wLeads = leads.filter(l => l.officer === w.name);
    const wInts = interactions.filter(i => i.worker_id === w.id);
    const wDocs = w.docs || [];
    const reqSlots = DOC_SLOTS.filter(s => s.required);
    const reqDone = reqSlots.filter(s => wDocs.some(d => d.key === s.key)).length;
    const docsOk = reqDone === reqSlots.length;

    const isSuperAdmin = adminUser?.role === 'Super Admin';

    return (
      <div className="fu anim-fade">
        {showDeleteConfirm && (
          <ConfirmDialog 
             title="Delete Worker Permanently" 
             message={`Are you sure you want to delete ${showDeleteConfirm.name}? This action cannot be undone and may affect associated records.`} 
             confirmLabel="Yes, Delete Permanently" 
             confirmVariant="danger" 
             onConfirm={() => deleteWorker(showDeleteConfirm)} 
             onCancel={() => setShowDeleteConfirm(null)} 
          />
        )}
        {showResetPw && (
          <Dialog title="Change Worker Password" onClose={() => setShowResetPw(false)} width={400}>
            <div style={{ padding: '0 4px' }}>
              <div style={{ marginBottom: 14 }}>
                 <FI label="New Password" type="password" value={resetPwData.pw} onChange={v => setResetPwData(p => ({ ...p, pw: v }))} placeholder="Minimum 6 characters"/>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                 <Btn full onClick={handleAdminResetPw}>Update Password</Btn>
                 <Btn full v="secondary" onClick={() => setShowResetPw(false)}>Cancel</Btn>
              </div>
            </div>
          </Dialog>
        )}
        {viewDoc && <WorkerDocPreview doc={viewDoc} onClose={() => setViewDoc(null)} T={T} />}
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BackBtn onClick={() => setSel(null)}>Back to Team List</BackBtn>
          <div style={{ display: 'flex', gap: 8 }}>
             <Btn sm v="secondary" icon={SearchIcon} onClick={() => setDetailTab('portal')}>Preview Portal</Btn>
             <Btn sm v="secondary" icon={RefreshCw} onClick={() => {
                import('@/config/supabaseClient').then(({ supabase }) => {
                  if(supabase) {
                    supabase.from('worker_deductions').select('*').eq('worker_id', w.id).order('created_at', { ascending: false }).then(({ data }) => setDeductions(data || []));
                    supabase.from('salary_payments').select('*').eq('worker_id', w.id).order('created_at', { ascending: false }).then(({ data }) => setPayslips(data || []));
                  }
                });
             }}>Sync Data</Btn>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, background: T.card2, padding: '24px 30px', borderRadius: 28, border: `1px solid ${T.border}` }}>
          <Av ini={w.avatar || w.name[0]} size={80} color={T.accent} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: T.txt, fontFamily: T.head }}>{w.name}</h1>
              <Badge color={w.status === 'Active' ? T.ok : T.danger}>{w.status}</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, color: T.muted, fontSize: 14, fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Briefcase size={16} /> {w.role}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={16} /> Joined {ts(w.joined)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={16} /> {w.id}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 5 }}>Portfolio Managed</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: T.accent }}>{fmtM(wLoans.reduce((s, l) => s + l.balance, 0))}</div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <Pills 
            opts={[
              { v: 'overview', l: 'Overview' },
              { v: 'compensation', l: 'Salary & B2C' },
              { v: 'profile', l: 'Personal File' },
              { v: 'loans', l: 'Assigned Loans' },
              { v: 'customers', l: 'Customers' },
              { v: 'leads', l: 'Leads' },
              { v: 'timeline', l: 'Timeline' },
              { v: 'documents', l: 'Compliance Docs' },
            ]} 
            val={detailTab} 
            onChange={setDetailTab} 
          />
        </div>

        {detailTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <KPI label="Active Book" value={fmt(wLoans.filter(l => l.status !== 'Settled').reduce((s, l) => s + l.balance, 0))} icon={TrendingUp} color={T.accent} />
            <KPI label="Collection Rate" value={(() => { const wPmts = (payments || []).filter(p => wLoans.some(l => l.id === p.loanId)).reduce((s, p) => s + p.amount, 0); const wBal = wLoans.filter(l => l.status !== 'Settled').reduce((s, l) => s + l.balance, 0); const total = wPmts + wBal; return total > 0 ? Math.min(Math.round((wPmts / total) * 100), 100) + '%' : '0%'; })()} icon={Target} color={T.ok} />
            <KPI label="Arrears" value={wLoans.filter(l => l.status === 'Overdue').length} sub="Overdue Cases" icon={ShieldAlert} color={T.danger} />
            <KPI label="Compliance" value={reqDone + '/' + reqSlots.length} sub="Documents" icon={ShieldCheck} color={docsOk ? T.ok : T.warn} />
          </div>
        )}

        {detailTab === 'compensation' && (
          <div className="fu">
            <Card style={{ marginBottom: 18, borderLeft: `4px solid ${T.ok}` }}>
              <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                    <div style={{ width: 50, height: 50, borderRadius: 12, background: T.oLo, color: T.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TrendingUp size={24}/>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: T.txt }}>Salary & Performance</div>
                      <div style={{ fontSize: 12, color: T.muted }}>Current Month: {now().slice(0, 7)}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {(function(){
                       const currentMonth = now().slice(0, 7);
                       let actual = 0;
                       let estimatedEarned = 0;
                       
                       if (w.role === 'Loan Officer') {
                         const myCusts = (customers || []).filter(c => {
                           if (c.status === 'Rejected') return false;
                           const isMatch = (w.authId && c.assigned_officer === w.authId) || String(c.officer || '').trim().toLowerCase() === String(w.name || '').trim().toLowerCase();
                           if (!isMatch) return false;
                           const cMonth = (c.joined || c.createdAt || c.created_at || '').slice(0, 7);
                           if (cMonth !== currentMonth) return false;
                           return (loans || []).some(l => l.customerId === c.id && ['Active', 'Closed', 'Legal', 'Defaulted'].includes(l.status));
                         });
                         actual = myCusts.length;
                         estimatedEarned = Math.round(actual * 333.33);
                       } else if (w.role === 'Collections Officer') {
                         const myLoans = (loans || []).filter(l => (l.collectionsOfficer || '').toLowerCase() === (w.name || '').toLowerCase());
                         const myMonthlyCollected = (payments || []).filter(p => p.date?.startsWith(currentMonth) && myLoans.some(l => l.id === p.loanId)).reduce((s, p) => s + p.amount, 0);
                         
                         const remaining = myLoans.reduce((total, l) => {
                           const paid = (payments || []).filter(p => p.loanId === l.id && p.status === 'Allocated').reduce((s, p) => s + p.amount, 0);
                           const amtDue = l.amount - paid;
                           return total + (amtDue > 0 ? amtDue : 0);
                         }, 0);
                         
                         const totalCollectible = myMonthlyCollected + remaining;
                         actual = totalCollectible > 0 ? (myMonthlyCollected / totalCollectible) * 100 : 0;
                         
                         const pct = actual;
                         if (pct >= 100) estimatedEarned = 20000;
                         else if (pct >= 94) estimatedEarned = 15000;
                         else if (pct >= 90) estimatedEarned = 10000;
                         else estimatedEarned = Math.round((pct / 90) * 10000);
                       }
                       
                       const deds = deductions.filter(d => d.month === currentMonth).reduce((a, b) => a + (b.amount || 0), 0);
                       const net = Math.max(0, estimatedEarned - deds);
                       return (
                         <>
                           <div style={{ fontSize: 22, fontWeight: 900, color: T.ok }}>{fmt(net)}</div>
                           <div style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>GROSS COMMISSION</div>
                         </>
                       );
                    })()}
                  </div>
              </div>
              <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ background: T.surface, borderRadius: 12, padding: 15, border: `1px solid ${T.border}` }}>
                    {(function(){
                       const label = w.role === 'Collections Officer' ? 'Recovery Rate' : 'Onboarding Performance';
                       const targetsForWorker = (targets || []).filter(t => t.worker_id === w.id && t.month === now().slice(0, 7));
                       const targetVal = w.role === 'Loan Officer' ? (w.onboardingTarget || 60) : (targetsForWorker[0]?.target || w.collectionTarget || 500000);
                       
                       const currentMonth = now().slice(0, 7);
                       let actual = 0;
                       let estimatedEarned = 0;
                       
                       if (w.role === 'Loan Officer') {
                         const myCusts = (customers || []).filter(c => {
                           if (c.status === 'Rejected') return false;
                           const isMatch = (w.authId && c.assigned_officer === w.authId) || String(c.officer || '').trim().toLowerCase() === String(w.name || '').trim().toLowerCase();
                           if (!isMatch) return false;
                           const cMonth = (c.joined || c.createdAt || c.created_at || '').slice(0, 7);
                           if (cMonth !== currentMonth) return false;
                           return (loans || []).some(l => l.customerId === c.id && ['Active', 'Closed', 'Legal', 'Defaulted'].includes(l.status));
                         });
                         actual = myCusts.length;
                         estimatedEarned = Math.round(actual * 333.33);
                       } else if (w.role === 'Collections Officer') {
                         const myLoans = (loans || []).filter(l => (l.collectionsOfficer || '').toLowerCase() === (w.name || '').toLowerCase());
                         const myMonthlyCollected = (payments || []).filter(p => p.date?.startsWith(currentMonth) && myLoans.some(l => l.id === p.loanId)).reduce((s, p) => s + p.amount, 0);
                         
                         const remaining = myLoans.reduce((total, l) => {
                           const paid = (payments || []).filter(p => p.loanId === l.id && p.status === 'Allocated').reduce((s, p) => s + p.amount, 0);
                           // Basic estimation if calculateLoanStatus isn't imported here
                           const amtDue = l.amount - paid;
                           return total + (amtDue > 0 ? amtDue : 0);
                         }, 0);
                         
                         const totalCollectible = myMonthlyCollected + remaining;
                         actual = totalCollectible > 0 ? (myMonthlyCollected / totalCollectible) * 100 : 0;
                         
                         const pct = actual;
                         if (pct >= 100) estimatedEarned = 20000;
                         else if (pct >= 94) estimatedEarned = 15000;
                         else if (pct >= 90) estimatedEarned = 10000;
                         else estimatedEarned = Math.round((pct / 90) * 10000);
                       }
                       
                       const rate = w.role === 'Collections Officer' ? actual : (targetVal > 0 ? (actual / targetVal) * 100 : 0);
                       const deds = deductions.filter(d => d.month === currentMonth).reduce((a, b) => a + (b.amount || 0), 0);
                       const net = Math.max(0, estimatedEarned - deds);

                       return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ color: T.txt, fontSize: 14, fontWeight: 700 }}>{label}</div>
                              <Btn v="primary" icon={Zap} style={{ background: T.ok, color: '#000' }} onClick={async () => {
                                  try {
                                    const payoutPhone = w.mpesaNumber || w.phone;
                                    if (!payoutPhone) { showToast('Worker has no phone or M-Pesa number on profile.', 'danger'); return; }
                                    const { initiateWorkerPayout } = await import('@/utils/mpesa');
                                    await initiateWorkerPayout({ worker_id: w.id, amount: Math.round(net), phone: payoutPhone });
                                    showToast(`🚀 B2C Payout Initiated for ${w.name}`, 'ok');
                                    setTimeout(() => {
                                      import('@/config/supabaseClient').then(({ supabase }) => {
                                          if(supabase) {
                                            supabase.from('salary_payments').select('*').eq('worker_id', w.id).order('created_at', { ascending: false }).then(({ data }) => { if(data) setPayslips(data); });
                                          }
                                      });
                                    }, 1000);
                                    if (onNav) { setTimeout(() => { onNav('paymentshub'); }, 2000); }
                                  } catch (err) {
                                    showToast('Payout failed: ' + err.message, 'danger');
                                  }
                                }}>Initiate B2C Payout</Btn>
                          </div>
                          <div style={{ height: 8, background: T.border, borderRadius: 99, marginTop: 12, overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: T.accent, width: `${Math.min(rate, 100)}%` }}/>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, fontWeight: 700, color: T.dim }}>
                              <span>{label}: {Math.round(rate)}%</span>
                              <span>{w.role === 'Collections Officer' ? 'Step-Incentive Basis' : `Target: ${targetVal}`}</span>
                          </div>
                        </>
                       );
                    })()}
                  </div>
              </div>
            </Card>

            <Card style={{ marginBottom: 18 }}>
               <CH title="M-Pesa B2C Transaction History" icon={Landmark}/>
               <div style={{ padding: '0 4px 4px' }}>
                  <DT cols={[
                      { k: 'month', l: 'Period' },
                      { k: 'amount', l: 'Net Paid', r: v => <strong>{fmt(v)}</strong> },
                      { k: 'mpesa_receipt', l: 'M-Pesa Receipt', r: v => <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>{v}</span> },
                      { k: 'created_at', l: 'Time', r: v => ts(v) },
                      { k: 'id', l: 'Receipt', r: (v, row) => <Btn sm v="secondary" icon={Download} onClick={() => {
                        const content = `TRANSACTION RECEIPT\n\nRecipient: ${w.name}\nPeriod: ${row.month}\nAmount: KES ${row.amount}\nReceipt: ${row.mpesa_receipt}\nPhone: ${row.recipient_phone}\nDate: ${ts(row.created_at)}\n\nThank you for your service.\nAdequate Capital LTD`;
                        const blob = new Blob([content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = `Receipt_${row.mpesa_receipt}.txt`; a.click(); a.remove();
                      }}>Download</Btn> }
                    ]} rows={payslips} emptyMsg="No B2C transactions for this worker." />
               </div>
            </Card>

            <Card>
               <CH title="Deductions & Adjustments" icon={ShieldOff} right={<Btn sm v="secondary" icon={Plus} onClick={() => setShowAddDeduction(true)}>Add Deduction</Btn>}/>
               <div style={{ padding: '0 4px 4px' }}>
                  <DT cols={[
                      { k: 'month', l: 'Month' },
                      { k: 'reason', l: 'Description' },
                      { k: 'amount', l: 'Amount', r: v => fmt(v) },
                      { k: 'created_at', l: 'Date', r: v => ts(v) }
                    ]} rows={deductions} emptyMsg="No deductions recorded for this worker." />
               </div>
            </Card>

            {showAddDeduction && (
              <Dialog title="Add Salary Deduction" onClose={() => setShowAddDeduction(false)} width={400}>
                 <div style={{ padding: '0 4px' }}>
                    <div style={{ marginBottom: 14 }}>
                       <FI label="Amount (KES)" type="number" value={newDeduction.amount} onChange={e => setNewDeduction(p => ({ ...p, amount: e.target.value }))} placeholder="0.00"/>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                       <FI label="Reason" value={newDeduction.reason} onChange={e => setNewDeduction(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Lost hardware, Cash discrepancy"/>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                       <Btn full onClick={addDeduction}>Save Deduction</Btn>
                       <Btn full v="secondary" onClick={() => setShowAddDeduction(false)}>Cancel</Btn>
                    </div>
                 </div>
              </Dialog>
            )}
          </div>
        )}

        {detailTab === 'profile' && (
          <div className="fu">
            <Card style={{ marginBottom: 12 }}>
              <CH title="Personal Information" icon={UserIcon}/>
              <div style={{ padding: '10px 14px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['Full Name',    w.name],
                    ['Role',         w.role],
                    ['Email',        w.email||'-'],
                    ['Phone',        w.phone||'-'],
                    ['National ID',  w.idNo||'-'],
                    ['Staff Number', w.staffNo||'-'],
                    ['Worker ID',    w.id],
                    ['Status',       w.status],
                    ['Date Joined',  w.joined||'-'],
                  ].map(pair => (
                    <div key={pair[0]} style={{ background: T.surface, borderRadius: 9, padding: '9px 12px' }}>
                      <div style={{ color: T.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2, fontWeight: 700 }}>{pair[0]}</div>
                      <div style={{ color: T.txt, fontWeight: 600, fontSize: 13 }}>{pair[1]}</div>
                    </div>
                  ))}
                </div>

                {/* ── M-Pesa Number (inline editable) ─────────────────────── */}
                <div style={{ marginTop: 12, background: T.surface, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ color: T.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700, marginBottom: 3 }}>M-Pesa Number <span style={{ color: T.ok, fontSize: 9 }}>● Used for B2C Salary Payout</span></div>
                      <div style={{ color: T.txt, fontWeight: 700, fontSize: 14, fontFamily: T.mono }}>{w.mpesaNumber || <span style={{ color: T.danger, fontWeight: 600, fontSize: 12 }}>Not set — payout will use main phone</span>}</div>
                    </div>
                    <Btn sm v="secondary" icon={Edit2} onClick={() => {
                      const num = prompt('Enter M-Pesa phone number (e.g. 0712345678 or 254712345678):', w.mpesaNumber || '');
                      if (num === null) return;
                      const cleaned = num.trim();
                      const nextW = { ...w, mpesaNumber: cleaned };
                      setWorkers(ws => ws.map(x => x.id === w.id ? nextW : x));
                      setSel(nextW);
                      sbWrite('workers', toSupabaseWorker(nextW)).catch(console.error);
                      showToast(cleaned ? 'M-Pesa number saved' : 'M-Pesa number cleared', 'ok');
                      addAudit('M-Pesa Number Updated', w.id, `Set to ${cleaned || 'empty'} by admin`);
                    }}>Edit</Btn>
                  </div>
                </div>

                {/* ── Staff Number (inline editable) ─────────────────────── */}
                <div style={{ marginTop: 12, background: T.surface, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ color: T.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700, marginBottom: 3 }}>Staff Number <span style={{ color: T.ok, fontSize: 9 }}>● Shown on Payslips</span></div>
                      <div style={{ color: T.txt, fontWeight: 700, fontSize: 14, fontFamily: T.mono }}>{w.staffNo || <span style={{ color: T.danger, fontWeight: 600, fontSize: 12 }}>Not set</span>}</div>
                    </div>
                    <Btn sm v="secondary" icon={Edit2} onClick={() => {
                      const num = prompt('Enter Staff Number (e.g. 0931):', w.staffNo || '');
                      if (num === null) return;
                      const cleaned = num.trim();
                      const nextW = { ...w, staffNo: cleaned };
                      setWorkers(ws => ws.map(x => x.id === w.id ? nextW : x));
                      setSel(nextW);
                      sbWrite('workers', toSupabaseWorker(nextW)).catch(console.error);
                      showToast(cleaned ? 'Staff number saved' : 'Staff number cleared', 'ok');
                      addAudit('Staff Number Updated', w.id, `Set to ${cleaned || 'empty'} by admin`);
                    }}>Edit</Btn>
                  </div>
                </div>

                <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                   <div style={{ color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Administrative Controls</div>
                   <div style={{ display: 'flex', gap: 10 }}>
                      <Btn full v="secondary" icon={Eye} onClick={() => setDetailTab('portal')}>Inspect Worker Panel</Btn>
                      <Btn full v="secondary" icon={Key} onClick={() => { setResetPwData({ id: w.id, email: w.email, pw: '' }); setShowResetPw(true); }}>Change Password</Btn>
                      <Btn full v={w.status === 'Active' ? 'danger' : 'success'} icon={w.status === 'Active' ? ShieldOff : ShieldCheck} onClick={() => {
                          if (!isSuperAdmin) return showToast('Only Super Admin can change worker status', 'warn');
                          const nextStatus = w.status === 'Active' ? 'Inactive' : 'Active';
                          const next = workers.map(x => x.id === w.id ? { ...x, status: nextStatus } : x);
                          setWorkers(next); setSel({ ...w, status: nextStatus });
                          addAudit(`Worker ${nextStatus}`, w.id, `Status updated by Admin`);
                          sbWrite('workers', toSupabaseWorker({ ...w, status: nextStatus })).catch(console.error);
                          showToast(`Worker ${nextStatus}`, 'info');
                        }}> {w.status === 'Active' ? 'Deactivate Account' : 'Reactivate Account'} </Btn>
                   </div>
                   {isSuperAdmin && (
                     <div style={{ marginTop: 4 }}>
                       <Btn full style={{ background: T.danger, color: '#fff', border: 'none' }} icon={X} onClick={() => setShowDeleteConfirm(w)}>Delete Worker Permanently</Btn>
                     </div>
                   )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {detailTab === 'loans' && (
          <DT cols={[{ k: 'id', l: 'ID', r: v => <span style={{ color: T.accent, fontFamily: T.mono, fontSize: 12 }}>{v}</span> }, { k: 'customer', l: 'Customer' }, { k: 'amount', l: 'Principal', r: v => fmt(v) }, { k: 'balance', l: 'Balance', r: v => fmt(v) }, { k: 'status', l: 'Status', r: v => <Badge color={SC[v] || T.muted}>{v}</Badge> }, { k: 'repaymentType', l: 'Type' }]} rows={wLoans} emptyMsg="No loans assigned" />
        )}
        {detailTab === 'customers' && (
          <DT cols={[{ k: 'id', l: 'ID', r: v => <span style={{ color: T.accent, fontFamily: T.mono, fontSize: 12 }}>{v}</span> }, { k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone' }, { k: 'business', l: 'Business' }, { k: 'risk', l: 'Risk', r: v => <Badge color={RC[v]}>{v}</Badge> }]} rows={wCusts} emptyMsg="No customers assigned" />
        )}
        {detailTab === 'leads' && (
          <DT cols={[{ k: 'id', l: 'ID', r: v => <span style={{ color: T.accent, fontFamily: T.mono, fontSize: 12 }}>{v}</span> }, { k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone' }, { k: 'business', l: 'Business' }, { k: 'status', l: 'Status', r: v => <Badge color={SC[v] || T.muted}>{v}</Badge> }, { k: 'date', l: 'Date' }]} rows={wLeads} emptyMsg="No leads" />
        )}
        {detailTab === 'timeline' && (
          <div>
            {wInts.length === 0 && <div style={{ color: T.muted, textAlign: 'center', padding: 24, background: T.surface, borderRadius: 10 }}>No interactions recorded</div>}
            <div style={{ maxHeight: '40vh', overflowY: 'auto', overflowX: 'hidden' }}>
            {[...wInts].sort((a, b) => b.date.localeCompare(a.date)).map(item => (
              <div key={item.id} style={{ background: T.surface, border: '1px solid ' + T.border, borderRadius: 10, padding: '11px 13px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <Badge color={T.accent}>{item.type}</Badge>
                  <span style={{ color: T.muted, fontSize: 11 }}>{item.date}</span>
                </div>
                <div style={{ color: T.txt, fontSize: 13 }}>{item.notes}</div>
              </div>
            ))}
            </div>
          </div>
        )}
        {detailTab === 'documents' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: docsOk ? T.oLo : T.dLo, border: '1px solid ' + (docsOk ? T.ok : T.danger) + '38', borderRadius: 10, padding: '11px 14px', marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>{docsOk ? 'OK' : '!'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: docsOk ? T.ok : T.danger, fontWeight: 700, fontSize: 13 }}> {docsOk ? 'All required documents on file' : reqSlots.length - reqDone + ' required document(s) missing'} </div>
                <div style={{ color: T.muted, fontSize: 11, marginTop: 2 }}>{wDocs.length} of {DOC_SLOTS.length} uploaded</div>
              </div>
              <Badge color={docsOk ? T.ok : T.danger}>{reqDone + '/' + reqSlots.length}</Badge>
            </div>
            {DOC_SLOTS.map((slot, idx) => {
              const doc = wDocs.find(d => d.key === slot.key);
              return (
                <div key={slot.key} style={{ background: T.surface, border: '1.5px solid ' + (doc ? T.ok : slot.required ? T.danger + '40' : T.border), borderRadius: 11, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 99, background: doc ? T.ok : slot.required ? T.dLo : T.border, color: doc ? '#fff' : slot.required ? T.danger : T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{doc ? 'V' : idx + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.txt, fontSize: 13, fontWeight: 700 }}>{slot.label} {slot.required && <span style={{ color: T.danger, fontSize: 10 }}>Required</span>}</div>
                    <div style={{ color: doc ? T.ok : T.muted, fontSize: 11, marginTop: 2 }}>{doc ? 'Uploaded ' + doc.uploaded : (slot.required ? 'Not uploaded' : 'Optional')}</div>
                  </div>
                  {doc && <div onClick={() => setViewDoc(doc)} style={{ cursor: 'pointer', flexShrink: 0 }}> {doc.type && doc.type.startsWith('image/') ? <img src={doc.dataUrl} alt={slot.label} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 7, border: '2px solid ' + T.ok }} /> : <div style={{ width: 52, height: 52, background: T.card, borderRadius: 7, border: '2px solid ' + T.ok, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>D</div>} </div>}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {doc && <button onClick={() => setViewDoc(doc)} style={{ background: T.aLo, border: '1px solid ' + T.accent + '38', color: T.accent, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>View</button>}
                    {doc && <button onClick={() => removeDoc(w.id, doc.id)} style={{ background: T.dLo, border: '1px solid ' + T.danger + '30', color: T.danger, borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Remove</button>}
                    {!doc && (
                      <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: T.bLo, border: '1px solid ' + T.blue + '38', borderRadius: 7, padding: '6px 10px' }}>
                        <span style={{ color: T.blue, fontSize: 11, fontWeight: 700 }}>Upload</span>
                        <input type="file" accept={slot.accept} style={{ display: 'none' }} onChange={e => { var file = e.target.files && e.target.files[0]; if (!file) return; e.target.value = ''; uploadDoc(w.id, slot, file); }} />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {detailTab === 'portal' && (
          <div>
            <Alert type="info" style={{ marginBottom: 12 }}>Viewing {w.name} portal as admin</Alert>
            <WorkerPanel worker={w} workers={workers || []} setWorkers={setWorkers} loans={loans} setLoans={setLoans} payments={payments} customers={customers} leads={leads || []} allWorkers={workers || []} setCustomers={setCustomers || (() => { })} onSubmitLoan={l => { if (setLoans) setLoans(ls => [l].concat(ls)); }} setLeads={setLeads || (() => { })} interactions={interactions || []} setInteractions={setInteractions || (() => { })} repossessedAssets={allState?.repossessedAssets || []} setRepossessedAssets={allState?.setRepossessedAssets || (() => { })} addAudit={addAudit || (() => { })} showToast={showToast || (() => { })} onLogout={() => setSel(null)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fu">
      {ContactPopup}
      <ModuleHeader title="Team Management" sub="Overview of all registered field officers and administrators" right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => setShowTargets(true)} v="secondary" icon={Target}>Set Monthly Targets</Btn>
            <Btn onClick={() => setShowNew(true)} icon={UserPlus}>Add New Team Member</Btn>
          </div>
        } />

      {showTargets && (
        <Dialog title="Monthly Target Configuration" onClose={() => setShowTargets(false)} width={500}>
          <div style={{ padding: '0 4px' }}>
             <div style={{ marginBottom: 20 }}><FI label="Target Month" type="month" value={targetMonth} onChange={v => setTargetMonth(v)} /></div>
             <div style={{ marginBottom: 20 }}><FI label="Total Distribution Target (KES)" type="number" value={totalTarget} onChange={v => setTotalTarget(v)} placeholder="e.g. 5,000,000" /></div>
             {activeOfficers.length > 0 ? (
               <div style={{ background: T.surface, padding: 16, borderRadius: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: T.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 12 }}>Automatic Split</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                     {activeOfficers.map(w => (
                        <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Av ini={w.avatar || w.name[0]} size={24} color={T.accent} /><span style={{ fontSize: 13, fontWeight: 600 }}>{w.name}</span></div>
                           <span style={{ fontSize: 13, fontWeight: 900, color: T.accent }}>{fmtM(Number(totalTarget || 0) / activeOfficers.length)}</span>
                        </div>
                     ))}
                  </div>
               </div>
             ) : <Alert type="warn" style={{ marginBottom: 20 }}>No active Loan Officers available to assign targets.</Alert>}
             <Btn full onClick={handleSaveTarget} v="primary" icon={ShieldCheck} disabled={!totalTarget || activeOfficers.length === 0}> Confirm & Propagate Target </Btn>
          </div>
        </Dialog>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <KPI label="Deployment" value={teamStats.active} sub={`${teamStats.total} Total Staff`} icon={Users} color={T.accent} />
          <KPI label="Collective Portfolio" value={fmtM(teamStats.book)} icon={TrendingUp} />
          <KPI label="Active Capacity" value={teamStats.capacity + '%'} sub="Team Availability" icon={Target} color={T.ok} />
          <KPI label="Pending Onboarding" value={workers.filter(w => (w.docs || []).length < 3).length} icon={ShieldCheck} color={T.warn} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <Search value={workQ} onChange={setWorkQ} placeholder="Search team by name or role..." style={{ flex: 1, maxWidth: 400 }} />
          <RefreshBtn onRefresh={() => { setWorkQ(''); setSel(null); }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {workers.filter(w => !workQ || w.name.toLowerCase().includes(workQ.toLowerCase()) || w.role.toLowerCase().includes(workQ.toLowerCase())).map(w => {
          const wl = loans.filter(l => l.officer === w.name);
          const bk = wl.filter(l => l.status !== 'Settled').reduce((s, l) => s + l.balance, 0);
          const ov = wl.filter(l => l.status === 'Overdue').length;
          const wp = payments.filter(p => wl.some(l => l.id === p.loanId)).reduce((s, p) => s + p.amount, 0);
          const docsOk = DOC_SLOTS.filter(s => s.required).every(s => (w.docs || []).some(d => d.key === s.key));
          const collRate = bk > 0 ? Math.min(Math.round((wp / bk) * 100), 100) : 0;
          return (
            <Card key={w.id} style={{ padding: 0, cursor: 'pointer', border: `1px solid ${w.status === 'Active' ? T.border : T.danger + '30'}`, overflow: 'hidden' }} onClick={() => { setSel(w); setDetailTab('overview'); setViewDoc(null); }}>
              <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}`, background: T.card2, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Av ini={w.avatar || w.name[0]} size={42} color={w.status === 'Active' ? T.accent : T.muted} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.txt, fontWeight: 800, fontSize: 15, fontFamily: T.head }}>{w.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}> { (function(){ const r = w.role; const iconProps = { size: 12, color: T.muted }; if(r === 'Loan Officer') return <Target {...iconProps} />; if(r === 'Collections Officer') return <ShieldAlert {...iconProps} />; if(r === 'Finance') return <Landmark {...iconProps} />; if(r === 'Asset Recovery') return <Gavel {...iconProps} />; return <Users {...iconProps} />; })() } <div style={{ color: T.muted, fontSize: 11, fontWeight: 600 }}>{w.role.toUpperCase()}</div> </div>
                </div>
                <Badge color={w.status === 'Active' ? T.ok : T.danger}>{w.status}</Badge>
              </div>
              <div style={{ padding: '14px 18px' }}>
                { ['Loan Officer', 'Collections Officer', 'Asset Recovery'].includes(w.role) && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div style={{ background: T.surface, borderRadius: 10, padding: '8px 10px', border: `1px solid ${T.border}` }}> <div style={{ color: T.muted, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Book</div> <div style={{ color: T.accent, fontWeight: 800, fontSize: 14 }}>{fmtM(bk)}</div> </div>
                      <div style={{ background: T.surface, borderRadius: 10, padding: '8px 10px', border: `1px solid ${T.border}` }}> <div style={{ color: T.muted, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Arrears</div> <div style={{ color: ov > 0 ? T.danger : T.ok, fontWeight: 800, fontSize: 14 }}>{ov}</div> </div>
                    </div>
                    <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}> <span style={{ fontSize: 10, color: T.muted, fontWeight: 700 }}>COLLECTION EFFICIENCY</span> <span style={{ fontSize: 10, color: T.ok, fontWeight: 800 }}>{collRate}%</span> </div>
                    <div style={{ height: 4, background: T.border, borderRadius: 99, overflow: 'hidden' }}> <div style={{ height: '100%', width: `${collRate}%`, background: T.ok, borderRadius: 99 }} /> </div>
                  </>
                )}
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}> { !docsOk ? ( <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.warn, fontSize: 11, fontWeight: 700 }}> <ShieldCheck size={14} /> Docs Incomplete </div> ) : <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.ok, fontSize: 11, fontWeight: 700 }}> <ShieldCheck size={14} /> Fully Verified </div> } <button onClick={(e) => { e.stopPropagation(); setSel(w); setDetailTab('portal'); }} style={{ background: T.accent + '15', color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}> <Eye size={12}/> Inspect Account </button> </div>
              </div>
            </Card>
          );
        })}
      </div>
      {showNew&&(
        <Dialog title="Add New Worker" onClose={function(){setShowNew(false);setF(blankF);}} width={520}>
          <div className="mob-grid1" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 14px'}}>
            <FI label="Full Name"           value={f.name}  onChange={function(v){setF(function(p){return {...p,name:v};});}  }  required half/>
            <FI label="Email" type="email"  value={f.email} onChange={function(v){setF(function(p){return {...p,email:v};});}  } required half/>
            <PhoneInput label="Phone"       value={f.phone} onChange={function(v){setF(function(p){return {...p,phone:v};});}  } half required/>
            <NumericInput label="National ID No." value={f.idNo} onChange={function(v){setF(function(p){return {...p,idNo:v};});}} half placeholder="e.g. 12345678" required error={!f.idNo}/>
            <FI label="Staff Number" value={f.staffNo} onChange={function(v){setF(function(p){return {...p,staffNo:v};});}} half placeholder="e.g. 0931" />
            <FI label="Role" type="select" options={ROLES} value={f.role} onChange={function(v){setF(function(p){return {...p,role:v};});}} half/>
            <FI label="Temporary Password" type="password" value={f.pw} onChange={function(v){setF(function(p){return {...p,pw:v};});}} required half placeholder="Min 6 chars"/>
          </div>
          <Alert type="info" style={{marginTop:4}}>All fields required.</Alert>
          <div style={{display:'flex',gap:9,marginTop:8}}>
            <Btn onClick={addW} full>Add Worker</Btn>
            <Btn v="secondary" onClick={function(){setShowNew(false);setF(blankF);}}>Cancel</Btn>
          </div>
        </Dialog>
      )}

      {showResetPw && (
        <Dialog title="Change Worker Password" onClose={() => setShowResetPw(false)} width={400}>
          <div style={{ padding: '0 4px' }}>
            <div style={{ marginBottom: 14 }}>
               <FI label="New Password" type="password" value={resetPwData.pw} onChange={v => setResetPwData(p => ({ ...p, pw: v }))} placeholder="Minimum 6 characters"/>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
               <Btn full onClick={handleAdminResetPw}>Update Password</Btn>
               <Btn full v="secondary" onClick={() => setShowResetPw(false)}>Cancel</Btn>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default WorkersTab;
