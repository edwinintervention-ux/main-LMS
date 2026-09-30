import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/config/supabaseClient';
import {  calculateLoanStatus, fmt , normProduct, getProductBaseRate, getProductDays } from '@/lms-common';
import { Smartphone, Lock, LogOut, CheckCircle2, ArrowRight, Shield, CreditCard, Home, FileText, Activity, User, Copy, Check, Loader2 } from 'lucide-react';
import PortalChatbot from './PortalChatbot';

/* ── Portal CSS ── */
const PortalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    .cp-root {
      --accent: #00E599;
      --accent-glow: rgba(0, 229, 153, 0.35);
      --accent-dim: rgba(0, 229, 153, 0.12);
      --accent2: #8B5CF6;
      --bg: #050811;
      --card-bg: rgba(13, 19, 33, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --glass: rgba(255, 255, 255, 0.035);
      --glass-border: rgba(255, 255, 255, 0.07);
      --text: #F8FAFC;
      --dim: #64748B;
      --dim2: #94A3B8;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      overflow-x: hidden;
      padding: 16px;
    }

    /* Ambient Background Mesh */
    .cp-ambient {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .cp-orb-1 {
      position: absolute;
      top: -15%;
      left: 20%;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0, 229, 153, 0.15) 0%, rgba(0, 229, 153, 0.02) 50%, transparent 70%);
      filter: blur(60px);
      animation: cp-pulse-slow 8s ease-in-out infinite alternate;
    }
    .cp-orb-2 {
      position: absolute;
      bottom: -10%;
      right: 15%;
      width: 550px;
      height: 550px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.18) 0%, rgba(139, 92, 246, 0.03) 50%, transparent 70%);
      filter: blur(70px);
      animation: cp-pulse-slow 10s ease-in-out infinite alternate-reverse;
    }
    .cp-grid-overlay {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 40px 40px;
      opacity: 0.6;
    }

    @keyframes cp-pulse-slow {
      0% { transform: scale(0.9) translateY(0); opacity: 0.8; }
      100% { transform: scale(1.1) translateY(30px); opacity: 1; }
    }

    /* Outer phone / portal wrapper */
    .cp-wrapper {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* Container Card */
    .cp-container {
      width: 100%;
      background: var(--card-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--card-border);
      border-radius: 32px;
      box-shadow: 
        0 24px 64px -12px rgba(0, 0, 0, 0.7),
        0 0 0 1px rgba(255, 255, 255, 0.04),
        0 0 40px -10px var(--accent-glow);
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    @media (max-width: 480px) {
      .cp-root {
        padding: 0 !important;
        align-items: stretch !important;
      }
      .cp-wrapper {
        max-width: 100% !important;
        width: 100% !important;
        height: 100vh !important;
      }
      .cp-container {
        border-radius: 0 !important;
        border: none !important;
        height: 100vh !important;
        max-height: 100vh !important;
      }
    }

    /* Header Bar */
    .cp-brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--dim2);
      margin: 0 auto;
    }

    /* Logo Icon */
    .cp-logo-icon {
      width: 64px;
      height: 64px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(0, 229, 153, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
      border: 1px solid rgba(0, 229, 153, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 0 30px rgba(0, 229, 153, 0.25);
      position: relative;
    }
    .cp-logo-icon::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 24px;
      border: 1px dashed rgba(0, 229, 153, 0.3);
      animation: cp-spin 20s linear infinite;
    }

    /* Input Field Group */
    .cp-input-group {
      display: flex;
      align-items: center;
      background: rgba(10, 15, 26, 0.8);
      border: 1.5px solid rgba(255, 255, 255, 0.09);
      border-radius: 16px;
      overflow: hidden;
      transition: all 0.25s ease;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    }
    .cp-input-group:focus-within {
      border-color: var(--accent);
      box-shadow: 
        0 0 0 4px var(--accent-dim),
        0 0 20px -2px var(--accent-glow);
    }
    .cp-country-prefix {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 18px;
      color: var(--dim2);
      font-size: 14px;
      font-weight: 700;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
      height: 54px;
      flex-shrink: 0;
      white-space: nowrap;
      user-select: none;
    }
    .cp-input {
      flex: 1;
      min-width: 0;
      width: 100%;
      background: transparent;
      border: none;
      color: #fff;
      font-size: 17px;
      font-weight: 600;
      padding: 0 16px;
      height: 54px;
      outline: none;
      font-family: inherit;
      letter-spacing: 0.5px;
      box-sizing: border-box;
    }
    .cp-input::placeholder {
      color: rgba(148, 163, 184, 0.4);
      font-weight: 400;
    }

    /* Primary Action Button */
    .cp-btn {
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, #00E599 0%, #00B87A 100%);
      color: #04100B;
      border: none;
      height: 54px;
      border-radius: 16px;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3px;
      cursor: pointer;
      font-family: inherit;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 8px 24px -4px rgba(0, 229, 153, 0.4);
    }
    .cp-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px -4px rgba(0, 229, 153, 0.55);
      filter: brightness(1.05);
    }
    .cp-btn:active:not(:disabled) {
      transform: translateY(0);
      filter: brightness(0.95);
    }
    .cp-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    .cp-btn-outline {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--dim2);
      padding: 12px 18px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .cp-btn-outline:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.15);
    }

    /* Trust items row */
    .cp-trust-row {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .cp-trust-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--dim);
      font-weight: 600;
    }

    /* Balance card - premium neon gradient */
    .cp-balance-card {
      background: linear-gradient(145deg, #0A1C2E 0%, #081422 60%, #0D263B 100%);
      border: 1px solid rgba(0, 229, 153, 0.3);
      border-radius: 24px;
      padding: 24px;
      position: relative;
      overflow: hidden;
      margin-bottom: 20px;
      box-shadow:
        0 12px 32px rgba(0, 0, 0, 0.5),
        0 0 30px rgba(0, 229, 153, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }
    .cp-balance-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
    }

    .cp-inner-card {
      background: var(--glass);
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 16px;
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    }

    /* Bottom navigation */
    .cp-bottom-nav {
      position: sticky;
      bottom: 0; left: 0; right: 0;
      background: rgba(13, 19, 33, 0.94);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid var(--glass-border);
      display: flex;
      justify-content: space-around;
      padding: 12px 0 16px;
      z-index: 10;
    }
    .cp-nav-item {
      background: none;
      border: none;
      color: var(--dim);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      padding: 6px 20px;
      border-radius: 14px;
      transition: all 0.2s;
    }
    .cp-nav-item.active { 
      color: var(--accent);
      background: var(--accent-dim);
    }

    /* Spinner */
    .cp-spinner {
      width: 20px; height: 20px;
      border: 2.5px solid rgba(0, 0, 0, 0.2);
      border-top-color: #04100B;
      border-radius: 50%;
      animation: cp-spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes cp-spin { to { transform: rotate(360deg); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }

    /* Fade in animation */
    .cp-fade-in {
      animation: cp-fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes cp-fadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* OTP Box Array */
    .cp-otp-input {
      width: 100%;
      background: rgba(10, 15, 26, 0.8);
      border: 1.5px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 20px;
      text-align: center;
      padding: 14px 10px;
      border-radius: 18px;
      outline: none;
      font-family: 'JetBrains Mono', monospace;
      transition: all 0.25s;
    }
    .cp-otp-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-dim), 0 0 24px var(--accent-glow);
    }
  `}</style>
);

export default function CustomerPortal() {
  const [step, setStep] = useState('login');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState(null);

  // Payment flow states
  const [payStep, setPayStep] = useState(null); // null | 'choose' | 'partial' | 'processing' | 'sent' | 'failed'
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState('');
  const [copiedField, setCopiedField] = useState(null); // 'paybill' | 'account' | null
  const [checkoutId, setCheckoutId] = useState(null); // tracks current STK push checkout_request_id
  const [stkStatus, setStkStatus] = useState(null); // null | 'polling' | 'completed' | 'failed' | 'timeout'
  const pollRef = useRef(null); // interval ID for STK status polling

  const handleCopy = (text, field) => {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(text));
      } else {
        const ta = document.createElement('textarea');
        ta.value = String(text);
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField(prev => prev === field ? null : prev);
      }, 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutes

  // On mount, check if there's a valid session in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cp_session');
    if (saved) {
      try {
        const { data, timestamp } = JSON.parse(saved);
        if (Date.now() - timestamp < INACTIVITY_LIMIT) {
          setDashboardData(data);
          setPhone(data.customer.phone);
          setStep('dashboard');
          // Background refresh: fetch fresh data from DB so stale cache is replaced
          if (supabase && data.customer?.phone) {
            supabase.rpc('get_portal_dashboard', { p_phone: data.customer.phone })
              .then(({ data: freshData, error }) => {
                if (!error && freshData) {
                  setDashboardData(freshData);
                  try { localStorage.setItem('cp_session', JSON.stringify({ data: freshData, timestamp: Date.now() })); } catch (_) {}
                }
              });
          }
        } else {
          localStorage.removeItem('cp_session');
        }
      } catch (e) {
        localStorage.removeItem('cp_session');
      }
    }
  }, []);

  // Set up inactivity listener
  useEffect(() => {
    if (step !== 'dashboard') return;

    let timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      
      // Update timestamp in localStorage
      const saved = localStorage.getItem('cp_session');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          parsed.timestamp = Date.now();
          localStorage.setItem('cp_session', JSON.stringify(parsed));
        } catch (e) {}
      }

      timeout = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_LIMIT);
    };

    resetTimer(); // Start timer

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));

    return () => {
      clearTimeout(timeout);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [step]);

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    if (!phone || phone.length < 9) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('customer-portal', {
        body: { action: 'request_otp', phone }
      });
      if (fnError || (data && data.error)) {
        throw new Error(fnError?.message || data?.error || 'Failed to send OTP');
      }
      setStep('verify');
    } catch (err) {
      setError(err.message === 'Customer not found'
        ? 'This phone number is not registered with Adequate Capital.'
        : 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('fetch_customer_dashboard', {
        p_phone: phone, p_code: code
      });
      if (rpcError) throw new Error(rpcError.message);
      setDashboardData(data);
      try {
        localStorage.setItem('cp_session', JSON.stringify({ data, timestamp: Date.now() }));
      } catch (e) {}
      setStep('dashboard');
    } catch (err) {
      setError('Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setDashboardData(null);
    setCode('');
    setPhone('');
    setStep('login');
    setPayStep(null);
    setPayAmount('');
    setPayError('');
    localStorage.removeItem('cp_session');
  };

  // Refresh dashboard data after payment without re-auth (session already established)
  const refreshDashboard = async () => {
    try {
      const targetPhone = phone || dashboardData?.customer?.phone;
      if (!targetPhone) return;
      const { data, error } = await supabase.rpc('get_portal_dashboard', { p_phone: targetPhone });
      if (error || !data) return;
      setDashboardData(data);
      try {
        localStorage.setItem('cp_session', JSON.stringify({ data, timestamp: Date.now() }));
      } catch (_) {}
    } catch (_) {
      // Silent fail — stale data is better than a crash
    }
  };

  // Trigger M-Pesa STK Push
  const handleStkPush = async (amount) => {
    setPayStep('processing');
    setPayError('');
    setStkStatus(null);
    setCheckoutId(null);
    // Clear any existing poll
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('mpesa-stk-push', {
        body: {
          phone_number: phone,
          amount: Math.round(amount),
          customer_id: dashboardData?.customer?.id,
          description: 'Loan Repayment'
        }
      });
      if (fnErr || (data && data.error)) {
        throw new Error(fnErr?.message || data?.error || 'Payment request failed');
      }
      const cid = data?.checkout_id;
      setCheckoutId(cid);
      setPayStep('sent');
      setStkStatus('polling');

      // Start polling stk_requests status via RPC
      if (cid && supabase) {
        let elapsed = 0;
        const POLL_INTERVAL = 3000; // 3 seconds
        const MAX_WAIT = 90000; // 90 seconds
        pollRef.current = setInterval(async () => {
          elapsed += POLL_INTERVAL;
          try {
            const { data: stkData } = await supabase.rpc('check_stk_status', { p_checkout_id: cid });
            if (stkData?.status === 'Completed') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setStkStatus('completed');
              await refreshDashboard();
              setTimeout(() => { refreshDashboard(); }, 1000);
            } else if (stkData?.status === 'Failed') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setStkStatus('failed');
              setPayError(stkData?.result_desc || 'M-Pesa payment was not completed. Please try again.');
            }
          } catch (_) { /* network glitch — keep polling */ }
          if (elapsed >= MAX_WAIT && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setStkStatus('timeout');
          }
        }, POLL_INTERVAL);
      }
    } catch (err) {
      setPayError(err.message || 'Failed to initiate payment. Please try again.');
      setPayStep('failed');
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  /* ── Dashboard View ── */
  if (step === 'dashboard' && dashboardData) {
    const { customer, loans, payments } = dashboardData;
    let totalOwed = 0;
    let nextDueDate = null;

    for (const loan of loans) {
      const paid = payments.filter(p => p.loan_id === loan.id).reduce((s, p) => s + p.amount, 0);
      const engine = calculateLoanStatus(loan, null, paid);
      if (engine.totalAmountDue > 0) {
        totalOwed += engine.totalAmountDue;
        if (loan.disbursed) {
          const dDate = new Date(loan.disbursed);
          dDate.setDate(dDate.getDate() + getProductDays(l.product));
          if (!nextDueDate || dDate < nextDueDate) nextDueDate = dDate;
        }
      }
    }

    // Calculate days left and progress
    let daysLeft = null;
    let isOverdue = false;
    let progressPercent = 0;
    
    if (nextDueDate) {
      const diffMs = nextDueDate.getTime() - Date.now();
      daysLeft = Math.ceil(diffMs / 86400000);
      isOverdue = daysLeft < 0;
      
      // Calculate progress (assuming a standard 30-day loan period)
      // If 30 days left, progress is 0%. If 0 days left, progress is 100%.
      if (isOverdue) {
        progressPercent = 100;
      } else {
        progressPercent = Math.max(0, Math.min(100, ((getProductDays(l.product) - daysLeft) / getProductDays(l.product)) * 100));
      }
    }

    const firstName = customer.name ? customer.name.split(' ')[0] : 'Customer';
    const accountNo = customer.id_no || customer.id;

    return (
      <div className="cp-root">
        <PortalStyles />

        {/* Ambient background mesh */}
        <div className="cp-ambient">
          <div className="cp-orb-1" />
          <div className="cp-orb-2" />
          <div className="cp-grid-overlay" />
        </div>

        <div className="cp-wrapper" style={{ maxHeight: '100vh' }}>
        <div className="cp-container" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
          {/* Brand header */}
          <div style={{ padding: '20px 24px 8px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <div className="cp-brand-badge">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E599', boxShadow: '0 0 8px #00E599' }} />
              ADEQUATE CAPITAL LTD
            </div>
          </div>

          <div className="cp-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 100px', zIndex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>
              Hello, {firstName}
            </div>

            <div className="cp-balance-card">
              <div style={{ fontSize: 13, color: 'var(--dim2)', marginBottom: 6, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={16} color="var(--accent)" />
                Current Balance
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, marginBottom: 24, letterSpacing: '-0.03em', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                {fmt(totalOwed)}
              </div>
              
              {nextDueDate && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 16px' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--dim2)', marginBottom: 4, fontWeight: 500 }}>Due Date</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {nextDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: isOverdue ? '#ef4444' : 'var(--dim2)', marginBottom: 4, fontWeight: 500 }}>
                        {isOverdue ? 'Status' : 'Days Left'}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: isOverdue ? '#ef4444' : 'var(--accent)', textShadow: isOverdue ? '0 0 10px rgba(239, 68, 68, 0.3)' : '0 0 10px rgba(0,212,170,0.3)' }}>
                        {isOverdue ? `Overdue by ${Math.abs(daysLeft)}` : daysLeft}
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${progressPercent}%`, 
                      height: '100%', 
                      background: isOverdue ? '#ef4444' : 'linear-gradient(90deg, #00D4AA, #00B894)', 
                      borderRadius: 3,
                      transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }} />
                  </div>
                </>
              )}
            </div>

            {totalOwed > 0 ? (
              <div style={{ borderRadius: 20, overflow: 'hidden', marginBottom: 24, border: '1px solid rgba(67, 176, 42, 0.4)', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                {/* Official Lipa na M-PESA image */}
                <div style={{ background: '#fff', padding: '16px 20px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', position: 'relative' }}>
                  <img
                    src="/lipanampesa.png"
                    alt="Lipa na M-PESA"
                    style={{ height: 48, objectFit: 'contain' }}
                  />
                  <img
                    src="/SAF-MAIN-LOGO.png"
                    alt="Safaricom"
                    style={{ height: 28, objectFit: 'contain', position: 'absolute', top: 16, right: 16 }}
                  />
                </div>
                {/* White bottom - PAYBILL & ACCOUNT */}
                <div style={{ background: '#fff', padding: '20px 20px 18px' }}>
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#43B02A', letterSpacing: 2.5, opacity: 0.9 }}>
                        PAYBILL NUMBER
                      </span>
                      <button
                        onClick={() => handleCopy('4166191', 'paybill')}
                        style={{
                          background: copiedField === 'paybill' ? '#eaf8e6' : '#f0fdf4',
                          border: `1px solid ${copiedField === 'paybill' ? '#43B02A' : 'rgba(67, 176, 42, 0.3)'}`,
                          color: '#43B02A',
                          borderRadius: 99,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.2s',
                          fontFamily: 'inherit'
                        }}
                      >
                        {copiedField === 'paybill' ? (
                          <><Check size={11} /> Copied</>
                        ) : (
                          <><Copy size={11} /> Copy</>
                        )}
                      </button>
                    </div>
                    <div 
                      onClick={() => handleCopy('4166191', 'paybill')}
                      title="Click to copy Paybill"
                      style={{ display: 'flex', justifyContent: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
                    >
                      {'4166191'.split('').map((digit, i) => (
                        <div key={i} style={{ width: 34, height: 40, background: copiedField === 'paybill' ? '#eaf8e6' : '#f8fff7', border: `1.5px solid ${copiedField === 'paybill' ? '#43B02A' : 'rgba(67, 176, 42, 0.3)'}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#43B02A', boxShadow: '0 2px 4px rgba(67, 176, 42, 0.05)', transition: 'all 0.2s' }}>{digit}</div>
                      ))}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed #e5f5e0', paddingTop: 18, textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#43B02A', letterSpacing: 2.5, opacity: 0.9 }}>
                        ACCOUNT NUMBER
                      </span>
                      <button
                        onClick={() => handleCopy(accountNo, 'account')}
                        style={{
                          background: copiedField === 'account' ? '#eaf8e6' : '#f0fdf4',
                          border: `1px solid ${copiedField === 'account' ? '#43B02A' : 'rgba(67, 176, 42, 0.3)'}`,
                          color: '#43B02A',
                          borderRadius: 99,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.2s',
                          fontFamily: 'inherit'
                        }}
                      >
                        {copiedField === 'account' ? (
                          <><Check size={11} /> Copied</>
                        ) : (
                          <><Copy size={11} /> Copy</>
                        )}
                      </button>
                    </div>
                    <div 
                      onClick={() => handleCopy(accountNo, 'account')}
                      title="Click to copy Account Number"
                      style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 4, cursor: 'pointer', userSelect: 'none' }}
                    >
                      {accountNo.split('').map((char, i) => (
                        <div key={i} style={{ width: 24, height: 28, background: copiedField === 'account' ? '#eaf8e6' : '#f8fff7', border: `1.5px solid ${copiedField === 'account' ? '#43B02A' : 'rgba(67, 176, 42, 0.3)'}`, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#43B02A', transition: 'all 0.2s' }}>{char}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cp-inner-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>All Cleared!</div>
                <div style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.5 }}>You have no outstanding balance.</div>
              </div>
            )}

            {totalOwed > 0 && (
              <div style={{ marginTop: 20 }}>
                <button className="cp-btn" 
                  onClick={() => { setPayStep('choose'); setPayAmount(''); setPayError(''); }}>
                  Make a Payment
                </button>
              </div>
            )}
          </div>

          <div className="cp-bottom-nav">
            <button className="cp-nav-item active" style={{ position: 'relative' }}>
              <Home size={22} />
              Home
            </button>
            <button className="cp-nav-item" onClick={handleLogout}>
              <LogOut size={22} />
              Log out
            </button>
          </div>

        </div>
      </div>

      {/* ── Payment Overlay (Top-Level) ── */}
      {payStep && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          {/* Backdrop */}
          <div onClick={() => !['processing'].includes(payStep) && setPayStep(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }} />

          {/* Sheet */}
          <div className="cp-fade-in" style={{
            position: 'relative', width: '100%', maxWidth: 460,
            background: '#0B1120', borderRadius: '28px 28px 0 0',
            border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none',
            padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
            boxShadow: '0 -20px 50px rgba(0,0,0,0.8)',
            boxSizing: 'border-box'
          }}>
            {/* Handle bar */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px' }} />

            {/* Step: Choose Full or Partial */}
            {payStep === 'choose' && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, letterSpacing: '-0.02em', color: '#fff' }}>Make Payment</div>
                <div style={{ color: '#94A3B8', fontSize: 13, marginBottom: 20 }}>Select how much you want to pay via M-Pesa</div>

                {/* Full Payment */}
                <button onClick={() => handleStkPush(totalOwed)} style={{
                  width: '100%', background: 'rgba(0,229,153,0.08)', border: '1px solid rgba(0,229,153,0.25)',
                  borderRadius: 18, padding: '16px 20px', marginBottom: 12, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit',
                  color: '#fff', textAlign: 'left',
                }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2, color: '#fff' }}>Full Payment</div>
                    <div style={{ color: '#94A3B8', fontSize: 12 }}>Clear your entire balance</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#00E599', fontFamily: "'JetBrains Mono',monospace" }}>
                    {fmt(totalOwed)}
                  </div>
                </button>

                {/* Partial Payment */}
                <button onClick={() => setPayStep('partial')} style={{
                  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 18, padding: '16px 20px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit',
                  color: '#fff', textAlign: 'left',
                }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>Partial Payment</div>
                    <div style={{ color: '#94A3B8', fontSize: 12 }}>Pay a custom amount</div>
                  </div>
                  <ArrowRight size={18} style={{ color: '#94A3B8' }} />
                </button>

                <button onClick={() => setPayStep(null)} className="cp-btn-outline" style={{ marginTop: 12 }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Step: Partial — enter amount */}
            {payStep === 'partial' && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, letterSpacing: '-0.02em', color: '#fff' }}>Enter Amount</div>
                <div style={{ color: '#94A3B8', fontSize: 13, marginBottom: 20 }}>
                  How much would you like to pay? (Max: {fmt(totalOwed)})
                </div>

                <div className="cp-input-group" style={{ marginBottom: 18, width: '100%', boxSizing: 'border-box' }}>
                  <div className="cp-country-prefix" style={{ color: '#00E599', fontWeight: 800, flexShrink: 0, padding: '0 18px', minWidth: 65 }}>
                    KES
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder="0"
                    className="cp-input"
                    style={{ fontSize: 22, fontWeight: 800, textAlign: 'right', paddingRight: 18, minWidth: 0, flex: 1 }}
                    autoFocus
                  />
                </div>

                <button className="cp-btn" style={{ marginBottom: 10 }}
                  disabled={!payAmount || Number(payAmount) < 1 || Number(payAmount) > totalOwed}
                  onClick={() => handleStkPush(Number(payAmount))}>
                  Pay {payAmount ? fmt(Number(payAmount)) : 'KES 0'}
                </button>

                <button onClick={() => setPayStep('choose')} className="cp-btn-outline">
                  ← Back
                </button>
              </div>
            )}

            {/* Step: Processing */}
            {payStep === 'processing' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,229,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <span className="cp-spinner" style={{ width: 28, height: 28, borderWidth: 3, borderTopColor: '#00E599' }} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Requesting Payment...</div>
                <div style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.5 }}>
                  An M-Pesa prompt will appear on your phone.<br/>Please enter your PIN to complete the payment.
                </div>
              </div>
            )}

            {/* Step: STK Sent — dynamic based on polling status */}
            {payStep === 'sent' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                {/* Completed — payment confirmed */}
                {stkStatus === 'completed' ? (
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,229,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                      <CheckCircle2 size={28} style={{ color: '#00E599' }} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#00E599' }}>Payment Received ✅</div>
                    <div style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
                      Your payment has been processed successfully.<br/>
                      Your balance has been updated.
                    </div>
                    <button className="cp-btn" onClick={() => { setPayStep(null); setStkStatus(null); }}>Done</button>
                  </>
                ) : stkStatus === 'failed' ? (
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                      <span style={{ fontSize: 28 }}>⚠️</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Payment Not Completed</div>
                    <div style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
                      {payError || 'The M-Pesa transaction was cancelled or failed. Please try again.'}
                    </div>
                    <button className="cp-btn" onClick={() => { setPayStep('choose'); setStkStatus(null); }}>Try Again</button>
                    <button onClick={() => { setPayStep(null); setStkStatus(null); }} className="cp-btn-outline" style={{ marginTop: 10 }}>Cancel</button>
                  </>
                ) : stkStatus === 'timeout' ? (
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,229,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                      <CheckCircle2 size={28} style={{ color: '#00E599' }} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Payment May Still Be Processing</div>
                    <div style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
                      We haven't received confirmation yet.<br/>
                      If you completed the M-Pesa PIN entry, your balance will update shortly.
                    </div>
                    <button className="cp-btn" onClick={async () => { await refreshDashboard(); setPayStep(null); setStkStatus(null); }}>Close & Refresh</button>
                  </>
                ) : (
                  /* Default: polling / waiting for confirmation */
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,229,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                      <Loader2 size={28} style={{ color: '#00E599', animation: 'spin 1s linear infinite' }} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Waiting for Payment...</div>
                    <div style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
                      An M-Pesa prompt has been sent to<br/>
                      <span style={{ color: '#fff', fontWeight: 700 }}>{phone}</span>.<br/>
                      Enter your PIN on your phone. We'll update your balance automatically.
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{
                          width: 8, height: 8, borderRadius: '50%', background: '#00E599',
                          animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`
                        }} />
                      ))}
                    </div>
                    <button onClick={() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } refreshDashboard(); setPayStep(null); setStkStatus(null); }}
                      className="cp-btn-outline" style={{ fontSize: 12 }}>
                      Close without waiting
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Step: Failed */}
            {payStep === 'failed' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <span style={{ fontSize: 28 }}>⚠️</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Payment Failed</div>
                <div style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
                  {payError || 'Something went wrong. Please try again.'}
                </div>
                <button className="cp-btn" onClick={() => setPayStep('choose')}>Try Again</button>
                <button onClick={() => setPayStep(null)} className="cp-btn-outline" style={{ marginTop: 10 }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chatbot overlay */}
      <PortalChatbot dashboardData={dashboardData} />
    </div>
  );
}

  /* ── Auth Screens (Login / OTP) ── */
  return (
    <div className="cp-root">
      <PortalStyles />
      
      {/* Ambient background mesh */}
      <div className="cp-ambient">
        <div className="cp-orb-1" />
        <div className="cp-orb-2" />
        <div className="cp-grid-overlay" />
      </div>

      <div className="cp-wrapper">
        <div className="cp-container">
          {/* Header Bar */}
          <div style={{ padding: '28px 24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="cp-brand-badge">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E599', boxShadow: '0 0 8px #00E599' }} />
              ADEQUATE CAPITAL
            </div>
          </div>

          {/* Auth Content */}
          <div style={{ padding: '16px 28px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', animation: 'cp-fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>

              {/* Hero Icon + Title */}
              <div style={{ marginBottom: 28, textAlign: 'center' }}>
                <div className="cp-logo-icon">
                  {step === 'login' ? (
                    <Smartphone size={30} style={{ color: '#00E599', filter: 'drop-shadow(0 0 10px rgba(0,229,153,0.5))' }} />
                  ) : (
                    <Lock size={30} style={{ color: '#00E599', filter: 'drop-shadow(0 0 10px rgba(0,229,153,0.5))' }} />
                  )}
                </div>
                
                <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, letterSpacing: '-0.02em', color: '#fff' }}>
                  {step === 'login' ? 'Customer Self-Service' : 'Verify Your Phone'}
                </h1>
                
                <p style={{ color: '#94A3B8', fontSize: 13.5, lineHeight: 1.5, margin: 0, padding: '0 8px' }}>
                  {step === 'login'
                    ? 'Check your live loan balance, due dates, and make instant M-Pesa payments.'
                    : `Enter the 4-digit code sent via SMS to ${phone}.`}
                </p>
              </div>

              {/* Error Box */}
              {error && (
                <div style={{ 
                  background: 'rgba(239, 68, 68, 0.12)', 
                  border: '1px solid rgba(239, 68, 68, 0.3)', 
                  color: '#F87171', 
                  padding: '14px 16px', 
                  borderRadius: 16, 
                  fontSize: 13, 
                  fontWeight: 600,
                  marginBottom: 20, 
                  textAlign: 'center',
                  animation: 'cp-fadeUp 0.2s ease-out'
                }}>
                  {error}
                </div>
              )}

              {/* Login Form */}
              {step === 'login' ? (
                <form onSubmit={handleRequestOTP} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={{ display: 'block', color: '#CBD5E1', fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      Mobile Phone Number
                    </label>
                    <div className="cp-input-group">
                      <div className="cp-country-prefix">
                        <span>🇰🇪</span>
                        <span>+254</span>
                      </div>
                      <input
                        type="tel"
                        value={phone.startsWith('+254') ? phone.slice(4) : phone.startsWith('254') ? phone.slice(3) : phone}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setPhone(val);
                        }}
                        placeholder="712 345 678"
                        className="cp-input"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="cp-btn" 
                    disabled={loading || phone.replace(/[^0-9]/g, '').length < 9}
                  >
                    {loading ? (
                      <><span className="cp-spinner" /> Verifying Number...</>
                    ) : (
                      <>Send Verification Code <ArrowRight size={18} /></>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={{ display: 'block', color: '#CBD5E1', fontSize: 12, fontWeight: 700, marginBottom: 8, textAlign: 'center', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      Security Verification Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '').substring(0, 4);
                        setCode(val);
                        if (val.length === 4) {
                          // auto-submit: call handleVerify with a synthetic event
                          setTimeout(() => {
                            const form = e.target.closest('form');
                            if (form) form.requestSubmit();
                          }, 120);
                        }
                      }}
                      placeholder="••••"
                      className="cp-otp-input"
                      autoFocus
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="cp-btn" 
                    disabled={loading || code.length !== 4}
                  >
                    {loading ? (
                      <><span className="cp-spinner" /> Checking Code...</>
                    ) : (
                      <>Access My Dashboard <ArrowRight size={18} /></>
                    )}
                  </button>

                  <button 
                    type="button" 
                    onClick={() => { setStep('login'); setCode(''); setError(''); }} 
                    className="cp-btn-outline" 
                    style={{ marginTop: 4 }}
                  >
                    ← Change Phone Number
                  </button>
                </form>
              )}

              {/* Trust Indicators */}
              <div className="cp-trust-row">
                <div className="cp-trust-item">
                  <Shield size={13} style={{ color: '#00E599' }} />
                  <span>256-Bit SSL</span>
                </div>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                <div className="cp-trust-item">
                  <CreditCard size={13} style={{ color: '#00E599' }} />
                  <span>M-Pesa Daraja</span>
                </div>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                <div className="cp-trust-item">
                  <CheckCircle2 size={13} style={{ color: '#00E599' }} />
                  <span>Instant OTP</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Brand footer tag */}
        <div style={{ marginTop: 20, textAlign: 'center', color: '#64748B', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Adequate Capital Ltd</span>
          <span>•</span>
          <span>Licensed & Regulated</span>
        </div>
      </div>
    </div>
  );
}
