import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { KeyRound, Lock, Ban, CheckCircle, Hourglass, Smartphone, ShieldAlert, Check, AlertTriangle, EyeOff, Eye, ShieldCheck } from 'lucide-react';
import { T, SC, RC, SFX, Card, CH, KPI, DT, Btn, Badge, Av, Bar, BackBtn, RefreshBtn,
  FI, PhoneInput, NumericInput, Search, Pills, Alert, Dialog, ConfirmDialog, ToastContainer,
  LoanModal, LoanForm, RepayTracker, ModuleHeader,
  fmt, fmtM, now, uid, ts, escHtml, toCSV, dlCSV, buildFullBackup,
  calculateLoanStatus,
  sbWrite, sbInsert,
  toSupabaseLoan, toSupabaseCustomer, toSupabasePayment, toSupabaseInteraction,
  generateLoanAgreementHTML, generateAssetListHTML, downloadLoanDoc,
  useContactPopup, useToast, useReminders, useModalLock,
  getSecConfig, saveSecConfig, checkPwAsync, hashPwAsync, DEFAULT_ADMIN_PW } from '@/lms-common';
import { _checkPw } from '@/data/seedData';
import { supabase } from '@/config/supabaseClient';


const SecuritySettingsTab = ({ adminUser, setAdminUser, auditLog, addAudit, showToast }) => {
  const [cfg, setCfgState] = useState(getSecConfig);
  const [verifyPw, setVerifyPw] = useState("");
  const [verified, setVerified] = useState(true);
  const [verifyErr, setVerifyErr] = useState("");
  const [showChangePw, setShowChangePw] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [curPwErr, setCurPwErr] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showNewPw2, setShowNewPw2] = useState(false);
  const [otpPhone, setOtpPhone] = useState(cfg.adminPhone || "");
  const [rawMpesaPw, setRawMpesaPw] = useState("");
  const [mpesaCert, setMpesaCert] = useState("");
  const [encoding, setEncoding] = useState(false);
  const [balanceData, setBalanceData] = useState({ balance: 0, ts: null });
  const [syncing, setSyncing] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('paybill_balance').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) setBalanceData({ balance: data.balance, ts: data.created_at });
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const saveCfg = (patch) => {
    const next = { ...cfg, ...patch };
    setCfgState(next);
    saveSecConfig(next);
  };

  const doVerify = async () => {
    if (!verifyPw) { setVerifyErr("Required"); return; }
    const latestCfg = getSecConfig();
    const stored = latestCfg.adminPwHash;
    let ok = false;
    try {
      if (!stored) ok = verifyPw === DEFAULT_ADMIN_PW;
      else {
        ok = await checkPwAsync(verifyPw, stored);
        if (!ok) ok = _checkPw(verifyPw, stored);
      }
    } catch (e) {
      ok = !stored ? verifyPw === DEFAULT_ADMIN_PW : _checkPw(verifyPw, stored);
    }
    if (ok) {
      setVerified(true);
      setVerifyPw("");
      setVerifyErr("");
      SFX.login();
    } else {
      setVerifyErr("Incorrect password");
      SFX.error();
    }
  };

  const doChangePw = async () => {
    const latestCfg = getSecConfig();
    const stored = latestCfg.adminPwHash;
    let curOk = false;
    try {
      curOk = !stored ? curPw === DEFAULT_ADMIN_PW : (await checkPwAsync(curPw, stored) || _checkPw(curPw, stored));
    } catch (e) {
      curOk = !stored ? curPw === DEFAULT_ADMIN_PW : _checkPw(curPw, stored);
    }
    if (!curOk) { setCurPwErr("Incorrect current password."); SFX.error(); return; }
    if (newPw.length < 6) { setPwErr("Min 6 characters."); return; }
    if (newPw !== newPw2) { setPwErr("No match."); return; }
    const hash = await hashPwAsync(newPw);
    saveCfg({ adminPwHash: hash });
    showToast("✅ Password updated", "ok");
    setShowChangePw(false); setCurPw(""); setNewPw(""); setNewPw2("");
  };

  const toggleFeature = (key) => {
    saveCfg({ [key]: !cfg[key] });
    showToast(`${key.replace("Enabled", "")} ${!cfg[key] ? "enabled" : "disabled"}`, "info");
  };

  const encodeCredential = async () => {
    if (!rawMpesaPw || !mpesaCert) {
      showToast("Password and Certificate are required", "warn");
      return;
    }
    setEncoding(true);
    try {
      // 1. Clean the cert (remove headers/footers/newlines)
      const cleanCert = mpesaCert
        .replace(/-----BEGIN CERTIFICATE-----/g, "")
        .replace(/-----END CERTIFICATE-----/g, "")
        .replace(/\s/g, "");

      // 2. Convert base64 cert to array buffer
      const binaryCert = Uint8Array.from(atob(cleanCert), c => c.charCodeAt(0));

      // 3. Import the public key
      const publicKey = await window.crypto.subtle.importKey(
        "spki",
        binaryCert,
        { name: "RSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["encrypt"]
      );

      // 4. Encrypt the password
      const encrypted = await window.crypto.subtle.encrypt(
        { name: "RSA-PKCS1-v1_5" },
        publicKey,
        new TextEncoder().encode(rawMpesaPw)
      );

      // 5. Convert to base64
      const base64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      
      // 6. Copy to clipboard
      await navigator.clipboard.writeText(base64);
      showToast("✅ Encrypted credential copied!", "ok");
      setRawMpesaPw("");
    } catch (e) {
      console.error(e);
      showToast("Encryption failed. Check certificate format.", "danger");
    } finally {
      setEncoding(false);
    }
  };

  return (
    <div className="fu">
      <ModuleHeader 
        title={<><Lock size={22} style={{verticalAlign:'middle', marginRight:10, marginTop:-4}}/> Security & Access</>}
        sub="Protect your account with multi-factor authentication and session controls."
      />

      {!verified && (
        <Card style={{ marginBottom: 24, padding: 24, border: `2px solid ${T.warn}40`, background: `${T.warn}05` }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: `${T.warn}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.warn }}>
                    <ShieldAlert size={24} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ color: T.txt, fontWeight: 800, fontSize: 16 }}>Authentication Required</div>
                    <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>Sensitive settings are locked. Please verify your password.</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                   <input
                        type="password"
                        value={verifyPw}
                        onChange={e => setVerifyPw(e.target.value)}
                        placeholder="Admin Password"
                        style={{ background: T.surface, border: `1px solid ${verifyErr ? T.danger : T.border}`, borderRadius: 10, padding: '10px 14px', color: T.txt, fontSize: 14, outline: 'none' }}
                    />
                    <Btn onClick={doVerify} v="primary">Unlock</Btn>
                </div>
            </div>
            {verifyErr && <div style={{ color: T.danger, fontSize: 11, fontWeight: 700, marginTop: 8, paddingLeft: 64 }}>⚠ {verifyErr}</div>}
        </Card>
      )}

      <div style={{ opacity: verified ? 1 : 0.5, pointerEvents: verified ? 'auto' : 'none' }}>
        
        <Card style={{ marginBottom: 24 }}>
          <CH title="Admin Identity" sub="Manage how you appear in the system and audit logs" />
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
            <FI 
              label="Display Name" 
              value={adminUser.name} 
              onChange={v => setAdminUser(u => ({ ...u, name: v, ini: v.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase() }))} 
              placeholder="e.g. Don Administrator"
              hint="This name appears in greetings and audit trails."
            />
            <FI 
              label="System Role / Organization" 
              value={adminUser.role} 
              onChange={v => setAdminUser(u => ({ ...u, role: v }))} 
              placeholder="e.g. Super Admin"
              hint="Displayed in your sidebar profile."
            />
          </div>
          <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end' }}>
             <Btn v="accent" onClick={() => { addAudit('Profile Update', 'Admin', `Changed name to ${adminUser.name}`); showToast('✅ Profile updated', 'ok'); }}>Save Identity</Btn>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20, marginBottom: 24 }}>
          
          <Card>
            <CH title="Authentication Methods" sub="Standard login providers" />
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { key: 'passwordEnabled', icon: <KeyRound />, label: 'Standard Password', desc: 'Secure login via alphanumeric password.', can: false },
                { key: 'otpEnabled', icon: <Smartphone />, label: '2-Step Verification', desc: 'Require a unique code sent to your device.', can: true }
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 14, background: T.surface, border: `1px solid ${T.border}` }}>
                  <div style={{ padding: 10, borderRadius: 10, background: cfg[f.key] ? `${T.ok}15` : T.card2, color: cfg[f.key] ? T.ok : T.muted }}>
                    {React.cloneElement(f.icon, { size: 20 })}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.txt, fontWeight: 750, fontSize: 14 }}>{f.label}</div>
                    <div style={{ color: T.dim, fontSize: 12 }}>{f.desc}</div>
                  </div>
                  <button 
                    onClick={() => toggleFeature(f.key)}
                    style={{ background: cfg[f.key] ? T.aLo : T.card2, border: 'none', width: 44, height: 24, borderRadius: 20, cursor: 'pointer', position: 'relative', transition: 'all .3s' }}
                  >
                    <div style={{ position: 'absolute', top: 3, left: cfg[f.key] ? 22 : 3, width: 18, height: 18, background: cfg[f.key] ? T.accent : T.muted, borderRadius: '50%', transition: 'all .3s' }} />
                  </button>
                </div>
              ))}
            </div>
          </Card>



        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
            
            <Card>
                <CH title="Recovery Contacts" sub="Secondary access fallbacks" />
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <FI label="Admin Email" type="email" value={cfg.adminEmail || ""} onChange={v => saveCfg({ adminEmail: v })} />
                    <PhoneInput label="Recovery SMS" value={cfg.adminRecoveryPhone || ""} onChange={v => saveCfg({ adminRecoveryPhone: v })} />
                </div>
            </Card>

            <Card style={{ border: `1px solid ${cfg.mpesaInitiator ? T.border : `${T.warn}40`}`, background: cfg.mpesaInitiator ? 'transparent' : `${T.warn}05` }}>
                <CH title="M-Pesa API Guard" sub="Prevent initiator lockouts by validating credentials" />
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
                       <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.mpesaInitiator ? T.ok : T.warn }} />
                       <div style={{ fontSize: 13, fontWeight: 700, color: cfg.mpesaInitiator ? T.txt : T.warn }}>
                          {cfg.mpesaInitiator ? "Connectivity Configured" : "Configuration Required"}
                       </div>
                    </div>
                    
                      <div style={{ background: T.surface, padding: 14, borderRadius: 12, border: `1px solid ${T.border}` }}>
                         <div style={{ fontSize: 11, color: T.muted, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Account Balance</span>
                            <Badge color={T.ok}>Live</Badge>
                         </div>
                         <div style={{ fontSize: 24, fontWeight: 900, color: T.txt, margin: '4px 0' }}>
                            {fmt(balanceData.balance)}
                         </div>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                            <div style={{ fontSize: 10, color: T.dim }}>
                               Last Sync: {balanceData.ts ? ts(balanceData.ts) : 'Never'}
                            </div>
                            <Btn v="ghost" sm onClick={async () => {
                               setSyncing(true);
                               try {
                                 const { error } = await supabase.functions.invoke('trigger-account-balance');
                                 if (error) throw error;
                                 showToast('Sync request sent', 'info');
                               } catch (e) {
                                 showToast('Sync failed', 'danger');
                               } finally {
                                 setSyncing(false);
                               }
                            }} loading={syncing} style={{ padding: '4px 8px' }}>
                               Sync Now
                            </Btn>
                         </div>
                      </div>

                      <FI 
                        label="Daraja Initiator Name" 
                      value={cfg.mpesaInitiator || ""} 
                      onChange={v => {
                        const clean = v.trim();
                        if (v !== clean) showToast('⚠ Spaces removed automatically', 'warn');
                        saveCfg({ mpesaInitiator: clean });
                      }} 
                      placeholder="e.g. ADEQUATE_ADMIN"
                      hint="Must match Safaricom portal exactly (No spaces)."
                    />

                    <div style={{ background: T.surface, padding: 14, borderRadius: 12, border: `1px solid ${T.border}` }}>
                       <div style={{ fontSize: 11, color: T.muted, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>Security Credential</div>
                       <Btn v="secondary" full sm onClick={() => showToast('Update Daraja Password via Supabase Secrets', 'info')}>
                          Rotate API Password
                       </Btn>
                       <div style={{ fontSize: 10, color: T.dim, marginTop: 8, textAlign: 'center' }}>
                          Last update: {cfg.darajaLastUpdate || 'Unknown'}
                       </div>
                    </div>

                    <div style={{ background: T.surface, padding: 14, borderRadius: 12, border: `1px solid ${T.border}`, marginTop: 8 }}>
                        <div style={{ fontSize: 11, color: T.muted, fontWeight: 800, marginBottom: 12, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                           <ShieldCheck size={14} /> Credential Encoder
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                           <input 
                              type="password" 
                              placeholder="Initiator Password" 
                              value={rawMpesaPw} 
                              onChange={e => setRawMpesaPw(e.target.value)}
                              style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: T.txt }}
                           />
                           <textarea 
                              placeholder="Paste Public Certificate (.cer) content here..." 
                              value={mpesaCert} 
                              onChange={e => setMpesaCert(e.target.value)}
                              style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.txt, minHeight: 80, fontFamily: T.mono }}
                           />
                           <Btn v="primary" sm full onClick={encodeCredential} loading={encoding}>
                              Encrypt & Copy to Clipboard
                           </Btn>
                        </div>
                        <div style={{ fontSize: 10, color: T.dim, marginTop: 10, lineHeight: 1.4 }}>
                           <b>Instructions:</b> Enter your portal password and paste the <code>.cer</code> file text. The result is what you set as <code>MPESA_SECURITY_CREDENTIAL</code>.
                        </div>
                    </div>

                    {!cfg.mpesaInitiator && (
                       <Alert type="warn">
                          <b>Warning:</b> Missing initiator name will cause Safaricom to block your account.
                       </Alert>
                    )}
                </div>
            </Card>

            <Card>
                <CH title="Password Management" sub="Rotate your access credentials" />
                <div style={{ padding: 20 }}>
                    {!showChangePw ? (
                        <div style={{ textAlign: 'center', padding: '10px 0' }}>
                           <Btn v="secondary" full onClick={() => setShowChangePw(true)}>Change Admin Password</Btn>
                           <div style={{ color: T.dim, fontSize: 11, marginTop: 12 }}>Last rotated: {now()}</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input type="password" placeholder="Current Password" value={curPw} onChange={e => setCurPw(e.target.value)} style={{ background: T.surface, border: `1px solid ${curPwErr ? T.danger : T.border}`, borderRadius: 10, padding: '10px 14px', color: T.txt }} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <input type="password" placeholder="New Password" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.txt }} />
                                <input type="password" placeholder="Confirm" value={newPw2} onChange={e => setNewPw2(e.target.value)} style={{ background: T.surface, border: `1px solid ${newPw !== newPw2 ? T.danger : T.border}`, borderRadius: 10, padding: '10px 14px', color: T.txt }} />
                            </div>
                            {pwErr && <div style={{ color: T.danger, fontSize: 11 }}>{pwErr}</div>}
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                <Btn v="primary" full onClick={doChangePw}>Save</Btn>
                                <Btn v="ghost" onClick={() => setShowChangePw(false)}>Cancel</Btn>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

        </div>
      </div>
    </div>
  );
};

export default SecuritySettingsTab;

