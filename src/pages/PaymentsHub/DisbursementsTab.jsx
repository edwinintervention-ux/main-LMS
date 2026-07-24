import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, AlertOctagon, FileText, ClipboardSignature, PackageOpen, Rocket, CheckCircle, Zap, ExternalLink, ShieldAlert, BadgeCheck, Plus, ShieldCheck, Lock, Smartphone, RefreshCcw } from 'lucide-react';
import { supabase } from '@/config/supabaseClient';
import { T, Badge, Btn, fmt, Alert, FI, Dialog, WaitingOverlay, DT, hasRegFee, generateLoanAgreementHTML, generateAssetListHTML, downloadLoanDoc, sbWrite, toSupabaseLoan, now, RC } from '@/lms-common';
import { useDisbursements } from './hooks/useDisbursements';
import SignaturePage from './SignaturePage';

const DisbursementsTab = ({ loans = [], customers = [], payments = [], setLoans, addAudit, showToast, onManualLog }) => {
  const [, setSearchParams] = useSearchParams();
  const [sel, setSel] = useState(null);
  const [lastSel, setLastSel] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  
  // OTP Security State
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [pendingType, setPendingType] = useState(null); // 'mpesa' | 'manual'

  // Resend Countdown Timer
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  // SECURITY (VULN-01): 'phone' is NOT stored in disbF — the server
  // resolves the recipient phone from the customer record. We only
  // keep a read-only display value derived from the customer object.
  const [disbF, setDisbF] = useState({ mpesa: '', date: now() });
  const { disburse, loading: disburseLoading, waitingForCallback, status: disbStatus, isSuccess, failureReason, reset } = useDisbursements();
  
  // Failure Tracking
  const [failedAttempts, setFailedAttempts] = useState({}); // { loanId: { reason, ts } }
  React.useEffect(() => {
    supabase.from('b2c_disbursements')
      .select('loan_id, status, result_desc, created_at')
      .in('loan_id', approvedLoans.map(l => l.id))
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const mapping = {};
        data.forEach(d => {
          if (!mapping[d.loan_id]) {
             mapping[d.loan_id] = d;
          }
        });
        setFailedAttempts(mapping);
      });
  }, [loans]); // Re-fetch when loans change
  
  const handleReset = () => {
    reset();
    setLastSel(null);
    setOtpSent(false);
    setOtpValue('');
    setPendingType(null);
  };

  const approvedLoans = loans.filter(l => l.status === 'Approved');

  const sendOtp = async (type) => {
    setOtpLoading(true);
    setPendingType(type);
    try {
      const { data, error } = await supabase.functions.invoke('send-admin-otp', {
        body: { origin: window.location.origin }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setOtpSent(true);
      showToast('🔐 Security Code Sent', 'Verification code sent to your registered phone.', 'info');
    } catch (err) {
      showToast('❌ Security Error: ' + err.message, 'danger');
    } finally {
      setOtpLoading(false);
      setResendCountdown(30);
    }
  };

  const verifyOtpAndExecute = async () => {
    if (!otpValue || otpValue.length < 4) {
      showToast('❌ Invalid Code', 'Please enter the 4-digit security code.', 'warn');
      return;
    }

    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-admin-otp', {
        body: { otp: otpValue }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.success) {
        showToast('✅ Identity Verified', 'Security check passed. Processing disbursement...', 'ok');
        if (pendingType === 'mpesa') {
          await executeMpesaDisburse();
        } else {
          executeManualDisburse();
        }
      } else {
        throw new Error(data?.message || 'Invalid security code');
      }
    } catch (err) {
      showToast('❌ Verification Failed: ' + err.message, 'danger');
      setOtpValue(''); // Clear stale/incorrect code
    } finally {
      setOtpLoading(false);
    }
  };

  const executeManualDisburse = () => {
    if (!sel) return;
    const cust = customers.find(c => c.id === (sel.customerId || sel.customer_id));
    const targetPhone = cust?.phone || sel?.phone;
    
    if (!disbF.mpesa || !targetPhone) {
      showToast('❌ Reference code or recipient phone missing.', 'warn');
      return;
    }
    const disbUpd = { ...sel, status: 'Active', disbursed: disbF.date, mpesa: disbF.mpesa, phone: targetPhone };
    
    sbWrite('loans', toSupabaseLoan(disbUpd))
      .then(() => {
        if (setLoans) setLoans(ls => ls.map(l => l.id === sel.id ? disbUpd : l));
        addAudit('Loan Disbursed (Manual)', sel.id, `${fmt(sel.amount)} via ${disbF.mpesa}`);
        showToast(`✅ Loan ${sel.id} disbursed — ${fmt(sel.amount)}`, 'ok');
        setSel(null);
        setOtpSent(false);
        setOtpValue('');
        setDisbF({ mpesa: '', date: now() });
      })
      .catch(err => showToast('❌ Error: ' + err.message, 'danger'));
  };

  const executeMpesaDisburse = async () => {
    if (!sel) return;
    try {
      // SECURITY (VULN-01): No phone argument — server resolves from customer record.
      await disburse(sel.id);
      
      // OPTIMISTIC UPDATE: Mark as Active locally to remove from queue immediately
      setLoans(ls => ls.map(l => l.id === sel.id ? { ...l, status: 'Active', disbursed: now(), phone: (customers.find(c => c.id === (l.customerId || l.customer_id))?.phone || l.phone) } : l));

      addAudit('M-Pesa Disbursement Initiated', sel.id, `${fmt(sel.amount)} via Daraja`);
      showToast('🚀 Disbursement initiated via M-Pesa.', 'info');
      setLastSel(sel);
      setSel(null);
      setOtpSent(false);
      setOtpValue('');
    } catch (err) {
      showToast('❌ M-Pesa Error: ' + err.message, 'danger');
    }
  };

  const doDecline = () => {
    if (!sel) return;
    if (!window.confirm(`Are you sure you want to decline this loan application for ${sel.customer}? It will be removed from the disbursement queue.`)) return;

    const upd = { ...sel, status: 'Rejected', rejectedAt: now() };
    sbWrite('loans', toSupabaseLoan(upd))
      .then(() => {
        if (setLoans) setLoans(ls => ls.map(l => l.id === sel.id ? upd : l));
        addAudit('Loan Declined at Disbursement', sel.id, `Principal: ${fmt(sel.amount)}`);
        showToast(`⚠ Loan ${sel.id} has been declined and removed from the queue.`, 'warn');
        setSel(null);
      })
      .catch(err => showToast('❌ Error: ' + err.message, 'danger'));
  };

  // WebOTP for Disbursement Authorization
  React.useEffect(() => {
    if (otpSent && !otpValue && !otpLoading && 'OTPCredential' in window) {
      const ac = new AbortController();
      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
      }).then(otp => {
        setOtpValue(otp.code);
      }).catch(err => {
        if (err.name !== 'AbortError') console.log('[WebOTP Disbursement] Error:', err);
      });
      return () => ac.abort();
    }
  }, [otpSent, otpLoading]);


  return (
    <div className="fu" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: T.txt, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={20} color={T.accent} /> Disbursement Queue
          </h2>
          <p style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>Review applications and authorize fund releases.</p>
        </div>
        <div style={{ background: T.aLo, padding: '8px 16px', borderRadius: 99, border: `1px solid ${T.accent}40`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, animation: 'pulse 2s infinite' }} />
            <span style={{ color: T.accent, fontWeight: 800, fontSize: 13 }}>{approvedLoans.length} Pending Approval</span>
        </div>
      </div>

      <DT 
        cols={[
            { k: 'customer', l: 'Customer Entity', r: (v, row) => (
                <div>
                    <div style={{ fontWeight: 800, color: T.txt }}>{v}</div>
                    <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono }}>ID: {row.id}</div>
                </div>
            )},
            { k: 'amount', l: 'Principal', r: (v) => <span style={{ fontWeight: 900, color: T.accent, fontSize: 15 }}>{fmt(v)}</span> },
            { k: 'registration', l: 'M-Pesa Registry', r: (v, row) => {
                const cust = customers.find(c => c.id === row.customerId);
                const feePaid = hasRegFee(cust, payments);
                return (
                    <Badge color={feePaid ? T.ok : T.danger}>
                        {feePaid 
                          ? <><BadgeCheck size={12} /> Registered</>
                          : <><ShieldAlert size={12} /> Unregistered</>
                        }
                    </Badge>
                );
            }},
            { k: 'status', l: 'Disbursement Status', r: (v, row) => {
                const attempt = failedAttempts[row.id];
                if (!attempt || attempt.status === 'completed') return <Badge color={T.muted}>Idle</Badge>;
                if (attempt.status === 'failed') return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Badge color={T.danger}><AlertOctagon size={12} /> FAILED</Badge>
                    <div style={{ fontSize: 9, color: T.danger, fontWeight: 700, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={attempt.result_desc}>
                      {attempt.result_desc}
                    </div>
                  </div>
                );
                return <Badge color={T.warn}>Pending</Badge>;
            }},
            { k: 'action', l: 'Access Management', r: (v, row) => {
                const isFailed = failedAttempts[row.id]?.status === 'failed';
                return (
                  <Btn onClick={() => { setSel(row); setDisbF({ mpesa: '', date: now() }); setOtpSent(false); setOtpValue(''); }} v={isFailed ? "gold" : "primary"} sm icon={isFailed ? RefreshCcw : Rocket}>
                      {isFailed ? "Retry Authorization" : "Authorize"}
                  </Btn>
                );
            }}
        ]}
        rows={approvedLoans}
        emptyMsg="The disbursement queue is currently clear. Approved loans will appear here."
      />

      {sel && (() => {
        // Fallback: Check both ID and Name (useful if customers were wiped/re-created)
        const cust = customers.find(c => c.id === (sel.customerId || sel.customer_id));
        const feeOk = hasRegFee(cust, payments);
        const otherActive = loans.find(l => l.customerId === cust?.id && l.status === 'Active' && Number(l.balance || 0) > 0 && l.id !== sel.id);
        return (
          <Dialog title={`Authorize Disbursement · ${sel.id}`} onClose={() => { setSel(null); setOtpSent(false); setOtpValue(''); }} width={580}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: T.card2, padding: '12px 16px', borderRadius: 16, border: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Target Entity</div>
                        <div style={{ color: T.txt, fontSize: 18, fontWeight: 900, marginTop: 2 }}>{sel.customer}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Payout Volume</div>
                        <div style={{ color: T.accent, fontSize: 18, fontWeight: 900, marginTop: 2 }}>{fmt(sel.amount)}</div>
                    </div>
              </div>

              {!cust && (
                <Alert type="danger">
                  <b>Customer Record Missing:</b> The profile for this borrower could not be found. 
                  Live M-Pesa disbursement is disabled as the recipient phone number is unknown.
                </Alert>
              )}

              {cust && otherActive && (
                <Alert type="danger">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, lineHeight: 1.4 }}>
                    <ShieldAlert size={20} style={{ marginTop: 2 }} />
                    <div>
                      <b>Parallel Loan Block:</b> This customer already has an active loan (<b>{otherActive.id}</b>). <br />
                      Database constraints prevent multiple active loans per client. You must settle the existing loan before disbursing this one.
                    </div>
                  </div>
                </Alert>
              )}

              {cust && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!feeOk && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <Alert type='danger'>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, lineHeight: 1.4 }}>
                          <ShieldAlert size={20} style={{ marginTop: 2 }} />
                          <div>
                            <b>Security Block: M-Pesa Registration Required.</b><br />
                            This customer has not paid their mandatory registration fee. Disbursement engine is locked.
                          </div>
                        </div>
                      </Alert>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Btn v='gold' onClick={() => setSearchParams({ tab: 'registration-fee', customerId: cust.id })} full icon={ExternalLink}>Go to Registry</Btn>
                        <Btn v='secondary' onClick={() => onManualLog(cust)} full icon={Plus} style={{ border: `1px dashed ${T.border}` }}>Log Fee Manually</Btn>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 8 }}>
                      <Badge color={RC[cust.risk]}>{cust.risk} Risk</Badge>
                      <Badge color={cust.blacklisted ? T.danger : T.ok}>{cust.blacklisted ? 'Blacklisted' : 'Active'}</Badge>
                      {cust.mpesa_registered && <Badge color={T.ok} icon={BadgeCheck}>M-Pesa Verified</Badge>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn v='secondary' sm onClick={() => setShowSignature(true)} icon={ClipboardSignature}>Sign Document</Btn>
                      <Btn v='secondary' sm onClick={() => downloadLoanDoc(generateLoanAgreementHTML(sel, cust, sel.officer), 'loan-agreement-' + sel.id + '.html')} icon={FileText}>Agreement</Btn>
                      <Btn v='secondary' sm onClick={() => downloadLoanDoc(generateAssetListHTML(sel, cust, sel.officer), 'asset-list-' + sel.id + '.html')} icon={PackageOpen}>Assets</Btn>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: T.surface, padding: 14, borderRadius: 16, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 850, color: T.dim, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1.5 }}>Configuration</div>
                <FI label='M-Pesa Reference / TXN Code' value={disbF.mpesa} onChange={v => setDisbF(f => ({ ...f, mpesa: v }))} required placeholder='OAB1234567' />
                <div style={{ height: 8 }} />
                {/* SECURITY (VULN-01): Phone is READ-ONLY — shown for transparency but
                    cannot be edited. The server resolves it from the customer record. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: 0.8 }}>Recipient Phone (Verified)</div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 10,
                    background: `${T.ok}12`,
                    border: `1px solid ${T.ok}40`,
                    fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.ok,
                    letterSpacing: '0.04em'
                  }}>
                    <ShieldAlert size={14} color={T.ok} />
                    {cust?.phone || sel?.phone || <span style={{ color: T.danger, fontWeight: 600 }}>⚠ No phone on record — update customer profile first</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: T.muted, background: T.surface, padding: '2px 8px', borderRadius: 6 }}>Locked</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, fontStyle: 'italic' }}>To change this number, update the customer profile. Phone overrides are not permitted.</div>
                </div>
              </div>

              {otpSent && (
                <div style={{ background: `${T.accent}10`, padding: 16, borderRadius: 16, border: `1px solid ${T.accent}40`, display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.3s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={18} color={T.accent} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: T.txt }}>Identity Verification Required</span>
                  </div>
                  <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>A 4-digit security code has been sent to your phone. Enter it below to authorize this payout.</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input 
                      type="text" 
                      maxLength={4}
                      value={otpValue}
                      onChange={e => setOtpValue(e.target.value.replace(/\D/g, ''))}
                      placeholder="0000"
                      style={{ 
                        flex: 1, 
                        textAlign: 'center', 
                        fontSize: 24, 
                        fontWeight: 900, 
                        letterSpacing: 8, 
                        fontFamily: T.mono,
                        background: T.card,
                        border: `2px solid ${T.accent}`,
                        borderRadius: 12,
                        padding: '8px'
                      }}
                    />
                    <Btn onClick={verifyOtpAndExecute} v='primary' disabled={otpLoading || otpValue.length < 4} style={{ padding: '0 24px' }}>
                      {otpLoading ? 'Verifying...' : 'Authorize'}
                    </Btn>
                  </div>
                  <button 
                    onClick={() => sendOtp(pendingType)} 
                    disabled={otpLoading || resendCountdown > 0}
                    style={{ background: 'none', border: 'none', color: T.accent, fontSize: 11, fontWeight: 700, cursor: resendCountdown > 0 ? 'default' : 'pointer', textDecoration: resendCountdown > 0 ? 'none' : 'underline', alignSelf: 'flex-start', padding: 0, opacity: resendCountdown > 0 ? 0.6 : 1 }}
                  >
                    {resendCountdown > 0 ? `Resend Code (${resendCountdown}s)` : 'Resend Code'}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12, borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
                {!otpSent ? (
                  <>
                    <Btn onClick={() => sendOtp('mpesa')} v='primary' full disabled={!cust || !feeOk || disburseLoading || !!otherActive || otpLoading} icon={Rocket}>
                      {otpLoading && pendingType === 'mpesa' ? 'Preparing Security Check...' : 'Trigger M-Pesa B2C Payout'}
                    </Btn>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Btn onClick={() => sendOtp('manual')} v='ok' full disabled={!feeOk || !disbF.mpesa || !!otherActive || otpLoading} icon={CheckCircle}>Confirm Manual Payout</Btn>
                      <Btn onClick={doDecline} v='danger' outline full icon={X}>Decline Application</Btn>
                    </div>
                  </>
                ) : (
                  <Btn onClick={() => { setOtpSent(false); setOtpValue(''); }} v='secondary' outline full icon={X}>Cancel Authorization</Btn>
                )}
                <Btn onClick={() => { setSel(null); setOtpSent(false); setOtpValue(''); }} v='secondary' full>Cancel & Close</Btn>
              </div>
            </div>
          </Dialog>
        );
      })()}

      {waitingForCallback && (
        <WaitingOverlay title="Funds Dispatch" message={`Releasing capital to ${lastSel?.customer || 'Borrower'}`} sub="Connecting to M-Pesa Secure Gateway..." onClose={handleReset} />
      )}
      {isSuccess && (
        <WaitingOverlay type="success" title="Capital Dispatched" message={`The funds for ${lastSel?.customer || 'Borrower'} have been released successfully.`} onClose={handleReset} />
      )}
      {(disbStatus === 'failed' || disbStatus === 'stuck') && failureReason && (
        <WaitingOverlay type="danger" title={disbStatus === 'stuck' ? "Sync Timeout" : "Disbursement Failed"} message={failureReason} onClose={handleReset} />
      )}
      {showSignature && sel && (
        <SignaturePage 
          loan={sel} 
          onClose={() => setShowSignature(false)} 
          onSave={(borrowerSig, officerSig) => {
            const updates = {};
            if (borrowerSig) updates.borrower_signature = `data:image/png;base64,${borrowerSig}`;
            if (officerSig) updates.officer_signature = `data:image/png;base64,${officerSig}`;
            setSel(prev => ({ ...prev, ...updates }));
            if (setLoans) {
              setLoans(prev => prev.map(l => l.id === sel.id ? { ...l, ...updates } : l));
            }
            setShowSignature(false);
          }} 
        />
      )}
      <style>{`
          @keyframes pulse {
              0% { opacity: 0.6; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.1); }
              100% { opacity: 0.6; transform: scale(1); }
          }
      `}</style>
    </div>
  );
};

export default DisbursementsTab;
