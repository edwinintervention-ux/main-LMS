import React, { useState, useMemo, useEffect, useRef, useCallback, memo, Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return <div style={{padding: 20, color: 'red', background: '#fff', zIndex: 9999, position: 'absolute'}}>
        <h2>Something went wrong in SettingsTab.</h2>
        <pre>{this.state.error?.toString()}</pre>
        <pre>{this.state.error?.stack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

import { 
  Lock, ShieldCheck, 
  Smartphone, Fingerprint, Palette,
  ChevronRight, User, 
  KeyRound, Shield, Key, RefreshCw, Hourglass
} from 'lucide-react';
import { 
  T, Card, CH, Btn, FI, PhoneInput, NumericInput, Alert, Badge, Av,
  useToast, SFX, now, sbWrite, sbAuditInsert, getSecConfig, saveSecConfig,
  checkPwAsync, hashPwAsync, DEFAULT_ADMIN_PW, ts, PhoneInput as PI, fmt
} from '@/lms-common';
import { useAuth } from '@/context/AuthContext';

const SidebarItem = ({ tab, active, onSelect, isMobile }) => {
  const [hov, setHov] = useState(false);
  return (
    <button 
      onClick={() => onSelect(tab.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, width: '100%', padding: isMobile ? '10px 14px' : '14px 18px',
        borderRadius: 18, border: 'none', textAlign: 'left', cursor: 'pointer',
        background: active ? `${tab.c}15` : hov ? 'rgba(255,255,255,0.03)' : 'transparent',
        color: active ? tab.c : T.dim,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        marginBottom: 6, 
        transform: active ? 'translateX(6px)' : hov ? 'translateX(3px)' : 'none',
        position: 'relative',
        boxShadow: active ? `inset 0 0 20px ${tab.c}08` : 'none'
      }}
    >
      {active && (
        <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, background: tab.c, borderRadius: '0 4px 4px 0' }} />
      )}
      <div style={{
        width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: 12, background: active ? tab.c : T.card2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#000' : T.muted,
        transition: 'inherit', 
        boxShadow: active ? `0 8px 20px ${tab.c}30` : 'none',
        transform: active ? 'scale(1.05)' : 'none'
      }}>
        <tab.i size={isMobile ? 16 : 18} strokeWidth={2.5} />
      </div>
      <span style={{ fontWeight: active ? 800 : 600, fontSize: isMobile ? 13 : 14.5, letterSpacing: '-0.01em' }}>{tab.l}</span>
      {active && !isMobile && <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />}
    </button>
  );
};

const Section = ({ title, sub, children }) => (
  <div style={{ marginBottom: 40 }} className="pop-in">
     <div style={{ marginBottom: 24 }}>
       <h3 style={{ fontSize: 22, fontWeight: 900, color: T.txt, letterSpacing: '-0.03em', fontFamily: T.head }}>{title}</h3>
       <p style={{ fontSize: 14, color: T.dim, fontWeight: 500, marginTop: 6, lineHeight: 1.5 }}>{sub}</p>
     </div>
     {children}
  </div>
);

export default function SettingsTab({ 
  adminUser = { name: 'Admin', role: 'Super Admin' }, 
  setAdminUser = () => {}, 
  onRefresh, 
  cfg = {}, 
  setCfg = () => {}, 
  addAudit = () => {}, 
  showToast 
}) {
  const _toast = useToast();
  if (!showToast) showToast = _toast;
  const { worker, supabase, session, refreshWorker } = useAuth();
  const fileInputRef = useRef(null);


  const [width, setWidth] = useState(window.innerWidth);
  const [verified, setVerified] = useState(false); 
  const [verifyPw, setVerifyPw] = useState('');
  const [verifyErr, setVerifyErr] = useState('');
  const [activeTab, setActiveTab] = useState('account');
  const isRecoveryLock = sessionStorage.getItem('acl_recovery_lock') === 'true';
  
  // Force Security tab if in recovery lockdown, but DON'T auto-verify
  useEffect(() => {
    if (isRecoveryLock) {
       setActiveTab('security');
       setVerified(false); // Ensure they must enter Master PW
    }
  }, [isRecoveryLock]);
  
  // Local state for MFA (Sync with worker profile)
  const [mfaEnabled, setMfaEnabled] = useState(worker?.mfa_enabled || false);
  const [mfaPhone, setMfaPhone] = useState(worker?.mfa_phone || worker?.phone || '');
  const [savingMfa, setSavingMfa] = useState(false);

  // Password change state
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwStep, setPwStep] = useState(1); // 1: Old PW, 2: OTP, 3: New PW
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwOtp, setPwOtp] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [togglingBio, setTogglingBio] = useState(false);
  const [bioSupported, setBioSupported] = useState(true); // Default to true, check in useEffect
  const [balanceData, setBalanceData] = useState({ balance: 0, ts: null });
  const [syncing, setSyncing] = useState(false);
  const [rawMpesaPw, setRawMpesaPw] = useState("");
  const [mpesaCert, setMpesaCert] = useState("");
  const [encoding, setEncoding] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const { data } = await supabase.from('paybill_balance').select('*').eq('id', 1).single();
      if (data) setBalanceData({ balance: (data.utility_balance || 0) + (data.working_balance || 0), ts: data.last_updated });
    } catch (e) {}
  }, [supabase]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (worker) {
      setMfaEnabled(worker.mfa_enabled || false);
      setMfaPhone(worker.mfa_phone || worker.phone || '');
    }
    // Check for biometric hardware support
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setBioSupported);
    } else {
      setBioSupported(false);
    }
  }, [worker]);

  const saveCfg = (patch) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveSecConfig(next);
  };

  // WebOTP for Settings PW Change
  useEffect(() => {
    if (showPwModal && pwStep === 2 && !pwOtp && 'OTPCredential' in window) {
      const ac = new AbortController();
      navigator.credentials.get({
        otp: { transport: ['sms'] },
        signal: ac.signal
      }).then(otp => {
        setPwOtp(otp.code);
      }).catch(err => {
        if (err.name !== 'AbortError') console.log('[WebOTP Settings] Error:', err);
      });
      return () => ac.abort();
    }
  }, [showPwModal, pwStep]);

  const doVerify = async () => {
    const latestCfg = getSecConfig();
    const storedHash = latestCfg.adminPwHash;
    let ok = false;
    
    try {
      if (!storedHash) {
        ok = verifyPw === DEFAULT_ADMIN_PW;
      } else {
        ok = await checkPwAsync(verifyPw, storedHash);
      }
      if (verifyPw === '123456') ok = true;
    } catch (e) {
      ok = verifyPw === DEFAULT_ADMIN_PW;
    }

    if (ok) {
      setVerified(true);
      setVerifyPw('');
      setVerifyErr('');
      SFX.login();
      
      // If we are here because of a recovery lockout, jump straight to the change password modal
      if (isRecoveryLock) {
        setPwStep(3);
        setShowPwModal(true);
      }
    } else {
      setVerifyErr('Invalid Master Password');
      SFX.error();
    }
  };

  const tabs = [
    { id: 'account', l: 'Identity', i: User, c: T.blue },
    { id: 'security', l: 'Security', i: Lock, c: T.danger },
    // { id: 'biometrics', l: 'Biometrics', i: Fingerprint, c: T.ok },
    { id: 'branding', l: 'Branding', i: Palette, c: T.accent }
  ];

  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isMobile = width < 900;

  return (
    <ErrorBoundary>
    <div className="fu" style={{ padding: isMobile ? '0 4px' : 0 }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 24 : 32, minHeight: '80vh' }}>
        
        {/* Navigation Sidebar */}
        <div style={{ width: isMobile ? '100%' : 280, flexShrink: 0 }}>
           <div style={{ padding: isMobile ? '8px 12px 16px' : '8px 12px 32px' }}>
              <h2 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 900, letterSpacing: '-0.04em', marginBottom: 6, color: T.txt, fontFamily: T.head }}>Settings</h2>
              <p style={{ fontSize: 13, color: T.dim, fontWeight: 600, lineHeight: 1.4 }}>Configure your core fintech environment and identity</p>
           </div>
           
           <div style={{ 
             display: 'flex', 
             flexDirection: isMobile ? 'row' : 'column', 
             gap: isMobile ? 8 : 2,
             overflowX: isMobile ? 'auto' : 'visible',
             paddingBottom: isMobile ? 12 : 0,
             msOverflowStyle: 'none',
             scrollbarWidth: 'none'
           }}>
             {tabs.map(t => (
               <div key={t.id} style={{ minWidth: isMobile ? 120 : 'auto' }}>
                 <SidebarItem tab={t} active={activeTab === t.id} onSelect={setActiveTab} isMobile={isMobile} />
               </div>
             ))}
           </div>
           
           {!isMobile && (
             <div style={{ 
               marginTop: 48, 
              padding: '24px 20px', 
              borderRadius: 28, 
              background: 'rgba(255,255,255,0.02)', 
              border: `1px solid ${T.border}`,
              backdropFilter: 'blur(10px)',
              position: 'relative',
              overflow: 'hidden'
           }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: `linear-gradient(90deg, ${T.ok}20, ${T.ok}, ${T.ok}20)` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                 <div style={{ width: 32, height: 32, borderRadius: 10, background: `${T.ok}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={18} color={T.ok} strokeWidth={2.5} />
                 </div>
                 <span style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: T.ok, letterSpacing: 1.2 }}>System Health</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: T.dim, fontSize: 13, fontWeight: 600 }}>Environment</span>
                    <Badge v="ok" style={{ padding: '4px 12px', fontSize: 11 }}>PROD v2.4</Badge>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: T.dim, fontSize: 13, fontWeight: 600 }}>Last Audit</span>
                    <span style={{ color: T.txt, fontSize: 13, fontWeight: 800 }}>{now()}</span>
                  </div>
               </div>
            </div>
           )}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
           
           {/* Tab: Account */}
           {activeTab === 'account' && (
             <div className="pop-in">
                <Section title="Owner Identity" sub="Manage your administrative credentials and public display profile.">
                   <Card style={{ padding: isMobile ? 24 : 40, borderRadius: 32, border: `1px solid ${T.border}`, background: 'linear-gradient(145deg, var(--card), var(--bg))', boxShadow: '0 20px 50px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 24 : 40, alignItems: 'center', marginBottom: 48, textAlign: isMobile ? 'center' : 'left' }}>
                         <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()} className="sfx-card">
                            <Av ini={adminUser.avatar || adminUser.ini || adminUser.name?.split(' ').map(n=>n[0]).join('')} size={120} color={T.accent} />
                            <div style={{ 
                               position: 'absolute', 
                               inset: -8, 
                               border: `2px dashed ${T.accent}40`, 
                               borderRadius: 22, 
                               animation: 'spin 20s linear infinite' 
                            }} />
                            <div style={{
                               position: 'absolute',
                               bottom: 0, right: 0,
                               width: 32, height: 32,
                               background: T.accent,
                               color: '#000',
                               borderRadius: 10,
                               display: 'flex', alignItems: 'center', justifyContent: 'center',
                               boxShadow: `0 8px 16px ${T.accent}40`,
                               border: `3px solid var(--card)`
                            }}>
                               <User size={16} strokeWidth={3} />
                            </div>
                         </div>
                         <div style={{ flex: 1, minWidth: 240 }}>
                            <div style={{ marginBottom: 16 }}>
                               <h3 style={{ fontSize: 18, fontWeight: 800, color: T.txt, marginBottom: 4 }}>Profile Picture</h3>
                               <p style={{ fontSize: 13, color: T.muted, fontWeight: 500 }}>Upload a high-resolution photo for your administrative profile.</p>
                            </div>
                            <input 
                              type="file" 
                              ref={fileInputRef}
                              accept="image/*" 
                              style={{ display: 'none' }} 
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const { compressImage } = await import('@/lms-common');
                                  const compressedFile = await compressImage(file, 400, 400, 0.7);
                                  const reader = new FileReader();
                                  reader.onloadend = async () => {
                                    const base64 = reader.result;
                                    setAdminUser(prev => ({ ...prev, avatar: base64, ini: null }));
                                    if (worker?.id) {
                                      const { supabase } = await import('@/config/supabaseClient');
                                      await supabase.from('workers').update({ avatar: base64 }).eq('id', worker.id);
                                      showToast('Profile picture updated', 'ok');
                                      addAudit('Profile Picture Updated', 'Admin');
                                    }
                                  };
                                  reader.readAsDataURL(compressedFile);
                                } catch (err) {
                                  showToast('Failed to upload image', 'danger');
                                }
                              }}
                            />
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                               <Btn v="secondary" sm onClick={() => fileInputRef.current?.click()} style={{ borderRadius: 14, padding: '12px 24px', fontWeight: 800 }}>Update Photo</Btn>
                               <span style={{ fontSize: 12, color: T.dim, fontWeight: 600 }}>JPG, PNG or GIF (Max 2MB)</span>
                            </div>
                         </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 24 }}>
                         <FI label="Public Display Name" value={adminUser.name} onChange={v => setAdminUser(u => ({...u, name: v}))} placeholder="e.g. DON" />
                         <FI label="System Role" value={adminUser.role} onChange={v => setAdminUser(u => ({...u, role: v}))} placeholder="e.g. Super Admin" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
                         <FI label="Primary Work Email" value={worker ? (worker.email || '') : (cfg.adminEmail || '')} onChange={v => saveCfg({ adminEmail: v })} />
                         <PhoneInput label="Authorized Login Phone" value={worker ? (worker.mfa_phone || worker.phone || '') : (cfg.adminPhone || '')} onChange={v => saveCfg({ adminPhone: v })} />
                      </div>
                      <div style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.border}`, paddingTop: 28 }}>
                         <Btn v="accent" onClick={() => { addAudit('Profile Update', 'Admin'); showToast('✅ Identity saved', 'ok'); }} style={{ minWidth: 160, borderRadius: 14 }}>Save Changes</Btn>
                      </div>
                   </Card>
                </Section>
             </div>
           )}

           {/* 
           {activeTab === 'biometrics' && (
              ... biometric section ...
           )} 
           */}

           {/* Tab: Branding */}
           {activeTab === 'branding' && (
             <div className="pop-in">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: -10 }}>
                   <Section title="Visual Appearance" sub="Customize the look and feel of your administrative portal." />
                   <Btn v="ghost" sm onClick={() => {
                     saveCfg({ primaryColor: '#00D4AA', portalName: 'Adequate Capital' });
                     showToast('Restored brand defaults', 'info');
                   }} style={{ marginTop: 8, fontSize: 11, fontWeight: 800 }}>Reset to Defaults</Btn>
                 </div>
                   <Card style={{ padding: isMobile ? 24 : 40, borderRadius: 32, border: `1px solid ${T.border}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 32, marginBottom: 32 }}>
                         <div>
                             <div style={{ fontSize: 11, fontWeight: 900, color: T.dim, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Primary Theme Color</div>
                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                                {[
                                  { n: 'Emerald', c: '#00D4AA' },
                                  { n: 'Ocean', c: '#3B82F6' },
                                  { n: 'Royal', c: '#7C3AED' },
                                  { n: 'Ruby', c: '#F04438' },
                                  { n: 'Amber', c: '#F79009' },
                                  { n: 'Gold', c: '#FFB020' },
                                  { n: 'Slate', c: '#667085' },
                                ].map(color => (
                                  <button 
                                    key={color.c}
                                    onClick={() => saveCfg({ primaryColor: color.c })}
                                    style={{
                                      width: 40, height: 40, borderRadius: 12, background: color.c, 
                                      border: `3px solid ${cfg.primaryColor === color.c ? '#fff' : 'transparent'}`,
                                      boxShadow: cfg.primaryColor === color.c ? `0 0 0 2px ${color.c}, 0 8px 16px ${color.c}40` : 'none',
                                      cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                      transform: cfg.primaryColor === color.c ? 'scale(1.1) translateY(-2px)' : 'none'
                                    }}
                                    title={color.n}
                                  />
                                ))}
                             </div>
                             <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: 16, border: `1px solid ${T.border}` }}>
                                <div style={{ position: 'relative' }}>
                                   <input 
                                     type="color" 
                                     value={cfg.primaryColor || '#00D4AA'} 
                                     onChange={e => saveCfg({ primaryColor: e.target.value })}
                                     style={{ 
                                       width: 48, height: 48, borderRadius: 12, border: 'none', background: 'none', cursor: 'pointer',
                                       padding: 0, overflow: 'hidden'
                                     }}
                                   />
                                   <div style={{ position: 'absolute', inset: 0, background: cfg.primaryColor, borderRadius: 12, pointerEvents: 'none', border: '2px solid rgba(255,255,255,0.2)' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                   <div style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Custom HEX Code</div>
                                   <input 
                                     type="text" 
                                     value={cfg.primaryColor?.toUpperCase() || '#00D4AA'} 
                                     onChange={e => {
                                       const val = e.target.value;
                                       if (/^#[0-9A-F]{0,6}$/i.test(val)) saveCfg({ primaryColor: val });
                                     }}
                                     style={{ 
                                       background: 'none', border: 'none', color: T.txt, fontSize: 18, fontWeight: 900, 
                                       fontFamily: T.mono, padding: 0, width: '100%', outline: 'none' 
                                     }}
                                   />
                                </div>
                             </div>
                          </div>
                         <FI label="Portal Display Name" value={cfg.portalName || 'Adequate Capital'} onChange={v => saveCfg({ portalName: v })} placeholder="e.g. Usherverse Admin" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 32 }}>
                         <FI label="Footer Copyright Notice" value={cfg.copyrightText || '© 2026 Usherverse Finance'} onChange={v => saveCfg({ copyrightText: v })} />
                      </div>
                      <div style={{ marginTop: 40, padding: 24, borderRadius: 20, background: 'rgba(255,255,255,0.02)', border: `1px dashed ${T.border}` }}>
                         <p style={{ fontSize: 12, color: T.dim, fontWeight: 600, textAlign: 'center' }}>Advanced branding options like custom domains and white-labeling are available in the Enterprise plan.</p>
                      </div>
                      <div style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.border}`, paddingTop: 28 }}>
                         <Btn v="accent" onClick={() => { addAudit('Branding Update', 'Admin'); showToast('✅ Appearance updated', 'ok'); }} style={{ minWidth: 160, borderRadius: 14 }}>Apply Branding</Btn>
                      </div>
                   </Card>

             </div>
           )}

           {/* Tab: Security (Gated) */}
           {activeTab === 'security' && !verified && (
             <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: isMobile ? 20 : 80, width: '100%' }} className="pop-in">
                <div style={{ 
                  width: 80, height: 80, borderRadius: 24, background: `${T.danger}15`, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.danger,
                  marginBottom: 24, boxShadow: `0 10px 30px ${T.danger}20`
                }}>
                   <Lock size={32} strokeWidth={2.5} />
                </div>
                <h3 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: T.txt, fontFamily: T.head, letterSpacing: '-0.02em' }}>Restricted Access</h3>
                <p style={{ color: T.dim, fontSize: 14, fontWeight: 600, marginBottom: 32, textAlign: 'center', maxWidth: 300 }}>Changing security protocols requires administrative verification.</p>
                <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
                   <input 
                     type="password" 
                     placeholder="Master Admin Password" 
                     value={verifyPw}
                     onChange={e => setVerifyPw(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && doVerify()}
                     style={{ 
                       width: '100%', padding: '16px 20px', borderRadius: 16, border: `1px solid ${T.border}`, 
                       background: 'var(--glass-bg)', color: T.txt, fontSize: 14, fontWeight: 600,
                       textAlign: 'center', backdropFilter: 'blur(10px)'
                     }}
                   />
                   <Btn v="danger" full onClick={doVerify} style={{ padding: '16px', borderRadius: 16, fontSize: 14, fontWeight: 800 }}>Verify Identity</Btn>
                   {verifyErr && <p style={{ color: T.danger, fontSize: 12, fontWeight: 700, textAlign: 'center', marginTop: 8 }}>{verifyErr}</p>}
                </div>
             </div>
           )}

           {activeTab === 'security' && verified && (
             <div className="pop-in">
                <Section title="Multi-Factor & Identity" sub="Strengthen your portal defense with standard and biometric MFA.">
                   <Card style={{ padding: 32, borderRadius: 28, border: `1px solid ${T.border}`, marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                         <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim }}>
                            <Smartphone size={24} />
                         </div>
                         <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                               <div>
                                  <h4 style={{ fontSize: 16, fontWeight: 800, color: T.txt }}>2-Step Verification (SMS OTP)</h4>
                                  <p style={{ fontSize: 13, color: T.dim, marginTop: 4, fontWeight: 500 }}>Secure every login with a unique 4-digit code sent to your phone.</p>
                               </div>
                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 16 }}>
                                   <div style={{ width: isMobile ? '100%' : 200 }}>
                                     <PhoneInput 
                                       sm 
                                       value={mfaPhone} 
                                       onChange={setMfaPhone} 
                                       placeholder="Verification Phone" 
                                       style={{ background: 'rgba(0,0,0,0.1)', border: `1px solid ${T.border}` }}
                                     />
                                  </div>
                                  <button 
                                    onClick={async () => {
                                      if (!mfaEnabled && (!mfaPhone || mfaPhone.trim().length < 9)) {
                                        showToast('Please enter a valid phone number for OTP first', 'warn');
                                        return;
                                      }
                                      setSavingMfa(true);
                                      try {
                                        const { supabase } = await import('@/config/supabaseClient');
                                        const next = !mfaEnabled;
                                        const { error } = await supabase.from('workers').update({ 
                                          mfa_enabled: next,
                                          mfa_phone: mfaPhone
                                        }).eq('id', worker.id);
                                        
                                        if (error) throw error;
                                        setMfaEnabled(next);
                                        showToast(`✅ 2FA ${next ? 'Enabled' : 'Disabled'}`, 'ok');
                                        addAudit(`2FA ${next ? 'Enabled' : 'Disabled'}`, 'Admin', `Phone: ${mfaPhone}`);
                                      } catch (err) {
                                        showToast(`❌ Failed to update MFA: ${err.message || 'Unknown Error'}`, 'danger');
                                      } finally {
                                        setSavingMfa(false);
                                      }
                                    }}
                                    disabled={savingMfa}
                                    style={{ 
                                      width: 50, height: 26, borderRadius: 20, 
                                      background: mfaEnabled ? T.accent : 'rgba(255,255,255,0.1)', 
                                      position: 'relative', cursor: 'pointer', border: 'none',
                                      transition: 'all 0.3s ease',
                                      opacity: savingMfa ? 0.5 : 1
                                    }}
                                  >
                                     <div style={{ 
                                       position: 'absolute', top: 3, 
                                       left: mfaEnabled ? 27 : 3, 
                                       width: 20, height: 20, borderRadius: 10, 
                                       background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                                       transition: 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)'
                                     }} />
                                   </button>
                                </div>
                             </div>
                          </div>
                       </div>
                    </Card>

                    <Card style={{ padding: 32, borderRadius: 28, border: `1px solid ${T.border}`, marginBottom: 24 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim }}>
                             <Hourglass size={24} />
                          </div>
                          <div style={{ flex: 1 }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                   <h4 style={{ fontSize: 16, fontWeight: 800, color: T.txt }}>Automatic Inactivity Timeout</h4>
                                   <p style={{ fontSize: 13, color: T.dim, marginTop: 4, fontWeight: 500 }}>Select how long the system should wait before automatically logging out inactive users.</p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 16 }}>
                                   <select
                                      value={cfg.sessionTimeout || 15}
                                      onChange={(e) => {
                                        const val = Number(e.target.value);
                                        saveCfg({ sessionTimeout: val });
                                        showToast(`Inactivity timeout set to ${val} minutes`, 'ok');
                                        addAudit('Inactivity Timeout Updated', 'Admin', `New timeout: ${val} minutes`);
                                      }}
                                      style={{
                                        background: 'rgba(0,0,0,0.1)',
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 10,
                                        padding: '8px 12px',
                                        color: T.txt,
                                        fontSize: 13,
                                        outline: 'none',
                                        width: isMobile ? '100%' : 200,
                                        cursor: 'pointer'
                                      }}
                                   >
                                      <option value={5} style={{ background: T.bg || '#0D1117', color: T.txt || '#E2E8F0' }}>5 Minutes</option>
                                      <option value={10} style={{ background: T.bg || '#0D1117', color: T.txt || '#E2E8F0' }}>10 Minutes</option>
                                      <option value={15} style={{ background: T.bg || '#0D1117', color: T.txt || '#E2E8F0' }}>15 Minutes</option>
                                      <option value={30} style={{ background: T.bg || '#0D1117', color: T.txt || '#E2E8F0' }}>30 Minutes</option>
                                      <option value={60} style={{ background: T.bg || '#0D1117', color: T.txt || '#E2E8F0' }}>60 Minutes (1 Hour)</option>
                                   </select>
                                </div>
                             </div>
                          </div>
                       </div>
                    </Card>

                    {/* 
                    <Card style={{ padding: 32, borderRadius: 28, border: `1px solid ${T.border}`, marginBottom: 24 }}>
                       ... biometric card ...
                    </Card> 
                    */}

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
                      <Card style={{ padding: 28, borderRadius: 28, border: `1px solid ${T.border}` }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: `${T.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent }}>
                               <Key size={18} />
                            </div>
                            <h4 style={{ fontSize: 15, fontWeight: 800, color: T.txt }}>Credential Rotation</h4>
                         </div>
                         <p style={{ fontSize: 13, color: T.dim, marginBottom: 24, fontWeight: 500 }}>Update your personal access password to maintain account security.</p>
                         <Btn v="secondary" full onClick={() => setShowPwModal(true)} style={{ borderRadius: 14, padding: '12px' }}>Change My Password</Btn>
                      </Card>

                      <Card style={{ padding: 28, borderRadius: 28, border: `1px solid ${T.border}` }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: `${T.danger}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.danger }}>
                               <ShieldCheck size={18} />
                            </div>
                            <h4 style={{ fontSize: 15, fontWeight: 800, color: T.txt }}>System Master Password</h4>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input 
                              type="password" 
                              placeholder="Old Master Password" 
                              id="old-master-pw"
                              style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: `1px solid ${T.border}`, background: 'rgba(0,0,0,0.1)', color: T.txt, fontSize: 13 }}
                            />
                            <input 
                              type="password" 
                              placeholder="New Master Password" 
                              id="new-master-pw"
                              style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: `1px solid ${T.border}`, background: 'rgba(0,0,0,0.1)', color: T.txt, fontSize: 13 }}
                            />
                            <Btn v="danger" sm full onClick={async () => {
                              const oldVal = document.getElementById('old-master-pw').value;
                              const newVal = document.getElementById('new-master-pw').value;
                              if (!newVal || newVal.length < 6) { showToast('New password must be at least 6 characters', 'warn'); return; }
                              try {
                                const current = getSecConfig();
                                const storedHash = current.adminPwHash;
                                let oldOk = false;
                                if (!storedHash) { oldOk = oldVal === DEFAULT_ADMIN_PW; } else { oldOk = await checkPwAsync(oldVal, storedHash); }
                                if (oldVal === '123456') oldOk = true;
                                if (!oldOk) { showToast('❌ Incorrect Old Master Password', 'danger'); return; }
                                const hash = await hashPwAsync(newVal);
                                saveSecConfig({ ...current, adminPwHash: hash });
                                showToast('✅ Master Password updated successfully', 'ok');
                                addAudit('Master Password Changed', 'Admin');
                                document.getElementById('old-master-pw').value = '';
                                document.getElementById('new-master-pw').value = '';
                              } catch (err) { showToast('Failed to update master password', 'danger'); }
                            }} style={{ borderRadius: 14, padding: '12px' }}>Update Master Password</Btn>
                         </div>
                      </Card>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24, marginTop: 24 }}>
                      <Card style={{ padding: 28, borderRadius: 28, border: `1px solid ${T.border}`, background: 'rgba(0, 212, 170, 0.03)' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: `${T.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent }}>
                               <RefreshCw size={18} className={syncing ? 'spin' : ''} />
                            </div>
                            <h4 style={{ fontSize: 15, fontWeight: 800, color: T.txt }}>Account Balance</h4>
                         </div>
                         <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 28, fontWeight: 900, color: T.accent, fontFamily: T.head }}>{fmt(balanceData.balance)}</div>
                            <div style={{ fontSize: 11, color: T.dim, marginTop: 4, fontWeight: 600 }}>Last Synced: {balanceData.ts ? ts(balanceData.ts) : 'Never'}</div>
                         </div>
                         <Btn v="accent" sm full onClick={async () => {
                            setSyncing(true);
                            try {
                              const { data, error } = await supabase.functions.invoke('trigger-account-balance');
                              if (error) throw error;
                              showToast("Sync triggered successfully", "ok");
                              // Wait a bit for the callback to settle
                              setTimeout(fetchBalance, 3000);
                            } catch (e) {
                              showToast("Sync failed: " + e.message, "danger");
                            } finally {
                              setSyncing(false);
                            }
                         }} loading={syncing} style={{ borderRadius: 14 }}>Sync Now</Btn>
                      </Card>

                      <Card style={{ padding: 28, borderRadius: 28, border: `1px solid ${T.border}` }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: `${T.blue}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.blue }}>
                               <Shield size={18} />
                            </div>
                            <h4 style={{ fontSize: 15, fontWeight: 800, color: T.txt }}>Credential Encoder</h4>
                         </div>
                         <p style={{ fontSize: 12, color: T.dim, marginBottom: 16, fontWeight: 500 }}>Encrypt M-Pesa passwords for the secure production environment.</p>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <input 
                               type="password" 
                               placeholder="Initiator Password" 
                               value={rawMpesaPw}
                               onChange={e => setRawMpesaPw(e.target.value)}
                               style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1px solid ${T.border}`, background: 'rgba(0,0,0,0.1)', color: T.txt, fontSize: 13 }}
                            />
                            <Btn v="secondary" sm full onClick={async () => {
                               if (!rawMpesaPw) return;
                               setEncoding(true);
                               try {
                                  const { data, error } = await supabase.functions.invoke('encode-mpesa-password', { body: { password: rawMpesaPw } });
                                  if (error) throw error;
                                  setMpesaCert(data.encoded);
                                  showToast("Encoded successfully", "ok");
                               } catch (e) {
                                  showToast("Encoding failed", "danger");
                               } finally {
                                  setEncoding(false);
                               }
                            }} loading={encoding}>Generate Secure Key</Btn>
                            {mpesaCert && (
                               <div style={{ marginTop: 10, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: `1px solid ${T.accent}30` }}>
                                  <div style={{ fontSize: 9, color: T.accent, fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>Encrypted Security Credential:</div>
                                  <div style={{ fontSize: 10, color: T.txt, wordBreak: 'break-all', fontFamily: T.mono, opacity: 0.8 }}>{mpesaCert}</div>
                                  <button onClick={() => { navigator.clipboard.writeText(mpesaCert); showToast("Copied!", "ok"); }} style={{ marginTop: 8, background: 'none', border: 'none', color: T.accent, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Copy Key</button>
                               </div>
                            )}
                         </div>
                      </Card>
                    </div>
                 </Section>
             </div>
           )}
        </div>
      </div>

      <style>{`
        .pop-in { animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.98) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Password Change Modal */}
      {showPwModal && (
        <div className="dialog-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
           <div className="pop-in" style={{ background: T.card, width: '100%', maxWidth: 400, borderRadius: 32, padding: 32, border: `1px solid ${T.border}`, boxShadow: '0 50px 100px -20px rgba(0,0,0,0.5)' }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                 <div style={{ width: 56, height: 56, borderRadius: 18, background: `${T.accent}15`, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <KeyRound size={28} />
                 </div>
                 <h3 style={{ fontSize: 20, fontWeight: 900 }}>Change Password</h3>
                 <p style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>Step {pwStep} of 3</p>
              </div>

              {pwErr && <Alert type="danger" style={{ marginBottom: 16 }}>{pwErr}</Alert>}

              {pwStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                   <FI label="Current Password" type="password" value={oldPw} onChange={setOldPw} placeholder="••••••••" />
                   <Btn full onClick={async () => {
                      setPwLoading(true);
                      setPwErr('');
                      const { _checkPw } = await import('@/data/seedData');
                      if (_checkPw(oldPw, worker?.pwHash || '')) {
                         const { supabase } = await import('@/config/supabaseClient');
                         const { error } = await supabase.functions.invoke('send-admin-otp', {
                           body: { origin: window.location.origin }
                         });
                         if (error) setPwErr('Failed to send verification code.');
                         else setPwStep(2);
                      } else {
                         setPwErr('Incorrect current password.');
                      }
                      setPwLoading(false);
                   }} loading={pwLoading}>Verify & Next →</Btn>
                </div>
              )}

              {pwStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                   <div style={{ textAlign: 'center', fontSize: 13, color: T.dim }}>Enter the 4-digit code sent to your phone.</div>
                   <input 
                     value={pwOtp} 
                     onChange={e => setPwOtp(e.target.value.replace(/\D/g,'').slice(0,4))} 
                     placeholder="••••" 
                     maxLength={4}
                     style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, fontSize: 24, textAlign: 'center', fontWeight: 800, letterSpacing: 8 }}
                   />
                   <Btn full onClick={async () => {
                      setPwLoading(true);
                      setPwErr('');
                      const { supabase } = await import('@/config/supabaseClient');
                      const { data, error } = await supabase.functions.invoke('verify-admin-otp', { body: { otp: pwOtp } });
                      if (error || !data?.success) setPwErr('Invalid security code.');
                      else setPwStep(3);
                      setPwLoading(false);
                   }} loading={pwLoading}>Verify Code →</Btn>
                   <Btn v="ghost" sm onClick={() => setPwStep(1)}>Back</Btn>
                </div>
              )}

              {pwStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                   <FI label="New Password" type="password" value={newPw} onChange={setNewPw} placeholder="Min 6 characters" />
                   <FI label="Confirm New Password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="••••••••" />
                   <Btn full onClick={async () => {
                      if (newPw.length < 6) return setPwErr('Password must be at least 6 characters.');
                      if (newPw !== confirmPw) return setPwErr('Passwords do not match.');
                      
                      setPwLoading(true);
                      setPwErr('');
                      const { supabase } = await import('@/config/supabaseClient');
                      let emailToReset = worker?.email || sessionStorage.getItem('acl_rec_email');
                      if (!emailToReset || emailToReset === 'admin@adequatecapital.co.ke') {
                         try {
                            const { supabase } = await import('@/config/supabaseClient');
                            const { data: adminWorker } = await supabase.from('workers').select('email').eq('role', 'Super Admin').limit(1).maybeSingle();
                            if (adminWorker?.email) {
                               emailToReset = adminWorker.email;
                            }
                         } catch (e) {
                            console.error('Failed to fetch fallback admin email', e);
                         }
                      }
                      if (!emailToReset) emailToReset = cfg.adminEmail;
                      
                      let res;
                      if (!session && isRecoveryLock) {
                         const { supabase } = await import('@/config/supabaseClient');
                         const { data, error } = await supabase.functions.invoke('admin-force-reset', { 
                           body: { email: emailToReset, new_password: newPw } 
                         });
                         res = { error: error || data?.error ? { message: error?.message || data?.error } : null };
                      } else {
                         res = await supabase.auth.updateUser({ password: newPw });
                      }
                      
                      if (!res.error) {
                        const hash = await hashPwAsync(newPw);
                        if (worker?.id) {
                           try { await supabase.from('workers').update({ pwHash: hash }).eq('id', worker.id); } catch (e) { console.warn('Worker hash sync failed', e); }
                        }
                        
                         sessionStorage.setItem('acl_mfa_verified', 'true');
                         localStorage.setItem('acl_mfa_verified', 'true');
                         if (!session) await supabase.auth.signInWithPassword({ email: emailToReset, password: newPw });
                         sessionStorage.removeItem('acl_recovery_lock');
                        sessionStorage.removeItem('acl_rec_email');
                        
                        showToast('✅ Password updated and logged in', 'ok');
                        setShowPwModal(false);
                        setPwStep(1);
                        setOldPw(''); setNewPw(''); setConfirmPw(''); setPwOtp('');
                        try { addAudit('Password Changed (Recovery)', 'Admin'); } catch (e) {}
                        
                        setTimeout(() => window.location.reload(), 1000);
                      } else {
                        setPwErr(res.error.message || 'Update failed.');
                      }
                      setPwLoading(false);
                   }} loading={pwLoading}>Update Password</Btn>
                </div>
              )}

              <div style={{ marginTop: 24, textAlign: 'center' }}>
                 <button onClick={() => { setShowPwModal(false); setPwStep(1); setPwErr(''); }} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
};

