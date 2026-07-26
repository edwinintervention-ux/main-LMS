import React, {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  memo,
} from "react";
import { createPortal } from "react-dom";
import {
  Search as SearchIcon, ChevronLeft, ChevronRight, RotateCcw, User, ShieldCheck, 
  AlertCircle, CheckCircle, Info, Clock, MoreHorizontal,
  ArrowUpRight, ArrowRight, Download, Upload, Send, 
  CreditCard, LayoutDashboard, Users, UserPlus, 
  Settings, LogOut, Calendar, BarChart3, HelpCircle, 
  Phone, Mail, MapPin, Briefcase, FileText, Check, X,
  Database, Activity, RefreshCw, UserCheck, AlertTriangle, Globe,
  ShieldAlert, History, MessageSquare, Gavel, Ban, Bell, Flame, Zap,
  ChevronDown, Trash2, Home, Landmark, Rocket
} from "lucide-react";
import {
  _hashPw,
  _checkPw,
  SEED_WORKERS,
  SEED_CUSTOMERS,
  SEED_LOANS,
  SEED_PAYMENTS,
  SEED_LEADS,
  SEED_INTERACTIONS,
  SEED_AUDIT,
} from "@/data/seedData";
import { buildAuditMeta } from "@/utils/deviceInfo";
import { supabase } from "@/config/supabaseClient";

export const SFX = (() => {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {}
    }
    if (ctx && ctx.state === "suspended") {
      try {
        ctx.resume();
      } catch (e) {}
    }
    return ctx;
  };
  // Suspend context when tab is hidden to stop burning the audio thread
  if (typeof document !== "undefined") {
    const _sfxVisHandler = () => {
      if (ctx) {
        try {
          document.hidden ? ctx.suspend() : ctx.resume();
        } catch (e) {}
      }
    };
    document.removeEventListener("visibilitychange", _sfxVisHandler);
    document.addEventListener("visibilitychange", _sfxVisHandler);
  }

  const play = (notes, masterVol = 0.18) => {
    const c = getCtx();
    if (!c) return;
    const master = c.createGain();
    master.gain.setValueAtTime(masterVol, c.currentTime);
    master.connect(c.destination);
    notes.forEach(
      ({
        freq,
        start,
        dur,
        vol = 1,
        type = "sine",
        attack = 0.01,
        decay = 0.12,
      }) => {
        const osc = c.createOscillator();
        const env = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime + start);
        env.gain.setValueAtTime(0, c.currentTime + start);
        env.gain.linearRampToValueAtTime(vol, c.currentTime + start + attack);
        env.gain.exponentialRampToValueAtTime(
          0.001,
          c.currentTime + start + dur,
        );
        osc.connect(env);
        env.connect(master);
        osc.start(c.currentTime + start);
        osc.stop(c.currentTime + start + dur + 0.05);
      },
    );
  };

  return {
    // Login success — warm ascending chime
    login: () =>
      play(
        [
          { freq: 523, start: 0, dur: 0.22 },
          { freq: 659, start: 0.1, dur: 0.22 },
          { freq: 784, start: 0.2, dur: 0.35 },
        ],
        0.14,
      ),
    // Save / confirm — single soft ding
    save: () =>
      play(
        [
          { freq: 880, start: 0, dur: 0.18, attack: 0.005 },
          { freq: 1047, start: 0.08, dur: 0.28 },
        ],
        0.12,
      ),
    // Notification / new item — two-note plink
    notify: () =>
      play(
        [
          { freq: 1047, start: 0, dur: 0.14, attack: 0.005 },
          { freq: 1319, start: 0.1, dur: 0.22 },
        ],
        0.1,
      ),
    // Download — descending whoosh
    download: () =>
      play(
        [
          { freq: 660, start: 0, dur: 0.12 },
          { freq: 550, start: 0.08, dur: 0.12 },
          { freq: 440, start: 0.16, dur: 0.2 },
        ],
        0.13,
      ),
    // Upload — ascending whoosh
    upload: () =>
      play(
        [
          { freq: 440, start: 0, dur: 0.12 },
          { freq: 550, start: 0.08, dur: 0.12 },
          { freq: 660, start: 0.16, dur: 0.2 },
        ],
        0.13,
      ),
    // Send message — pop
    send: () =>
      play(
        [
          { freq: 1175, start: 0, dur: 0.1, attack: 0.002 },
          { freq: 987, start: 0.08, dur: 0.18, type: "triangle" },
        ],
        0.11,
      ),
    // Warning / danger
    warn: () =>
      play(
        [
          { freq: 440, start: 0, dur: 0.18, type: "triangle" },
          { freq: 392, start: 0.16, dur: 0.28, type: "triangle" },
        ],
        0.15,
      ),
    // Reminder alarm — gentle repeating bell
    reminder: () => {
      const notes = [];
      for (let i = 0; i < 3; i++) {
        notes.push({
          freq: 1047,
          start: i * 0.5,
          dur: 0.4,
          attack: 0.005,
          vol: 0.9,
        });
        notes.push({
          freq: 784,
          start: i * 0.5 + 0.18,
          dur: 0.3,
          attack: 0.005,
          vol: 0.6,
        });
      }
      play(notes, 0.16);
    },
    // Error
    error: () =>
      play(
        [
          { freq: 220, start: 0, dur: 0.25, type: "sawtooth" },
          { freq: 196, start: 0.2, dur: 0.3, type: "sawtooth" },
        ],
        0.12,
      ),
  };
})();

// SFX-aware toast hook
export const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const setRef = useRef(setToasts); // ref is stable, no useEffect needed
  const show = useRef((msg, type = "ok", duration = 3000) => {
    const id = Date.now();
    setRef.current((t) => [...t, { id, msg, type }]);
    setTimeout(
      () => setRef.current((t) => t.filter((x) => x.id !== id)),
      duration,
    );
    if (type === "ok") SFX.save();
    else if (type === "danger") SFX.warn();
    else if (type === "warn") SFX.warn();
    else if (type === "info") SFX.notify();
  }).current;
  return { toasts, show };
};

export const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800;900&display=swap');
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    input, select, textarea { transition: none !important; }
    input::placeholder, select::placeholder, textarea::placeholder { color: var(--txt) !important; opacity: 0.85 !important; }
    ::-webkit-input-placeholder { color: var(--txt) !important; opacity: 0.85 !important; }
    ::-moz-placeholder { color: var(--txt) !important; opacity: 0.85 !important; }
    /* v1.7.2 UX — skip link */
    .skip-link{position:absolute;top:-999px;left:8px;background:#00D4AA;color:#060A10;padding:6px 14px;border-radius:0 0 8px 8px;font-weight:700;font-size:13px;z-index:999999;text-decoration:none;}
    .skip-link:focus{top:0;}
    /* v1.7.2 UX — screen-reader-only utility */
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0;}
    /* v1.7.2 UX — visible focus rings for keyboard navigation */
    :focus-visible{outline:2px solid #00D4AA;outline-offset:2px;border-radius:4px;}
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #00D4AA;outline-offset:2px;}
    /* v1.7.2 UX — remove outline only for mouse users */
    :focus:not(:focus-visible){outline:none;}

    :root {
      --bg: #F1F5F9;
      --surface: #E2E8F0;
      --card: #FFFFFF;
      --card2: #F8FAFC;
      --border: #CBD5E1;
      --hi: #94A3B8;
      --accent: #2E7D32; 
      --a-lo: #2E7D3215;
      --a-mid: #2E7D3230;
      --gold: #C49A2C;
      --g-lo: #C49A2C15;
      --warn: #C49A2C;
      --w-lo: #C49A2C15;
      --danger: #DC2626;
      --d-lo: #DC262615;
      --ok: #058B5E;
      --o-lo: #058B5E15;
      --blue: #2563EB;
      --b-lo: #2563EB15;
      --purple: #7C3AED;
      --p-lo: #7C3AED15;
      --txt: #0D1B2A;
      --dim: #334155;
      --muted: #475569;
      --glass-bg: rgba(255, 255, 255, 0.90);
      --glass-border: rgba(15, 23, 42, 0.12);
      --glass-blur: 16px;
    }

    :root[data-theme='dim'] {
      --bg: #0F172A;
      --surface: #1E293B;
      --card: #1e293b;
      --card2: #334155;
      --border: #334155;
      --hi: #475569;
      --accent: #2E7D32;
      --a-lo: #2E7D3215;
      --a-mid: #2E7D3230;
      --gold: #C49A2C;
      --g-lo: #C49A2C15;
      --warn: #C49A2C;
      --w-lo: #C49A2C15;
      --danger: #EF4444;
      --d-lo: #EF444415;
      --ok: #10B981;
      --o-lo: #10B98115;
      --blue: #3B82F6;
      --b-lo: #3B82F615;
      --purple: #8B5CF6;
      --p-lo: #8B5CF615;
      --txt: #F1F5F9;
      --dim: #94A3B8;
      --muted: #64748B;
      --glass-bg: rgba(30, 41, 59, 0.7);
      --glass-border: rgba(255, 255, 255, 0.08);
      --glass-blur: 16px;
    }

    :root[data-theme='dark'] {
      --bg: #000000;
      --surface: #0A0A0A;
      --card: #111111;
      --card2: #1A1A1A;
      --border: #222222;
      --hi: #333333;
      --accent: #2E7D32;
      --a-lo: #2E7D3215;
      --a-mid: #2E7D3230;
      --gold: #C49A2C;
      --g-lo: #C49A2C15;
      --warn: #C49A2C;
      --w-lo: #C49A2C15;
      --danger: #EF4444;
      --d-lo: #EF444415;
      --ok: #10B981;
      --o-lo: #10B98115;
      --blue: #3B82F6;
      --b-lo: #3B82F615;
      --purple: #8B5CF6;
      --p-lo: #8B5CF615;
      --txt: #FFFFFF;
      --dim: #A1A1AA;
      --muted: #71717A;
      --glass-bg: rgba(0, 0, 0, 0.82);
      --glass-border: rgba(255, 255, 255, 0.1);
      --glass-blur: 20px;
    }

    :root[data-theme='green'] {
      --bg: #061e14;
      --surface: #0a2e1f;
      --card: #10402b;
      --card2: #165239;
      --border: #206d4b;
      --hi: #308f64;
      --accent: #2E7D32;
      --accent-txt: #022c22;
      --a-lo: rgba(46, 125, 50, 0.15);
      --a-mid: rgba(46, 125, 50, 0.3);
      --gold: #C49A2C;
      --g-lo: rgba(196, 154, 44, 0.15);
      --warn: #C49A2C;
      --w-lo: rgba(196, 154, 44, 0.15);
      --danger: #EF4444;
      --d-lo: rgba(239, 68, 68, 0.15);
      --ok: #34D399;
      --o-lo: rgba(52, 211, 153, 0.15);
      --blue: #3B82F6;
      --b-lo: rgba(59, 130, 246, 0.15);
      --purple: #8B5CF6;
      --p-lo: rgba(139, 92, 246, 0.15);
      --txt: #F8FAFC;
      --dim: #CBD5E1;
      --muted: #94A3B8;
      --glass-bg: rgba(10, 46, 31, 0.85);
      --glass-border: rgba(255, 255, 255, 0.15);
      --glass-blur: 16px;
    }

    /* Green Theme Sidebar */
    [data-theme='green'] .main-sidebar {
      background: #0a2e1f !important;
      border-right: 1px solid #206d4b !important;
    }
    [data-theme='green'] .main-sidebar button,
    [data-theme='green'] .main-sidebar button span,
    [data-theme='green'] .main-sidebar button div,
    [data-theme='green'] .main-sidebar div {
      color: #F8FAFC !important;
    }
    [data-theme='green'] .main-sidebar button:hover {
      background: rgba(255, 255, 255, 0.1) !important;
    }
    [data-theme='green'] .main-sidebar button.nb[style*="linear-gradient"] {
      background: rgba(255, 255, 255, 0.15) !important;
    }
    [data-theme='green'] .main-sidebar button.nb[style*="linear-gradient"] span {
      color: #10b981 !important;
      font-weight: 800 !important;
    }
    [data-theme='green'] .main-sidebar button.nb[style*="linear-gradient"] span[style*="background:"] {
      background: #10b981 !important;
      color: #061e14 !important;
    }
    [data-theme='green'] .main-sidebar button[style*="danger"] {
      background: rgba(239, 68, 68, 0.15) !important;
      color: #EF4444 !important;
    }
    [data-theme='green'] .main-sidebar button[style*="danger"]:hover {
      background: rgba(239, 68, 68, 0.25) !important;
    }
    [data-theme='green'] #sidebar-home-btn,
    [data-theme='green'] #sidebar-back-btn,
    [data-theme='green'] #sidebar-forward-btn {
      background: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: #F8FAFC !important;
    }
    [data-theme='green'] #sidebar-home-btn:hover,
    [data-theme='green'] #sidebar-back-btn:hover,
    [data-theme='green'] #sidebar-forward-btn:hover {
      background: rgba(255, 255, 255, 0.2) !important;
    }

    [data-theme='green'] tbody tr:nth-child(even) {
      background: #0a2e1f !important;
    }
    [data-theme='green'] tbody tr:nth-child(odd) {
      background: transparent !important;
    }
    [data-theme='green'] tbody tr.row-hover:hover {
      background: #10402b !important;
    }

    /* Green theme: make all non-sidebar buttons and icons dark/readable */
    [data-theme='green'] .btn-modern {
      color: #F8FAFC !important;
    }
    [data-theme='green'] .btn-modern svg {
      color: #F8FAFC !important;
      stroke: #F8FAFC !important;
    }
    [data-theme='green'] td button,
    [data-theme='green'] td .btn-modern,
    [data-theme='green'] td svg {
      color: #F8FAFC !important;
      stroke: #F8FAFC !important;
    }
    [data-theme='green'] table button {
      color: #F8FAFC !important;
    }
    [data-theme='green'] table button svg {
      color: #F8FAFC !important;
      stroke: #F8FAFC !important;
    }

    body, html {
      min-height: 100%;
      background: var(--bg);
      color: var(--txt);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      /* Ensure content is not hidden behind the browser chrome on mobile */
      padding-top: env(safe-area-inset-top, 0px);
      padding-left: env(safe-area-inset-left, 0px);
      padding-right: env(safe-area-inset-right, 0px);
    }
    #root { height: auto; min-height: 100%; min-height: 100dvh; display: flex; flex-direction: column; }

    /* Modern Scrollbars */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

    .glass {
        /* transitions removed for instant theme switching */
    }

    /* v1.7.1 — body scroll lock applied by useModalLock while any overlay is open */
    body.modal-open{overflow:hidden!important;position:fixed;width:100%;}
    /* Lock the inner AdminPanel scroll container when any modal is open */
    body.modal-open .main-scroll{overflow:hidden!important;}
    /* v1.7.1 — DT table containers: horizontal scroll without page widening */
    .dt-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
    .dt-wrap table{min-width:520px;}
    /* v1.7.1 — fixed-height scrollable DT shell inside cards */
    .dt-shell{overflow-y:auto;overflow-x:auto;-webkit-overflow-scrolling:touch;}
    .dt-shell table{min-width:520px;width:100%;border-collapse:collapse;font-size:13px;}
    /* v1.7.1 — sticky thead inside dt-shell */
    .dt-shell thead th{position:sticky;top:0;z-index:2;background:var(--surface);border-bottom:1px solid var(--border);}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:var(--surface)}
    ::-webkit-scrollbar-thumb{background:var(--hi);border-radius:99px}
    input,select,textarea,button{font-family:-apple-system,BlinkMacSystemFont,'Inter','SF Pro Display','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
    input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus,input:-webkit-autofill:active{
      -webkit-box-shadow:0 0 0 1000px var(--surface) inset!important;
      -webkit-text-fill-color:var(--txt)!important;
      box-shadow:0 0 0 1000px var(--surface) inset!important;
      color:var(--txt)!important;
      background-color:var(--surface)!important;
      caret-color:var(--txt)!important;
    }
    input[type=password]{color:var(--txt)!important;background:var(--card)!important;-webkit-text-fill-color:var(--txt)!important;}

    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
    @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
    @keyframes slideUp{from{transform:translateY(80px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes slideDown{from{transform:translateY(0);opacity:1}to{transform:translateY(80px);opacity:0}}
    @keyframes blurIn{from{opacity:0}to{opacity:1}}
    @keyframes slideInRight{from{opacity:0;transform:translateX(48px)}to{opacity:1;transform:translateX(0)}}
    .panel-in{animation:slideInRight .28s cubic-bezier(.22,1,.36,1) both}

    .fu {animation:fadeUp .8s cubic-bezier(.22,1,.36,1) both}
    .fu1, .fu2, .fu3, .fu4, .fu5 { animation-delay: 0s !important; }
    .glass {
      background: var(--glass-bg) !important;
      backdrop-filter: blur(var(--glass-blur)) !important;
      -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
      border: 1px solid var(--glass-border) !important;
      box-shadow: 0 10px 40px 0 rgba(0, 0, 0, 0.15) !important;
    }
    .pop{animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both}
    .fade{animation:fadeIn .22s ease both}
    .dialog-backdrop{animation:fadeIn .2s ease both; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); background: rgba(0,0,0,0.6) !important;}
    .toast-enter{animation:slideUp .28s cubic-bezier(.22,1,.36,1) both}
    @keyframes appleIn {
      from { opacity: 0; transform: translateY(-40px) scale(0.92); filter: blur(4px); }
      to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
    }
    .apple-toast {
      animation: appleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
      transform-origin: top center;
    }

    .nb:hover{background:var(--a-lo)!important;color:var(--accent)!important}
    .row-hover:hover{background:var(--surface);transition:background .15s}
    .shake{animation:shake .35s ease}

    button, .btn-modern{transition:all .2s cubic-bezier(0.2, 0.8, 0.2, 1)}
    button:not(:disabled):active{transform:scale(.96)}
    .kpi-btn{cursor:pointer;transition:all .25s cubic-bezier(0.2, 0.8, 0.2, 1)}
    .kpi-btn:hover{transform:translateY(-4px);box-shadow:0 12px 30px rgba(0,0,0,0.06)}
    
    input, select, textarea {
      background: var(--card) !important;
      border: 1px solid var(--border) !important;
      color: var(--txt) !important;
      border-radius: 12px !important;
      padding: 12px 16px;
      font-size: 14px !important;
      font-weight: 500 !important;
      transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.02) !important;
    }
    input:hover, select:hover, textarea:hover {
      border-color: var(--accent) !important;
      background: var(--surface) !important;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--accent) !important;
      background: var(--surface) !important;
      box-shadow: 0 0 0 4px var(--a-lo), 0 10px 20px -10px rgba(0,0,0,0.1) !important;
      transform: translateY(-1px) !important;
      outline: none !important;
    }
    select option { background: var(--surface); color: var(--txt); }

    /* ── Apple-like hover/click animations ── */
    .sfx-card{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s,border-color .22s,background .18s}
    .sfx-card:hover{transform:translateY(-2px) scale(1.01);box-shadow:0 8px 28px rgba(0,0,0,0.35)}
    .sfx-card:active{transform:scale(.98)}
    .sec-event{transition:background .15s,border-color .2s,transform .18s cubic-bezier(.22,1,.36,1)}
    .sec-event:hover{background:var(--a-lo)!important;border-color:var(--a-mid)!important;transform:translateX(3px)}
    .sec-event:active{transform:scale(.98)}
    .audit-row{transition:background .12s}
    .audit-row:hover{background:var(--a-lo)!important;cursor:pointer}
    @keyframes expandDown{from{opacity:0;transform:scaleY(0);transform-origin:top}to{opacity:1;transform:scaleY(1);transform-origin:top}}
    @keyframes collapseUp{from{opacity:1;transform:scaleY(1);transform-origin:top}to{opacity:0;transform:scaleY(0);transform-origin:top}}
    .expand-in{animation:expandDown .22s cubic-bezier(.22,1,.36,1) both}
    @keyframes popIn{from{opacity:0;transform:scale(.88) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
    .pop-in{animation:popIn .24s cubic-bezier(.22,1,.36,1) both}
    .back-btn{transition:all .15s;display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--border);color:var(--dim);border-radius:9px;padding:6px 13px;font-size:13px;font-weight:600;cursor:pointer}
    .back-btn:hover{background:var(--surface);color:var(--txt);transform:translateX(-2px)}
    .back-btn:active{transform:scale(.96)}
    .refresh-btn{transition:all .15s;display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--border);color:var(--dim);border-radius:9px;padding:6px 13px;font-size:13px;font-weight:600;cursor:pointer}
    .refresh-btn:hover{background:var(--a-lo);color:var(--accent);border-color:var(--a-mid)}
    .refresh-btn svg{transition:transform .7s cubic-bezier(.22,1,.36,1)}

    /* ── Modern DatePicker Styles ── */
    @keyframes calPopIn {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .cal-pop {
      position: absolute;
      top: 100%;
      left: 0;
      z-index: 15000;
      margin-top: 8px;
      width: 320px !important;
      padding: 24px !important;
      border-radius: 28px !important;
      background: var(--surface) !important;
      border: 1px solid var(--glass-border);
      box-shadow: 0 50px 100px -20px rgba(0,0,0,0.6);
      opacity: 1 !important;
      animation: calPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .cal-sel-wrap {
      display: flex;
      gap: 6px;
      background: var(--surface);
      padding: 4px;
      border-radius: 12px;
      border: 1px solid var(--glass-border);
    }
    .cal-sel {
      background: none;
      border: none;
      color: var(--txt);
      font-size: 13px;
      font-weight: 800;
      outline: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 8px;
    }
    .cal-sel:hover { background: var(--hi); }
    
    .cal-grid {
      display: grid !important;
      grid-template-columns: repeat(7, 1fr) !important;
      gap: 2px !important;
      text-align: center !important;
    }
    .cal-head-day {
      font-size: 10px;
      font-weight: 900;
      color: var(--muted);
      padding: 10px 0;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }
    .cal-day {
      font-size: 13px;
      font-weight: 700;
      height: 36px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .cal-day:hover:not(.empty) {
      background: var(--a-mid);
      color: var(--accent);
      transform: scale(1.1);
      z-index: 2;
    }
    .cal-day.active {
      background: var(--accent) !important;
      color: #000 !important;
      box-shadow: 0 8px 20px var(--a-mid);
    }
    .cal-day.today::after {
      content: '';
      position: absolute;
      bottom: 4px;
      width: 4px;
      height: 4px;
      background: var(--accent);
      border-radius: 50%;
    }
    .cal-day.today.active::after { background: #000; }
    .cal-day.empty {
      cursor: default;
      opacity: 0.1;
    }
    /* Hide native picker icon */
    input[type="date"]::-webkit-inner-spin-button,
    input[type="date"]::-webkit-calendar-picker-indicator {
        display: none;
        -webkit-appearance: none;
    }

    @media(max-width:600px){
      .kpi-row{flex-direction:column!important}
      .kpi-row>*{min-width:0!important;flex:none!important;width:100%!important}
      .hide-mob{display:none!important}
      .mob-full{width:100%!important;min-width:0!important}
      .mob-stack{flex-direction:column!important;align-items:stretch!important}
      .mob-p{padding:12px!important}
      .mob-grid1{grid-template-columns:1fr!important}.mob-grid1>*{grid-column:span 1!important}
      .mob-grid2{grid-template-columns:repeat(2,1fr)!important;gap:10px!important}
      .mob-scroll{display:flex!important;overflow-x:auto!important;gap:12px!important;padding-bottom:8px!important;scrollbar-width:none!important;-ms-overflow-style:none!important}
      .mob-scroll::-webkit-scrollbar{display:none!important}
      .mob-scroll>*{flex:0 0 160px!important;min-width:160px!important}
      .admin-content{padding:12px 10px!important}
      
      /* Typography Adjustments */
      .hero-txt { font-size: 24px !important; letter-spacing: -0.02em !important; }
      h1, .h1 { font-size: 22px !important; }
      h2, .h2 { font-size: 18px !important; }
      p, div { font-size: 13.5px !important; }
      
      /* Layout stability */
      body, html { 
        overflow-x: hidden !important; 
        position: relative; 
        width: 100%; 
        touch-action: manipulation; /* disable double tap zoom */
      }
      * { max-width: 100vw; word-wrap: break-word; }

      /* Clean Status Bar (Top Bar) for Mobile */
      .topbar-actions {
        display: flex !important;
        flex-wrap: nowrap !important;
        gap: 6px !important;
        width: auto !important;
      }
      .topbar-actions > button {
        height: 34px !important;
        padding: 4px 8px !important;
        font-size: 11px !important;
        border-radius: 8px !important;
        white-space: nowrap !important;
      }
      .topbar-actions > button.theme-toggle {
        width: 32px !important;
      }

      /* v1.7.1 mobile table tweaks */
      .dt-shell table,.dt-shell thead th{font-size:11px!important}
      .dt-shell td{padding:8px 8px!important;font-size:12px!important}
      .hide-sm{display:none!important}

      /* Card & Element Spacing */
      .sfx-card { padding: 14px 16px !important; }
      
      /* Responsive Export Dropdown */
      .export-dropdown { right: auto !important; left: 0 !important; }
    }
    
    .port-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 28px;
    }
    @media (max-width: 600px) {
      .port-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 12px !important;
      }
      .port-grid > div {
        transform: scale(0.9);
        margin: -10px;
      }
    }
  `}</style>
);

export const T = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  card: "var(--card)",
  card2: "var(--card2)",
  border: "var(--border)",
  hi: "var(--hi)",
  accent: "var(--accent)",
  aLo: "var(--a-lo)",
  aMid: "var(--a-mid)",
  gold: "var(--gold)",
  gLo: "var(--g-lo)",
  warn: "var(--warn)",
  wLo: "var(--w-lo)",
  danger: "var(--danger)",
  dLo: "var(--d-lo)",
  ok: "var(--ok)",
  oLo: "var(--o-lo)",
  blue: "var(--blue)",
  bLo: "var(--b-lo)",
  purple: "var(--purple)",
  pLo: "var(--p-lo)",
  txt: "var(--txt)",
  dim: "var(--dim)",
  muted: "var(--muted)",
  mono: "'SF Mono','Fira Code','Fira Mono','Roboto Mono',monospace",
  head: "'Outfit',-apple-system,BlinkMacSystemFont,sans-serif",
  body: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
};
export const RC = {
  Low: T.ok,
  Medium: T.warn,
  High: T.danger,
  "Very High": T.purple,
};
export const SC = {
  Active: T.ok,
  Settled: T.accent,
  Approved: T.gold,
  Overdue: T.danger,
  "Written off": T.muted,
  Dormant: T.warn,
  "Application submitted": T.blue,
  "Under review": T.warn,
  New: T.muted,
  Contacted: T.warn,
  Interested: T.accent,
  Onboarded: T.ok,
  Allocated: T.ok,
  Unallocated: T.danger,
  Reversed: '#F43F5E',
  Inactive: T.muted,
  Reminder: T.warn,
  "Field Visit": T.blue,
  "Demand Letter": T.danger,
  "Final Notice": T.danger,
  Legal: T.purple,
  "Written Off": T.muted,
};

// ── Utilities ─────────────────────────────────────────────────
export const fmt = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
export const fmtM = (n) => {
  const v = Number(n || 0);
  const absV = Math.abs(v);
  if (absV >= 1e6) return `KES ${(v / 1e6).toFixed(2)}M`;
  if (absV >= 1e3) return `KES ${(v / 1e3).toFixed(1)}K`;
  return `KES ${Math.round(v)}`;
};
export const now = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0];
export const localDateStr = (dateInput) => { if(!dateInput) return ''; const d = new Date(dateInput); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0]; };
export const nowISO = () => new Date().toISOString();
export const ts = (d) =>
  new Date(d || Date.now()).toLocaleString("en-KE", { hour12: false, timeZone: "Africa/Nairobi" }).replace(",", " ");
export const uid = (p = 'ID') =>
  `${p}-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
// ═══════════════════════════════════════════════════════════════════════════════
//  FINANCIAL ENGINE — Single source of truth for all interest/penalty calculations
//  Rules (as specified):
//  • Day 0–30 overdue  : interest only (1.2%/day on outstanding balance)
//  • Day 31–60 overdue : penalty only  (1.2%/day on outstanding balance, interest stops)
//  • After day 60      : FREEZE — no further accumulation, total is locked
//  • Before overdue    : no interest or penalty (flat 30% is baked into loan balance)
// ═══════════════════════════════════════════════════════════════════════════════
export const DAILY_RATE    = 0.012;
export const INTEREST_DAYS = 30; 
export const PENALTY_DAYS  = 30;
export const FREEZE_AFTER  = 60;

/**
 * calculateLoanStatus(loan, asOfDate?)
 * ─────────────────────────────────────
 * Returns a deterministic snapshot of a loan's financial state.
 * Updated to use unified Penalty (1.2% of Principal + 30% Interest).
 *
 * @param {object} loan        - Loan record with .balance, .daysOverdue, .status, .amount
 * @param {Date}   [asOfDate]  - Calculation date (defaults to today)
 * @returns {object} {
 *   penalty,           // KES — combined overdue charge (1.2% per day on full loan amount)
 *   totalAmountDue,    // KES — balance + penalty
 *   overdueDays,       // number
 *   status,            // human-readable status string
 *   isFrozen,          // bool — true when past 60 days
 * }
 */
/**
 * deriveRisk(overdueDays, isSettled, isWrittenOff)
 * ─────────────────────────────────────────────────
 * Returns the computed risk level based on how late a loan is.
 * Used by calculateLoanStatus and anywhere risk needs to be displayed.
 *
 * Rules:
 *   Settled / Written off → 'Low' (resolved)
 *   Active (0 days)       → 'Low'
 *   1–14 days overdue     → 'Medium'
 *   15–29 days overdue    → 'High'
 *   30+ days overdue      → 'Very High'
 */
export const deriveRisk = (overdueDays = 0, isSettled = false, isWrittenOff = false) => {
  if (isSettled || isWrittenOff) return 'Low';
  if (overdueDays <= 0) return 'Low';
  if (overdueDays < 15) return 'Medium';
  if (overdueDays < 30) return 'High';
  return 'Very High';
};

export const calculateLoanStatus = (loan, asOfDate, paid) => {
  const d = asOfDate || new Date();
  let od = Math.max(0, loan.daysOverdue || 0);

  // v1.9 — Robust Date Detection & Overdue Calculation
  // Date fallback chain — do NOT use createdAt here: for restored/migrated data
  // created_at is the migration date (recent), not the original disbursement date,
  // which would make every old undated loan appear newly issued.
  const dbs = loan.disbursed || loan.disbursed_at || loan.disbursedAt;
  const isUndated = !dbs; // loan has no known disbursement date

  if (dbs && (loan.status === 'Active' || loan.status === 'Overdue' || !loan.status)) {
    const dueDate = new Date(dbs);
    dueDate.setDate(dueDate.getDate() + 30);
    
    // Normalize both dates to midnight local time for calendar-day diffing
    const localDue = new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const localNow = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    
    const diffTime = new Date(localNow).getTime() - new Date(localDue).getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > od) od = diffDays;
  }
  const bal = loan.balance || 0;
  const amount = loan.amount || 0;
  // Account-level discount (frozen at loan creation time). Default 0 = no discount.
  // Effective rate: 30% × (1 − discount/100). At 0% discount → 1.3 (unchanged).
  const discount = Number(loan.interestDiscount || 0);
  const effectiveRate = 0.3 * (1 - discount / 100);
  const baseTotal = amount * (1 + effectiveRate); // Principal + Effective Interest

  // If paid is not provided, derive it from balance (assuming balance = baseTotal - paid)
  // We use the raw balance here to detect overpayments if they are stored as negative in the DB
  const amountPaid = paid !== undefined ? Number(paid || 0) : baseTotal - bal;
  const baseBalance = baseTotal - amountPaid;

  // Penalty Calculation — reads from DB-managed `penaltyAccrued` when available.
  // The database runs a nightly cron (apply_daily_penalties) that compounds 1.2% on
  // the *outstanding balance* each day, so a borrower who has nearly cleared their
  // loan is only penalised on what they still owe — not the original principal.
  //
  // Fallback: if penaltyAccrued hasn't been set yet (null/undefined — e.g. a brand-new
  // loan before the first cron run), we fall back to the old simple-interest formula
  // so the UI is never blank.
  let penalty;
  if (loan.penaltyAccrued != null && od > 0) {
    // Use the authoritative DB value (already accounts for penaltyWaived in the cron)
    penalty = Math.max(0, Number(loan.penaltyAccrued));
  } else if (od > 0) {
    // Fallback: simple interest on principal (pre-cron-run loans)
    const cappedOd = Math.min(od, FREEZE_AFTER);
    const rawPenalty = Math.round(Math.max(0, amount) * DAILY_RATE * cappedOd);
    penalty = Math.max(0, rawPenalty - Number(loan.penaltyWaived || 0));
  } else {
    penalty = 0;
  }
  
  // totalPayable is the total liability: Principal + Base Interest + Penalty
  // (User refers to this as "Total Due")
  const totalPayable = baseTotal + penalty;

  // totalAmountDue is the remaining balance: (Total Due) - Amount Paid
  // (User refers to this as "Remaining")
  const totalAmountDue = totalPayable - amountPaid;

  const disDate = dbs ? new Date(dbs) : null;
  const totalDays = disDate && !isNaN(disDate.getTime()) ? Math.floor((d.getTime() - disDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isFrozen = od > FREEZE_AFTER;
  const TERMINAL_NON_DISBURSED = ['Rejected', 'Declined', 'Cancelled', 'Application submitted', 'worker-pending'];
  const NON_DISBURSED = [...TERMINAL_NON_DISBURSED, 'Approved', 'Disbursing'];

  // A loan is only settled if the total amount due is <= 0.
  // We explicitly ignore the DB `loan.status === 'Settled'` here because the DB trigger
  // prematurely marks loans as Settled when the base balance hits 0, ignoring unpaid penalties.
  const isSettled = (!NON_DISBURSED.includes(loan.status) && totalAmountDue <= 0);

  // If settled, force positive remaining balance to 0 (unpaid penalties are waived)
  const finalAmountDue = isSettled ? Math.min(0, totalAmountDue) : totalAmountDue;
  const finalPayable = isSettled ? (amountPaid + finalAmountDue) : totalPayable;
  const finalPenalty = isSettled && totalAmountDue > 0 ? Math.max(0, penalty - totalAmountDue) : penalty;

  // Written off when: (a) explicitly marked in DB, OR (b) dated loan older than 90 days, OR
  // (c) undated loan that is not in a known pending/terminal state — we cannot verify it is current
  // CRITICAL: Terminal non-disbursed statuses can NEVER be written off.
  const isWrittenOff = !isSettled && !NON_DISBURSED.includes(loan.status) && (
    loan.status === 'Written off' ||
    (totalDays > 90 && od > 0) || // Only auto write-off if also overdue — prevents flagging active paying loans
    (isUndated && !NON_DISBURSED.includes(loan.status))
  );
  
  let status = loan.status || "Active";
  let badgeStatus = loan.status || "Active";

  if (isSettled) {
    status = "Settled";
    badgeStatus = "Settled";
  } else if (isWrittenOff) {
    status = "Written off";
    badgeStatus = "Written off";
  } else if (isFrozen) {
    status = `Frozen (${od}d)`;
    badgeStatus = "Frozen";
  } else if (od > 0) {
    status = `Overdue (${od}d)`;
    badgeStatus = "Overdue";
  } else {
    // Correct stale 'Settled' status from DB if balance remains
    // (Note: we already check for manual 'Settled' in isSettled now)
    status = (loan.status === "Settled" && !isSettled) ? "Active" : (loan.status || "Active");
    badgeStatus = status;
  }

  const phase = isSettled ? "settled" : isWrittenOff ? "defaulted" : isFrozen ? "frozen" : od > 0 ? "penalty" : "active";
  // Auto-derived risk level — always reflects real overdue status, ignoring stale manual tags
  const riskLevel = deriveRisk(od, isSettled, isWrittenOff);

  return { 
    penalty: finalPenalty, 
    totalPayable: finalPayable, 
    totalAmountDue: finalAmountDue, 
    totalDays, // Added back for UI aging display
    overdueDays: od, 
    status, 
    badgeStatus,
    isFrozen, 
    isSettled,
    isWrittenOff,
    phase,
    riskLevel,  // computed from overdue days — use this instead of loan.risk
    baseBalance,
    amountPaid,
    principal: amount
  };
};

/**
 * hasRegFee(customer, payments)
 * ─────────────────────────────
 * Central logic for checking if a customer is eligible for disbursement.
 */
/**
 * hasRegFee — SINGLE SOURCE OF TRUTH
 * Checks: 1) mpesa_registered flag in DB (set by STK callback or manual admin),
 *          2) any payment in ledger with is_reg_fee=true for this customer,
 *          3) repeat customers (already have loans) are exempt.
 */
export const hasRegFee = (cust, payments = []) => {
  if (!cust) return true;
  // Repeat customers exempt from registration fee
  if ((cust.loans || 0) > 0) return true;
  // DB flag — set by STK callback OR manual admin payment
  if (cust.mpesaRegistered === true || cust.mpesa_registered === true) return true;
  // Fallback: scan the in-memory payments ledger for a reg fee entry
  return payments.some(p =>
    p.customerId === cust.id &&
    (p.isRegFee === true || p.is_reg_fee === true ||
     (p.amount >= 500 && typeof p.note === 'string' &&
      (p.note.toLowerCase().includes('registration') || p.note.toLowerCase().includes('reg fee'))))
  );
};
export const calcP = (bal, d, amount = 0) => {
  const stub = {
    amount: amount || (bal / 1.3), // Fallback if amount not provided
    balance: bal,
    daysOverdue: d,
    status: d > 0 ? "Overdue" : "Active",
  };
  const { penalty } = calculateLoanStatus(stub);
  return penalty;
};
// HTML-escape for inserting values into JSX strings and HTML documents
export const escHtml = (v) =>
  String(v || "").replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
  );

// ── CSV / Download ────────────────────────────────────────────
export const toCSV = (hdr, rows) => {
  const DANGER = /^[=+\-@|]/;
  const q = (v) => {
    let s = String(v == null ? "" : v);
    if (DANGER.test(s)) s = "_" + s;
    s = s.replace(/"/g, "");
    return '"' + s + '"';
  };
  return [hdr.join(","), ...rows.map((r) => r.map(q).join(","))].join("\n");
};
export const dlCSV = (filename, csvContent) => {
  try {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: filename,
    });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 500);
    try {
      SFX.download();
    } catch (e) {}
  } catch (e) {
    window.open(
      "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent),
    );
  }
};





export const buildFullBackup = ({
  loans,
  customers,
  payments,
  workers,
  leads,
  interactions,
  auditLog,
  targets,
  salaryPayments,
  workerDeductions,
  repossessedAssets,
}) => {
  const sections = [
    toCSV(
      ["=== INTERVENTION CAPITAL LMS BACKUP ==="],
      [[`Generated: ${new Date().toISOString()}`]],
    ),
    "\n\n--- CUSTOMERS ---\n",
    toCSV(
      [
        "ID", "Name", "Phone", "Alt Phone", "ID No", "DOB", "Gender",
        "Business", "Business Type", "Location", "Officer", 
        "Loans", "Risk", "Joined", "Blacklisted",
        "NOK1 Name", "NOK1 Phone", "NOK1 Relation",
        "NOK2 Name", "NOK2 Phone", "NOK2 Relation",
        "NOK3 Name", "NOK3 Phone", "NOK3 Relation"
      ],
      customers.map((c) => [
        c.id, c.name, c.phone, c.altPhone || "", c.idNo, c.dob || "", c.gender || "",
        c.business || "", c.businessType || "", c.location || "", c.officer || "",
        c.loans, c.risk, c.joined, c.blacklisted ? "Yes" : "No",
        c.n1n || "", c.n1p || "", c.n1r || "",
        c.n2n || "", c.n2p || "", c.n2r || "",
        c.n3n || "", c.n3p || "", c.n3r || ""
      ]),
    ),
    "\n\n--- LOANS ---\n",
    toCSV(
      [
        "Loan ID",
        "Customer ID",
        "Customer",
        "Principal",
        "Remaining",
        "Total Due",
        "Status",
        "Days Overdue",
        "Penalty",
        "Officer",
        "Disbursed",
        "Repayment Type",
      ],
      loans.map((l) => {
        const paid = payments.filter(p => p.loanId === l.id).reduce((a, b) => a + b.amount, 0);
        const e = calculateLoanStatus(l, null, paid);
        return [
          l.id,
          l.customerId || "",
          l.customer,
          l.amount,
          e.totalAmountDue,
          e.totalPayable,
          l.status,
          l.daysOverdue,
          e.penalty,
          l.officer,
          l.disbursed || "N/A",
          l.repaymentType,
        ];
      }),
    ),
    "\n\n--- PAYMENTS ---\n",
    toCSV(
      [
        "ID",
        "Customer ID",
        "Customer",
        "Loan ID",
        "Amount",
        "M-Pesa",
        "Date",
        "Status",
      ],
      payments.map((p) => [
        p.id,
        p.customerId || "",
        p.customer,
        p.loanId || "N/A",
        p.amount,
        p.mpesa,
        p.date,
        p.status,
      ]),
    ),
    "\n\n--- LEADS ---\n",
    toCSV(
      [
        "ID",
        "Name",
        "Phone",
        "Business",
        "Source",
        "Status",
        "Officer",
        "Date",
      ],
      (leads || []).map((l) => [
        l.id,
        l.name,
        l.phone,
        l.business || "",
        l.source,
        l.status,
        l.officer || "",
        l.date,
      ]),
    ),
    "\n\n--- WORKERS ---\n",
    toCSV(
      ["ID", "Name", "Email", "Role", "Status", "Phone", "ID No", "Salary", "Onboarding Target", "Collection Target", "Joined"],
      workers.map((w) => [
        w.id,
        w.name,
        w.email,
        w.role,
        w.status,
        w.phone,
        w.idNo || "",
        w.baseSalary || 20000,
        w.onboardingTarget || 60,
        w.collectionTarget || 500000,
        w.joined,
      ]),
    ),
    "\n\n--- INTERACTIONS ---\n",
    toCSV(
      [
        "ID",
        "Customer ID",
        "Loan ID",
        "Type",
        "Date",
        "Officer",
        "Notes",
        "Promise Amount",
        "Promise Date",
        "Promise Status",
      ],
      (interactions || []).map((i) => [
        i.id,
        i.customerId,
        i.loanId,
        i.type,
        i.date,
        i.officer,
        i.notes,
        i.promiseAmount || "",
        i.promiseDate || "",
        i.promiseStatus || "",
      ]),
    ),
    "\n\n--- AUDIT LOG ---\n",
    toCSV(
      ["ID", "Timestamp", "User", "Action", "Target", "Detail"],
      (auditLog || []).map((e) => [
        e.id || "",
        e.ts,
        e.user,
        e.action,
        e.target,
        e.detail || "",
      ]),
    ),
    "\n\n--- TARGETS ---\n",
    toCSV(
      ["ID", "Worker ID", "Month", "Onboarding Target", "Collection Target"],
      (targets || []).map((t) => [
        t.id,
        t.worker_id,
        t.month,
        t.onboarding_target,
        t.collection_target,
      ]),
    ),
    "\n\n--- SALARY PAYMENTS ---\n",
    toCSV(
      ["ID", "Worker ID", "Amount", "Month", "Date", "Status", "Receipt", "Recipient Phone"],
      (salaryPayments || []).map((s) => [
        s.id,
        s.worker_id,
        s.amount,
        s.month,
        s.created_at,
        s.status,
        s.mpesa_receipt || "",
        s.recipient_phone || "",
      ]),
    ),
    "\n\n--- WORKER DEDUCTIONS ---\n",
    toCSV(
      ["ID", "Worker ID", "Amount", "Month", "Reason", "Date"],
      (workerDeductions || []).map((d) => [
        d.id,
        d.worker_id,
        d.amount,
        d.month,
        d.reason || "",
        d.created_at,
      ]),
    ),
    "\n\n--- REPOSSESSED ASSETS ---\n",
    toCSV(
      ["ID", "Loan ID", "Asset Name", "Serial", "Possession Date", "Status", "Estimated Value", "Actual Sale Price", "Officer"],
      (repossessedAssets || []).map((a) => [
        a.id,
        a.loanId,
        a.name,
        a.serial || "",
        a.possessionDate,
        a.status,
        a.estimatedValue || 0,
        a.actualSalePrice || 0,
        a.officer || "",
      ]),
    ),
  ];
  return sections.join("");
};

// ── Seed Data ─────────────────────────────────────────────────
// Password hashing — SHA-256 via SubtleCrypto (async, used when setting/checking passwords)
// NOTE: Replace with server-side bcrypt/argon2 before production deployment
const _sha256Hex = async (str) => {
  try {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(str),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (e) {
    return str;
  }
};
const HASH_SALT = "acl:2024:mfi";
export const DEFAULT_ADMIN_PW = "123456";

export const hashPwAsync = (pw) => _sha256Hex((pw || "") + HASH_SALT);
export const checkPwAsync = async (raw, stored) => {
  try {
    return (await hashPwAsync(raw)) === stored;
  } catch (e) {
    return false;
  }
};

// _hashPw and _checkPw imported from @/data/seedData

// ═══════════════════════════════════════════
//  UI ATOMS
// ═══════════════════════════════════════════
export const Badge = ({ children, color = T.muted, icon: Icon, variant = 'subtle' }) => {
  const isVar = typeof color === 'string' && color.startsWith('var(');
  const bgColor = variant === 'solid' ? color : (isVar ? color.replace(')', '-lo)') : color + "1A");
  const isAccent = color === T.accent || color === 'var(--accent)';
  
  return (
    <span
      style={{
        background: bgColor,
        color: variant === 'solid' ? (isAccent ? 'var(--accent-txt, #fff)' : '#fff') : color,
        border: `1px solid ${isVar ? color.replace(')', '-mid)') : color + "33"}`,
        padding: "3px 10px",
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  );
};
export const Av = ({ ini, size = 36, color = T.accent }) => {
  const isImg = typeof ini === 'string' && (ini.startsWith('data:image') || ini.startsWith('http') || ini.startsWith('/'));
  const isTooLong = typeof ini === 'string' && ini.length > 8 && !isImg;
  
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: color + "15",
        border: `1px solid ${color}25`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontWeight: 800,
        fontSize: size * 0.4,
        fontFamily: T.head,
        flexShrink: 0,
        boxShadow: `0 2px 10px ${color}15`,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {isImg ? (
        <img 
          src={ini} 
          alt="" 
          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.innerHTML = '⚠️'; }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        (!isTooLong && ini) ? ini : <User size={size * 0.6} strokeWidth={2.5} />
      )}
    </div>
  );
};
export const Bar = ({ value, max = 100, color = T.accent }) => (
  <div
    style={{
      height: 8,
      background: "rgba(255,255,255,0.05)",
      borderRadius: 99,
      overflow: "hidden",
      position: 'relative',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)'
    }}
  >
    <div
      style={{
        height: "100%",
        width: `${Math.min(((value || 0) / max) * 100, 100)}%`,
        background: `linear-gradient(90deg, ${color}, ${color})`, // Fallback
        backgroundColor: color,
        backgroundImage: `linear-gradient(90deg, ${color}CC, ${color})`,
        borderRadius: 99,
        transition: "width 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
        boxShadow: `0 0 12px ${color}40`,
      }}
    />
  </div>
);
export const KPI = ({ label, value, sub, color, delay = 0, onClick, icon: Icon }) => {
  const [hov, setHov] = useState(false);
  const c = color || T.accent;
  return (
    <div
      className={`fu fu${delay}`}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        minWidth: 140,
        position: "relative",
        overflow: "hidden",
        background: hov ? "var(--glass-bg)" : "var(--glass-bg)",
        opacity: hov ? 1 : 0.85,
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderRadius: 16,
        borderTop: `1px solid ${hov ? c + "40" : "var(--glass-border)"}`,
        borderRight: `1px solid ${hov ? c + "40" : "var(--glass-border)"}`,
        borderBottom: `1px solid ${hov ? c + "40" : "var(--glass-border)"}`,
        borderLeft: `4px solid ${c}`,
        padding: "20px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: "all .4s cubic-bezier(0.2, 0.8, 0.2, 1)",
        transform: hov && onClick ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hov && onClick 
          ? `0 12px 30px ${c}15, 0 4px 12px rgba(0,0,0,0.03)` 
          : "0 2px 8px rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ color: T.dim, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
        <div style={{ color: c, opacity: hov ? 1 : 0.6, transition: "opacity .2s" }}>
          {Icon ? (React.isValidElement(Icon) ? Icon : <Icon size={18} strokeWidth={2.5} />) : (onClick && <ArrowUpRight size={16} strokeWidth={2.5} />)}
        </div>
      </div>
      <div style={{ color: T.txt, fontSize: 24, fontWeight: 800, fontFamily: T.head, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: sub ? 6 : 0 }}>{value}</div>
      {sub && <div style={{ color: T.muted, fontSize: 11.5, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
};
export const Card = ({ children, style: sx, className = '', noPadding, ...props }) => (
  <div
    className={`lms-card ${className}`.trim()}
    {...props}
    style={{
      background: "var(--glass-bg)",
      backdropFilter: "var(--glass-blur)",
      WebkitBackdropFilter: "var(--glass-blur)",
      border: `1px solid var(--glass-border)`,
      borderRadius: 16,
      boxShadow: "0 4px 24px -1px rgba(0, 0, 0, 0.04), 0 2px 8px -1px rgba(0, 0, 0, 0.02)",
      transition: "background 0.6s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
      padding: noPadding ? 0 : undefined,
      ...sx,
    }}
  >
    {children}
  </div>
);
export const CH = ({ title, sub, right }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "16px 20px",
      borderBottom: `1px solid var(--glass-border)`,
      flexWrap: "wrap",
      gap: 12,
    }}
  >
    <div>
      <div style={{ color: T.txt, fontWeight: 800, fontSize: 15, fontFamily: T.head, letterSpacing: "-0.01em" }}>{title}</div>
      {sub && <div style={{ color: T.dim, fontSize: 12, marginTop: 3, fontWeight: 500 }}>{sub}</div>}
    </div>
    {right}
  </div>
);
export const Btn = ({
  children,
  v = "primary",
  onClick,
  disabled,
  loading,
  sm,
  full,
  icon: Icon,
  style: sx = {},
}) => {
  const base = {
    border: "1px solid transparent",
    borderRadius: 10,
    cursor: (disabled || loading) ? "not-allowed" : "pointer",
    fontFamily: T.head,
    fontWeight: 600,
    transition: "all .2s cubic-bezier(0.2, 0.8, 0.2, 1)",
    padding: sm ? "6px 14px" : "11px 22px",
    fontSize: sm ? 12 : 13.5,
    opacity: (disabled || loading) ? 0.5 : 1,
    width: full ? "100%" : "auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    letterSpacing: "-0.01em",
    pointerEvents: (disabled || loading) ? "none" : "auto",
    ...sx,
  };
  const vs = {
    primary: { 
      background: T.accent, 
      color: "var(--accent-txt, #FFFFFF)",
      boxShadow: `0 4px 12px ${T.accent}40`,
    },
    secondary: {
      background: "var(--glass-bg)",
      color: T.txt,
      border: `1px solid var(--glass-border)`,
      backdropFilter: "var(--glass-blur)",
    },
    danger: {
      background: T.dLo,
      color: T.danger,
      border: `1px solid ${T.danger}25`,
    },
    ghost: {
      background: "transparent",
      color: T.dim,
      border: `1px solid transparent`,
    },
    ok: { background: T.oLo, color: T.ok, border: `1px solid ${T.ok}25` },
    gold: { background: T.gLo, color: T.gold, border: `1px solid ${T.gold}25` },
    warn: { background: T.wLo, color: T.warn, border: `1px solid ${T.warn}25` },
    blue: { background: T.bLo, color: T.blue, border: `1px solid ${T.blue}25` },
  };
  return (
    <button
      onClick={!loading ? onClick : undefined}
      disabled={disabled || loading}
      style={{ ...base, ...(vs[v] || vs.secondary) }}
      className="btn-modern"
    >
      {loading ? (
        <div style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      ) : (
        Icon && <Icon size={sm ? 14 : 16} strokeWidth={2.5} />
      )}
      {children}
    </button>
  );
};

// ── Back Button (apple-style) ──────────────────────────────
export const BackBtn = ({ onClick, disabled }) => (
  <button className="back-btn" onClick={onClick} disabled={disabled} style={{ width: 36, height: 34, justifyContent: 'center', padding: 0, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <ChevronLeft size={18} strokeWidth={2.5} />
  </button>
);

export const ForwardBtn = ({ onClick, disabled }) => (
  <button className="back-btn" onClick={onClick} disabled={disabled} style={{ width: 36, height: 34, justifyContent: 'center', padding: 0, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <ChevronRight size={18} strokeWidth={2.5} />
  </button>
);

// ── Refresh Button ─────────────────────────────────────────
// onRefresh: () => void  — called after spin animation; pass the actual
//            refresh action (reset filters, re-run status calc, etc.)
export const RefreshBtn = ({ onRefresh, onClick, style, className, loading, sm, ...rest }) => {
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);
  
  const refreshHandler = onRefresh || onClick;

  const doRefresh = (e) => {
    if (spinning || loading) return;
    setSpinning(true);
    setDone(false);
    SFX.notify();
    try {
      refreshHandler?.(e);
    } catch (e) {
      console.error('[RefreshBtn] Error during refresh:', e);
    }
    setTimeout(() => {
      setSpinning(false);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    }, 600);
  };

  return (
    <button
      className={`refresh-btn ${className || ""} ${sm ? "btn-sm" : ""}`}
      onClick={doRefresh}
      title="Refresh data"
      disabled={loading}
      style={{
        color: done ? T.accent : undefined,
        borderColor: done ? T.accent + "40" : undefined,
        cursor: loading ? "not-allowed" : "pointer",
        ...style,
      }}
      {...rest}
    >
      <RotateCcw
        size={sm ? 12 : 14}
        strokeWidth={2.5}
        style={{
          transition: "transform .7s cubic-bezier(.22,1,.36,1)",
          transform: spinning || loading ? "rotate(360deg)" : "rotate(0deg)",
          flexShrink: 0,
        }}
      />
    </button>
  );
};

// ── Country dial-code data ───────────────────────────────────
const DIAL_CODES = [
  { code: "+254", flag: "🇰🇪", name: "Kenya" },
  { code: "+255", flag: "🇹🇿", name: "Tanzania" },
  { code: "+256", flag: "🇺🇬", name: "Uganda" },
  { code: "+250", flag: "🇷🇼", name: "Rwanda" },
  { code: "+251", flag: "🇪🇹", name: "Ethiopia" },
  { code: "+1", flag: "🇺🇸", name: "USA/Canada" },
  { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+27", flag: "🇿🇦", name: "South Africa" },
  { code: "+234", flag: "🇳🇬", name: "Nigeria" },
  { code: "+233", flag: "🇬🇭", name: "Ghana" },
  { code: "+20", flag: "🇪🇬", name: "Egypt" },
  { code: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "+91", flag: "🇮🇳", name: "India" },
  { code: "+86", flag: "🇨🇳", name: "China" },
  { code: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "+33", flag: "🇫🇷", name: "France" },
  { code: "+61", flag: "🇦🇺", name: "Australia" },
];

// Normalise any phone to E.164 with the given dialCode
const normalisePhone = (raw, dialCode) => {
  if (!raw) return "";
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+")) return stripped; // already has code
  if (stripped.startsWith("00")) return "+" + stripped.slice(2);
  if (stripped.startsWith("0")) return dialCode + stripped.slice(1);
  return dialCode + stripped;
};

// Validate a phone string — accepts: +254xxxxxxxxx, 07xxxxxxxx, 01xxxxxxxx, +254 7xxxxxxxx
const isValidPhone = (raw) => {
  if (!raw) return false;
  const s = raw.replace(/[\s\-()]/g, "");
  return /^(\+\d{7,15}|0[17]\d{8})$/.test(s);
};

// PhoneInput — country selector + digits-only field
export const PhoneInput = ({
  label,
  value,
  onChange,
  required,
  half,
  placeholder,
}) => {
  const [dialCode, setDialCode] = useState("+254");
  const [open, setOpen] = useState(false);
  const inputRef = useRef();
  const containerRef = useRef();

  // Keep only digits and leading + in the raw field
  const handleRaw = (e) => {
    let v = e.target.value.replace(/[^\d+\s]/g, "");
    onChange(v);
  };

  const selectCode = (code) => {
    setDialCode(code);
    setOpen(false);
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const normalised = normalisePhone(value, dialCode);
  const hasErr = required && !isValidPhone(value) && value;
  const isMissing = required && !value;
  const flagEntry =
    DIAL_CODES.find((d) => d.code === dialCode) || DIAL_CODES[0];

  const borderColor = hasErr ? T.danger : isMissing ? T.danger : T.border;

  return (
    <div
      ref={containerRef}
      style={{
        marginBottom: 12,
        gridColumn: half ? "span 1" : "span 2",
        position: "relative",
        minWidth: 0,
        width: '100%'
      }}
    >
      {label && (
        <label
          style={{
            display: "block",
            color: hasErr || isMissing ? T.danger : T.dim,
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 5,
            letterSpacing: 0.7,
            textTransform: "uppercase",
          }}
        >
          {label}
          {required && <span style={{ color: T.danger }}> ★</span>}
        </label>
      )}
      <div
        style={{
          display: "flex",
          borderRadius: 8,
          border: `1px solid ${borderColor}`,
          overflow: "visible",
          background: T.surface,
          transition: "border-color .2s",
        }}
      >
        {/* Country code button */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "10px 8px",
            background: "transparent",
            border: "none",
            borderRight: `1px solid ${T.border}`,
            cursor: "pointer",
            flexShrink: 0,
            color: T.txt,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: T.mono,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 16 }}>{flagEntry.flag}</span>
          <span>{dialCode}</span>
          <span style={{ color: T.muted, fontSize: 10 }}>▾</span>
        </button>
        {/* Number input — digits only */}
        <input
          ref={inputRef}
          inputMode="numeric"
          value={value}
          onChange={handleRaw}
          placeholder={
            placeholder ||
            (dialCode === "+254" ? "0712 345 678" : "Phone number")
          }
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            padding: "10px 12px",
            color: T.txt,
            fontSize: 14,
            outline: "none",
            fontFamily: T.body,
            minWidth: 0,
          }}
        />
      </div>
      {/* Dropdown */}
      {open && (
        <div
          className="pop-in"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 9999,
            background: "var(--card)",
            backdropFilter: "blur(30px)",
            WebkitBackdropFilter: "blur(30px)",
            border: `1px solid var(--border)`,
            borderRadius: 16,
            boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            width: 220,
            maxHeight: 220,
            overflowY: "auto",
            marginTop: 8,
            padding: 4,
          }}
        >
          {DIAL_CODES.map((d) => (
            <div
              key={d.code}
              onClick={() => selectCode(d.code)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 14px",
                cursor: "pointer",
                background: d.code === dialCode ? "var(--a-lo)" : "transparent",
                color: d.code === dialCode ? "var(--accent)" : "var(--txt)",
                transition: "all .1s",
                borderRadius: 12,
                marginBottom: 2
              }}
              onMouseEnter={(e) => {
                if (d.code !== dialCode) e.currentTarget.style.background = "var(--surface)";
              }}
              onMouseLeave={(e) => {
                if (d.code !== dialCode) e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: 18 }}>{d.flag}</span>
              <span style={{ color: d.code === dialCode ? "var(--accent)" : "var(--txt)", fontSize: 12, fontWeight: 600, transition: "color .1s" }}>
                {d.name}
              </span>
              <span
                style={{
                  color: d.code === dialCode ? "var(--accent)" : "var(--muted)",
                  fontSize: 11,
                  marginLeft: "auto",
                  fontFamily: T.mono,
                  transition: "color .1s"
                }}
              >
                {d.code}
              </span>
            </div>
          ))}
        </div>
      )}
      {hasErr && (
        <div style={{ color: T.danger, fontSize: 11, marginTop: 3 }}>
          ⚠ Enter a valid phone number
        </div>
      )}
      {isMissing && (
        <div style={{ color: T.danger, fontSize: 11, marginTop: 3 }}>
          ⚠ Phone number is required
        </div>
      )}
      {!hasErr && !isMissing && normalised && normalised !== value && (
        <div style={{ color: T.muted, fontSize: 10, marginTop: 3 }}>
          Will be stored as {normalised}
        </div>
      )}
    </div>
  );
};

// NumericInput — accepts digits only (for National ID, amounts, etc.)
export const NumericInput = ({
  label,
  value,
  onChange,
  required,
  half,
  placeholder,
  hint,
}) => {
  const hasErr = required && !value;
  const handleChange = (e) => {
    const v = e.target.value.replace(/\D/g, "");
    if (v !== e.target.value) {
      try {
        SFX.error();
      } catch (x) {}
    }
    onChange(v);
  };
  const s = {
    width: "100%",
    background: T.surface,
    border: `1px solid ${hasErr ? T.danger : T.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    color: T.txt,
    fontSize: 14,
    outline: "none",
    fontFamily: T.mono,
    transition: "border-color .2s",
    letterSpacing: 0.5,
  };
  return (
    <div
      style={{
        marginBottom: 12,
        gridColumn: half ? "span 1" : "span 2",
        minWidth: 0,
        overflow: "visible",
      }}
    >
      {label && (
        <label
          style={{
            display: "block",
            color: hasErr ? T.danger : T.dim,
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 5,
            letterSpacing: 0.7,
            textTransform: "uppercase",
          }}
        >
          {label}
          {required && <span style={{ color: T.danger }}> ★</span>}
        </label>
      )}
      <input
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        placeholder={placeholder || "Numbers only"}
        style={s}
      />
      {hasErr && (
        <div style={{ color: T.danger, fontSize: 11, marginTop: 3 }}>
          ⚠ This field is required
        </div>
      )}
      {hint && !hasErr && (
        <div style={{ color: T.muted, fontSize: 11, marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
};

// Enhanced FI with red-star required validation
const parseLocalDate = (s) => {
  if (!s) return new Date();
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
};

export const ModernDatePicker = ({ value, onChange, onClose, T }) => {
  const [viewDate, setViewDate] = useState(() => parseLocalDate(value));
  
  useEffect(() => {
    if (value) {
      const d = parseLocalDate(value);
      setViewDate(d);
    }
  }, [value]);

  const month = viewDate.getMonth();
  const year = viewDate.getFullYear();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay(); // 0-6 (Sun-Sat)
  
  const updateParent = (nextDate) => {
    const offset = nextDate.getTimezoneOffset();
    const adjusted = new Date(nextDate.getTime() - (offset * 60 * 1000));
    onChange(adjusted.toISOString().split('T')[0]);
  };

  const setMonth = (m) => {
    const nextM = parseInt(m);
    const maxD = new Date(year, nextM + 1, 0).getDate();
    const nextDate = new Date(year, nextM, Math.min(viewDate.getDate(), maxD));
    updateParent(nextDate);
  };
  const setYear = (y) => {
    const nextY = parseInt(y);
    if (!isNaN(nextY)) {
      const maxD = new Date(nextY, month + 1, 0).getDate();
      const nextDate = new Date(nextY, month, Math.min(viewDate.getDate(), maxD));
      updateParent(nextDate);
    }
  };
  const prevMonth = () => {
    const nextDate = new Date(year, month - 1, 1);
    updateParent(nextDate);
  };
  const nextMonth = () => {
    const nextDate = new Date(year, month + 1, 1);
    updateParent(nextDate);
  };

  const selectDay = (d) => {
    const selected = new Date(year, month, d);
    const offset = selected.getTimezoneOffset();
    const adjusted = new Date(selected.getTime() - (offset * 60 * 1000));
    onChange(adjusted.toISOString().split('T')[0]);
    onClose();
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  
  // Broad "all years" range (1900 to 2100) behaving like standard OS date pickers
  const years = Array.from({ length: 201 }, (_, i) => 1900 + i);

  return (
    <div className="cal-pop pop" onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="cal-sel-wrap">
          <select value={month} onChange={e => setMonth(e.target.value)} className="cal-sel">
            {monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(e.target.value)} className="cal-sel">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={prevMonth} className="btn-icon" style={{ padding: 6, color: T.dim }}><ChevronLeft size={16} /></button>
          <button onClick={nextMonth} className="btn-icon" style={{ padding: 6, color: T.dim, transform: 'rotate(180deg)' }}><ChevronLeft size={16} /></button>
        </div>
      </div>
      <div className="cal-grid">
        {days.map(d => <div key={d} className="cal-head-day">{d}</div>)}
        {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} className="cal-day empty" />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = (i + 1).toString().padStart(2, '0');
          const m = (month + 1).toString().padStart(2, '0');
          const dateStr = `${year}-${m}-${d}`;
          const isToday = now() === dateStr;
          const isActive = value === dateStr;
          return (
            <div 
              key={i} 
              className={`cal-day ${isToday ? 'today' : ''} ${isActive ? 'active' : ''}`}
              onClick={() => selectDay(i + 1)}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const FI = ({
  label,
  value,
  onChange,
  type = "text",
  options,
  required,
  placeholder,
  hint,
  half,
  error,
  min,
  max,
  name,
  defaultValue,
  onKeyDown,
  autoFocus,
  variant = 'base' // Add variant support
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [showSelect, setShowSelect] = useState(false);
  const [search, setSearch] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!showPicker && !showSelect) return;
    const clickOut = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowPicker(false);
        setShowSelect(false);
      }
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, [showPicker, showSelect]);

  const hasErr = !!(error && required && !value);

  // v2.0 Fix: Do not concatenate CSS variables with hex opacity. 
  // Use the variables directly or standard colors.
  const inputStyle = {
    width: "100%",
    padding: "11px 16px",
    borderRadius: 14,
    border: `1.5px solid ${hasErr ? 'rgba(239, 68, 68, 0.5)' : isFocused ? 'var(--accent)' : 'rgba(0, 0, 0, 0.1)'}`,
    background: isFocused ? 'var(--surface)' : 'var(--card)',
    backdropFilter: 'blur(10px)',
    color: 'var(--txt)',
    fontSize: 14,
    fontWeight: 500,
    outline: "none",
    transition: "all .25s ease",
    boxShadow: isFocused ? '0 0 0 4px rgba(0, 212, 170, 0.15)' : 'none',
  };

  const handleChange = (e) => {
    if (onChange) onChange(e.target.value);
  };

  return (
    <div
      ref={containerRef}
      style={{
        marginBottom: 16,
        gridColumn: half ? "span 1" : "span 2",
        minWidth: 0,
        position: 'relative'
      }}
    >
      {label && (
        <label
          style={{
            display: "block",
            color: hasErr ? T.danger : isFocused ? T.accent : T.muted,
            fontSize: 10,
            fontWeight: 800,
            marginBottom: 6,
            marginLeft: 4,
            letterSpacing: '0.05em',
            textTransform: "uppercase",
            transition: 'color 0.2s',
          }}
        >
          {label}
          {required && <span style={{ color: T.danger }}> *</span>}
        </label>
      )}

      <div style={{ position: 'relative' }}>
        {type === "date" ? (
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              name={name}
              readOnly
              value={value || ''}
              onClick={() => setShowPicker(!showPicker)}
              placeholder={placeholder || 'Select date...'}
              style={{ ...inputStyle, cursor: 'pointer', paddingRight: 40 }}
            />
            <div 
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: T.accent, opacity: 0.8 }}
            >
              <Calendar size={18} />
            </div>
            {showPicker && <ModernDatePicker value={value} onChange={onChange} onClose={() => setShowPicker(false)} T={T} />}
          </div>
        ) : type === "select" ? (
          <div style={{ position: 'relative' }}>
            {/* Display Field */}
            <div
              onClick={() => setShowSelect(!showSelect)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              tabIndex={0}
              style={{ 
                ...inputStyle, 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                paddingRight: 12
              }}
            >
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value ? (() => {
                  const found = options?.find(o => (typeof o === 'object' ? (o.v !== undefined ? o.v : o.value) : o) === value);
                  if (!found) return value;
                  if (typeof found === 'string') return found;
                  return found.l || found.label || found.v || found.value || String(value);
                })() : <span style={{ opacity: 0.5 }}>{placeholder || '— Select —'}</span>}
              </div>
              <ChevronDown size={14} style={{ opacity: 0.6, flexShrink: 0, transform: showSelect ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
            {/* Hidden native input so FormData.get(name) works on form submit */}
            {name && <input type="hidden" name={name} value={value ?? ''} readOnly />}

            {/* Custom List Dropdown */}
            {showSelect && (
              <div 
                className="pop-in"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 8,
                  background: 'var(--card)',
                  backdropFilter: 'blur(30px)',
                  WebkitBackdropFilter: 'blur(30px)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                  zIndex: 9999,
                  maxHeight: 350,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Search if many items */}
                {(options || []).length > 8 && (
                  <div style={{ padding: 12, borderBottom: '1px solid var(--hi)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text"
                        autoFocus
                        placeholder="Type to filter..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: '100%', padding: '8px 12px 8px 34px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--txt)', fontSize: 13
                        }}
                      />
                      <SearchIcon size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                    </div>
                  </div>
                )}

                <div style={{ overflowY: 'auto', flex: 1, padding: 8, WebkitOverflowScrolling: 'touch' }}>
                  {(options || [])
                    .filter(o => {
                      if (!search) return true;
                      const lbl = typeof o === 'object' ? (o.l || o.label) : String(o);
                      return lbl.toLowerCase().includes(search.toLowerCase());
                    })
                    .map((o, i) => {
                      const lbl = typeof o === 'object' ? (o.l || o.label) : o;
                      const val = typeof o === 'object' ? (o.v !== undefined ? o.v : o.value) : o;
                      const isSel = value === val;
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            if (onChange) onChange(val);
                            setShowSelect(false);
                            setSearch('');
                          }}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 12,
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: isSel ? 700 : 500,
                            color: isSel ? 'var(--accent)' : 'var(--txt)',
                            background: isSel ? 'var(--a-lo)' : 'transparent',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 2
                          }}
                          onMouseEnter={e => !isSel && (e.currentTarget.style.background = 'var(--surface)')}
                          onMouseLeave={e => !isSel && (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ flex: 1 }}>{lbl}</div>
                          {isSel && <Check size={14} />}
                        </div>
                      );
                    })}
                  {(options || []).length > 0 && (options || []).filter(o => {
                    const lbl = typeof o === 'object' ? (o.l || o.label) : String(o);
                    return !search || lbl.toLowerCase().includes(search.toLowerCase());
                  }).length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: T.muted, fontSize: 12 }}>No matching results found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : type === "textarea" ? (
          <textarea
            name={name}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            placeholder={placeholder}
            rows={3}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
          />
        ) : (
          <input
            type={type}
            name={name}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            placeholder={placeholder}
            autoComplete={type === "password" ? "new-password" : undefined}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={onKeyDown}
            style={{ ...inputStyle, WebkitTextFillColor: 'var(--txt)', caretColor: 'var(--txt)' }}
          />
        )}
      </div>

      {hasErr && (
        <div style={{ color: T.danger, fontSize: 11, marginTop: 4, fontWeight: 700 }}>
          ⚠ Required field
        </div>
      )}
      {hint && !hasErr && (
        <div style={{ color: T.muted, fontSize: 11, marginTop: 4, fontWeight: 500 }}>{hint}</div>
      )}
    </div>
  );
};

// Kenyan Phone Validation Utility (07XXXXXXXX or 01XXXXXXXX)
const isPhoneValid = (p) => {
  if (!p) return false;
  const clean = String(p).replace(/\D/g, "");
  return clean.length === 10 && clean.startsWith("0");
};

const getAge = (dob) => {
  if (!dob) return 0;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

// useToast defined in SOUND ENGINE above

export const ToastContainer = ({ toasts }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Notifications"
      style={{
        position: "fixed",
        top: 16,
      left: 0,
      right: 0,
      zIndex: 999999,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 12,
      padding: "0 16px",
      pointerEvents: "none",
    }}
  >
    {toasts.map((t) => {
      const isAllocation = t.msg.toLowerCase().includes("allocated");
      const cols = {
        ok: [T.ok, T.oLo],
        danger: [T.danger, T.dLo],
        warn: [T.warn, T.wLo],
        info: [T.blue, T.bLo],
      };
      const [c, bg] = cols[t.type] || cols.ok;
      
      return (
        <div
          key={t.id}
          role="alert"
          aria-live={t.type === "danger" ? "assertive" : "polite"}
          className="apple-toast"
          style={{
            background: isAllocation ? 'rgba(12, 18, 30, 0.85)' : bg,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: isAllocation ? `1px solid rgba(255,255,255,0.12)` : `1px solid ${bg}`,
            borderRadius: 16,
            padding: "14px 20px",
            color: isAllocation ? '#fff' : c,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)`,
            width: "fit-content",
            minWidth: 280,
            maxWidth: "90vw",
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 99, 
            background: isAllocation ? T.accent : c, 
            color: isAllocation ? '#000' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: isAllocation ? `0 4px 12px var(--a-mid)` : `0 4px 12px ${bg}`
          }}>
            {t.type === 'danger' ? '✕' : <Check size={16} strokeWidth={3} />}
          </div>
          <div style={{ flex: 1 }}>
            {isAllocation && <div style={{ fontSize: 10, fontWeight: 800, color: T.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>System Confirmation</div>}
            <div style={{ lineHeight: 1.4 }}>{t.msg}</div>
          </div>
        </div>
      );
    })}
  </div>,
  document.body
  );
};
export const Alert = ({ type = "warn", children }) => {
  const m = {
    warn: ['#F59E0B', 'rgba(245, 158, 11, 0.08)'],
    danger: ['#EF4444', 'rgba(239, 68, 68, 0.08)'],
    ok: ['#10B981', 'rgba(16, 185, 129, 0.08)'],
    info: ['#3B82F6', 'rgba(59, 130, 246, 0.08)'],
  };
  const [c, bg] = m[type] || m.warn;
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${c}38`,
        borderRadius: 9,
        padding: "10px 13px",
        color: c,
        fontSize: 13,
        marginBottom: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
};

// ── Global modal scroll lock v1.7.1 — class-based, ref-counted ──
let _modalCount = 0;
export const useModalLock = () => {
  useEffect(() => {
    _modalCount++;
    if (_modalCount === 1) {
      // Capture current scroll so position:fixed doesn't jump
      const scrollY = window.scrollY;
      document.body.style.top = `-${scrollY}px`;
      document.body.classList.add("modal-open");
    }
    return () => {
      _modalCount--;
      if (_modalCount === 0) {
        const scrollY = -parseInt(document.body.style.top || "0");
        document.body.classList.remove("modal-open");
        document.body.style.top = "";
        window.scrollTo(0, scrollY);
      }
    };
  }, []);
};

// ── Safe top position — always 16px below topbar, never mid-page ─
export const MODAL_TOP_OFFSET = 16; // px gap from top of viewport
const MODAL_BOT_PAD = 24; // safe gap at bottom — prevents last form field being clipped
export const Dialog = ({
  title,
  children,
  onClose,
  width = 520,
  minHeight,
  zIndex = 100000,
}) => {
  useModalLock();
  const dialogRef = useRef(null);
  const titleId = useRef(
    "dlg-" + Math.random().toString(36).slice(2, 7),
  ).current;
  const contentRef = useRef(null);

  // Reset scroll to top whenever title or children change (indicates a new view/tab)
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [title]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 600;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const isMobileSize = vw < 600;
  const mw = Math.min(width, vw - 16);
  const maxH = Math.min(
    vh - MODAL_TOP_OFFSET - MODAL_BOT_PAD,
    Math.round(vh * 0.92),
  );

  // ROOT CAUSE FIX A — Focus theft bug:
  // The original useEffect had [onClose] as its dependency. Every call site passes an
  // inline arrow like onClose={()=>setState(null)}, which is a NEW function reference on
  // every parent render. Every keystroke → parent re-renders → new onClose reference →
  // effect re-fires → first.focus() is called → focus is stolen from the active input
  // and given to the first focusable element (the ✕ button). This is why typing one
  // character caused focus loss and the ✕ button became highlighted.
  //
  // Fix: store onClose in a ref (always current, never changes identity) and split into
  // two effects: one mount-only for auto-focus, one stable for the keydown handler.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }); // keep ref current every render

  // Mount-only: auto-focus the first focusable element exactly once
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const first = el.querySelector(
      'button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    if (first) first.focus();
  }, []); // ← empty deps: runs once on mount, NEVER re-runs on parent re-renders

  // Stable keydown handler: deps are empty so this never re-registers
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = [
        ...el.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []); // ← empty deps: registers once, reads latest onClose via ref

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="dialog-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex,
        display: "flex",
        alignItems: isMobileSize ? "center" : "flex-start",
        justifyContent: "center",
        padding: isMobileSize ? `0 6px` : `${MODAL_TOP_OFFSET}px 8px ${MODAL_BOT_PAD}px`,
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        background: "rgba(4,8,16,0.82)",
        overflowY: "auto",
        overflowX: "hidden",
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pop"
        style={{
          background: T.card,
          border: `1px solid ${T.hi}`,
          borderRadius: isMobileSize ? 20 : 18,
          width: "100%",
          maxWidth: mw,
          maxHeight: isMobileSize ? 'calc(100svh - 24px)' : maxH,
          minHeight: minHeight || undefined,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 40px 80px #000000D0",
          flexShrink: 0,
          overflowX: "hidden",
          overflowY: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 16px",
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
            background: T.card,
            borderRadius: "18px 18px 0 0",
          }}
        >
          <h3
            id={titleId}
            style={{
              color: T.txt,
              fontSize: 15,
              fontWeight: 800,
              fontFamily: T.head,
              margin: 0,
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: T.card2,
              border: `1px solid ${T.border}`,
              color: T.muted,
              borderRadius: 99,
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div
          ref={contentRef}
          style={{
            overflowY: "auto",
            padding: "14px 16px 32px",
            flex: 1,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export const WaitingOverlay = ({ title, message, sub, type = 'info', onClose }) => {
  useModalLock();
  if (typeof document === 'undefined') return null;
  const isErr = type === 'danger';
  const isOk = type === 'success';
  
  return createPortal(
    <div style={{ 
      position: 'fixed', inset: 0, zIndex: 99999, 
      background: 'rgba(3, 5, 12, 0.88)', backdropFilter: 'blur(24px)', 
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 
    }}>
      <div 
        className="pop" 
        style={{ 
          maxWidth: 440, width: '100%', 
          background: 'linear-gradient(165deg, rgba(30, 35, 45, 0.95), rgba(10, 12, 18, 0.98))', 
          borderRadius: 40, border: `1px solid ${isErr ? T.danger + '60' : isOk ? T.ok + '60' : T.accent + '30'}`, 
          padding: '56px 40px', textAlign: 'center', 
          boxShadow: `0 40px 120px rgba(0,0,0,0.9), 0 0 80px ${isErr ? T.danger : isOk ? T.ok : T.accent}10`,
          position: 'relative', overflow: 'hidden'
        }}
      >
        {/* Ambient Glows */}
        <div style={{ position: 'absolute', top: -100, right: -100, width: 200, height: 200, background: `${isErr ? T.danger : isOk ? T.ok : T.accent}15`, filter: 'blur(80px)', borderRadius: '50%' }} />
        
        <div style={{ marginBottom: 40, position: 'relative', display: 'inline-block' }}>
           {isErr ? (
             <div style={{ width: 92, height: 92, borderRadius: '50%', background: `${T.danger}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.danger, border: `2px solid ${T.danger}40`, boxShadow: `0 0 30px ${T.danger}30` }}>
               <X size={44} strokeWidth={2.5} />
             </div>
           ) : isOk ? (
              <div style={{ width: 92, height: 92, borderRadius: '50%', background: `${T.ok}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ok, border: `2px solid ${T.ok}40`, boxShadow: `0 0 30px ${T.ok}30` }}>
                <Check size={44} strokeWidth={2.5} />
              </div>
           ) : (
             <div style={{ position: 'relative', width: 92, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, border: `3px solid ${T.accent}15`, borderRadius: '50%' }} />
                <div style={{ position: 'absolute', inset: 0, border: `3px solid ${T.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite' }} />
                <div style={{ 
                  width: 64, height: 64, borderRadius: '50%', 
                  background: `linear-gradient(135deg, ${T.accent}30, ${T.accent}10)`, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  fontSize: 28, color: T.accent,
                  boxShadow: `0 0 20px ${T.accent}40`
                }}>
                   <Rocket size={28} />
                </div>
             </div>
           )}
        </div>

        <h2 style={{ 
          color: '#fff', fontSize: 22, fontWeight: 900, 
          fontFamily: T.head, margin: '0 0 12px', 
          textTransform: 'uppercase', letterSpacing: '0.15em',
          background: 'linear-gradient(to bottom, #fff, #94a3b8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          {title}
        </h2>
        
        <div style={{ color: isErr ? T.danger : isOk ? T.ok : '#cbd5e1', fontSize: 16, fontWeight: 500, lineHeight: 1.6, marginBottom: 40 }}>
           {message}
           {sub && (
             <div style={{ 
               color: T.muted, fontSize: 11, marginTop: 16, 
               fontFamily: T.mono, opacity: 0.8, 
               background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 12,
               border: '1px solid rgba(255,255,255,0.05)', display: 'inline-block'
             }}>
               {sub}
             </div>
           )}
        </div>

        {isErr || isOk ? (
          <Btn onClick={onClose} full v={isErr ? 'danger' : 'ok'} style={{ height: 60, borderRadius: 20, fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
            {isErr ? 'Dismiss & Review' : 'Continue'}
          </Btn>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              color: T.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 800, opacity: 0.6 
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, animation: 'pulse 1.5s infinite' }} />
              System Handshake In Progress
            </div>
            {onClose && (
               <button 
                 onClick={onClose} 
                 style={{ 
                   background: 'none', border: 'none', color: T.muted, 
                   fontSize: 12, fontWeight: 700, cursor: 'pointer',
                   opacity: 0.5, transition: 'opacity 0.2s'
                 }}
                 onMouseEnter={e => e.currentTarget.style.opacity = 1}
                 onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
               >
                 Cancel Operation
               </button>
            )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { opacity: 0.4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.4; transform: scale(0.8); } }
      `}</style>
    </div>,
    document.body
  );
};

// Side panel — slides in from right, feels part of the page
const Panel = ({
  title,
  subtitle,
  onClose,
  children,
  width = 500,
  zIndex = 9900,
}) => {
  useModalLock();
  const panelRef = useRef(null);
  const titleId = useRef(
    "pnl-" + Math.random().toString(36).slice(2, 7),
  ).current;
  const vw = typeof window !== "undefined" ? window.innerWidth : 600;
  const w = Math.min(width, vw);

  // ROOT CAUSE FIX A (Panel) — same focus-theft pattern as Dialog.
  // useEffect([onClose]) re-fires on every inline-arrow onClose change → first.focus() steals focus.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const first = el.querySelector(
      'button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    if (first) first.focus();
  }, []);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = [
        ...el.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex,
        display: "flex",
        justifyContent: "flex-end",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4,8,16,0.45)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel-in"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: w,
          background: T.card,
          borderLeft: `1px solid ${T.hi}`,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-24px 0 64px #00000080",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "20px 22px 16px",
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
            background: T.card,
            zIndex: 10,
          }}
        >
          <div>
            <h3
              id={titleId}
              style={{
                color: T.txt,
                fontSize: 16,
                fontWeight: 800,
                fontFamily: T.head,
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <div style={{ color: T.muted, fontSize: 12, marginTop: 4 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: T.card2,
              border: `1px solid ${T.border}`,
              color: T.muted,
              borderRadius: 99,
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginLeft: 12,
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div
          style={{
            flex: 1,
            padding: "20px 22px 48px",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
// ── DT v1.7.1: fixed-height shell + virtual scroll + pagination ──
const DT_ROW_H = 44; // px height per row — keep in sync with td padding
const DT_MAX_H_VH = 0.48; // default container max-height as % of viewport
const DT_PAGE_SIZE = 60; // rows per page before pagination activates
const DT_VIRT_THR = 120; // rows before virtual scroll activates

// Shared thead — used by all three DT variants
const DTHead = ({ cols }) => (
  <thead>
    <tr>
      {cols.map((c, i) => (
        <th
          key={`${c.k || c.l}-${i}`}
          style={{
            color: T.muted,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1,
            textTransform: "uppercase",
            padding: "10px 13px",
            textAlign: "left",
            borderBottom: `1px solid ${T.border}`,
            whiteSpace: "nowrap",
            position: "sticky",
            top: 0,
            background: T.card,
            zIndex: 2,
          }}
        >
          {c.l}
        </th>
      ))}
    </tr>
  </thead>
);

// Shared row renderer — used by all three DT variants
const DTRow = ({ cols, row, idx, onRow }) => (
  <tr
    className={`fu ${onRow ? "row-hover" : ""}`}
    onClick={() => onRow && onRow(row)}
    style={{
      borderBottom: `1px solid ${T.border}18`,
      cursor: onRow ? "pointer" : "default",
    }}
  >
    {cols.map((c, j) => (
      <td
        key={j}
        style={{ padding: "10px 13px", color: T.txt, verticalAlign: "middle" }}
      >
        {c.r ? c.r(row[c.k], row) : (row[c.k] ?? "—")}
      </td>
    ))}
  </tr>
);

// ── DTSmall — for ≤DT_PAGE_SIZE rows: 40vh scroll container ──
const DTSmall = ({ cols, rows, onRow, emptyMsg }) => (
  <div style={{ maxHeight: "40vh", overflowY: "auto", overflowX: "auto" }}>
    <table
      style={{
        width: "100%",
        minWidth: 520,
        borderCollapse: "collapse",
        fontSize: 13,
      }}
    >
      <DTHead cols={cols} />
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={cols.length}>
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <div style={{ display:'flex', justifyContent:'center', marginBottom: 8, opacity: 0.35 }}>
                  <FileText size={32} />
                </div>
                <div style={{ color: T.muted, fontSize: 13, fontWeight: 500 }}>
                  {emptyMsg}
                </div>
                <div style={{ color: T.dim, fontSize: 11, marginTop: 4 }}>
                  Try adjusting your filters or search terms
                </div>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <DTRow
              key={row.id || row.key || i}
              cols={cols}
              row={row}
              idx={i}
              onRow={onRow}
            />
          ))
        )}
      </tbody>
    </table>
  </div>
);

// ── DTPaged — for >DT_PAGE_SIZE rows: paginated, 40vh scroll container ──
const DTPaged = ({ cols, rows, onRow, emptyMsg }) => {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  const totalPages = Math.ceil(rows.length / DT_PAGE_SIZE);
  const slice = rows.slice(page * DT_PAGE_SIZE, (page + 1) * DT_PAGE_SIZE);
  const from = page * DT_PAGE_SIZE + 1;
  const to = Math.min((page + 1) * DT_PAGE_SIZE, rows.length);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ maxHeight: "40vh", overflowY: "auto", overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 520,
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <DTHead cols={cols} />
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={cols.length}>
                  <div style={{ padding: "32px 16px", textAlign: "center" }}>
                    <div style={{ display:'flex', justifyContent:'center', marginBottom: 8, opacity: 0.35 }}>
                      <FileText size={32} />
                    </div>
                    <div
                      style={{ color: T.muted, fontSize: 13, fontWeight: 500 }}
                    >
                      {emptyMsg}
                    </div>
                    <div style={{ color: T.dim, fontSize: 11, marginTop: 4 }}>
                      Try adjusting your filters or search terms
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              slice.map((row, i) => (
                <DTRow
                  key={row.id || row.key || page * DT_PAGE_SIZE + i}
                  cols={cols}
                  row={row}
                  idx={page * DT_PAGE_SIZE + i}
                  onRow={onRow}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 13px",
          borderTop: `1px solid ${T.border}`,
          background: T.surface,
          flexWrap: "wrap",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <span style={{ color: T.muted, fontSize: 12 }}>
          {from.toLocaleString()}–{to.toLocaleString()} of{" "}
          {rows.length.toLocaleString()}
        </span>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {[
            ["«", 0, page === 0],
            ["‹", page - 1, page === 0],
          ].map(([lbl, pg, dis]) => (
            <button
              key={lbl}
              onClick={() => setPage(pg)}
              disabled={dis}
              style={{
                background: T.card2,
                border: `1px solid ${T.border}`,
                color: T.muted,
                borderRadius: 5,
                padding: "3px 8px",
                cursor: dis ? "default" : "pointer",
                fontSize: 11,
                opacity: dis ? 0.35 : 1,
              }}
            >
              {lbl}
            </button>
          ))}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p =
              page < 2
                ? i
                : page > totalPages - 3
                  ? totalPages - 5 + i
                  : page - 2 + i;
            if (p < 0 || p >= totalPages) return null;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  background: p === page ? T.accent : T.card2,
                  color: p === page ? "#060A10" : T.muted,
                  border: `1px solid ${p === page ? T.accent : T.border}`,
                  borderRadius: 5,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: p === page ? 800 : 400,
                }}
              >
                {p + 1}
              </button>
            );
          })}
          {[
            ["›", page + 1, page >= totalPages - 1],
            ["»", totalPages - 1, page >= totalPages - 1],
          ].map(([lbl, pg, dis]) => (
            <button
              key={lbl}
              onClick={() => setPage(pg)}
              disabled={dis}
              style={{
                background: T.card2,
                border: `1px solid ${T.border}`,
                color: T.muted,
                borderRadius: 5,
                padding: "3px 8px",
                cursor: dis ? "default" : "pointer",
                fontSize: 11,
                opacity: dis ? 0.35 : 1,
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── DTVirtual — for >DT_VIRT_THR rows: true O(1) DOM virtual scroll ──
const DTVirtual = ({ cols, rows, onRow, maxH }) => {
  const [startIdx, setStartIdx] = useState(0);
  const wrapRef = useRef(null);
  const rafRef = useRef(null);

  const visCount = Math.ceil(maxH / DT_ROW_H) + 16; // visible rows + generous overscan buffer

  useEffect(() => {
    setStartIdx(0);
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.scrollTop = 0;
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (wrapRef.current) {
          // Overscan by 8 rows above visible area for smoother upward scrolling
          setStartIdx(
            Math.max(0, Math.floor(wrapRef.current.scrollTop / DT_ROW_H) - 8),
          );
        }
      });
    };
    wrap.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      wrap.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rows]);

  const start = startIdx;
  const end = Math.min(rows.length, start + visCount);
  const slice = rows.slice(start, end);
  const topPad = start * DT_ROW_H;
  const botPad = (rows.length - end) * DT_ROW_H;

  return (
    <div>
      <div
        style={{
          padding: "4px 13px 6px",
          color: T.muted,
          fontSize: 11,
          borderBottom: `1px solid ${T.border}18`,
        }}
      >
        {rows.length.toLocaleString()} records
      </div>
      <div
        ref={wrapRef}
        style={{
          overflowY: "auto",
          overflowX: "auto",
          height: maxH,
          WebkitOverflowScrolling: "touch",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 520,
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <DTHead cols={cols} />
          <tbody>
            {topPad > 0 && (
              <tr style={{ height: topPad }}>
                <td colSpan={cols.length} style={{ padding: 0 }}></td>
              </tr>
            )}
            {slice.map((row, i) => (
              <DTRow
                key={row.id || row.key || start + i}
                cols={cols}
                row={row}
                idx={start + i}
                onRow={onRow}
              />
            ))}
            {botPad > 0 && (
              <tr style={{ height: botPad }}>
                <td colSpan={cols.length} style={{ padding: 0 }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── DT — smart router: picks Small / Virtual / Paged ──────────
export const DT = ({
  cols,
  rows,
  onRow,
  emptyMsg = "No records found.",
  maxHeightVh = DT_MAX_H_VH,
}) => {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);

  const useVirtual = rows.length > DT_VIRT_THR;
  const usePaging = rows.length > DT_PAGE_SIZE && !useVirtual;

  if (useVirtual) {
    const maxH =
      typeof window !== "undefined"
        ? Math.round(window.innerHeight * maxHeightVh)
        : 400;
    return <DTVirtual cols={cols} rows={rows} onRow={onRow} maxH={maxH} />;
  }
  if (usePaging)
    return (
      <DTPaged cols={cols} rows={rows} onRow={onRow} emptyMsg={emptyMsg} />
    );
  return <DTSmall cols={cols} rows={rows} onRow={onRow} emptyMsg={emptyMsg} />;
};
export const Search = ({ value, onChange, placeholder, debounceMs = 180 }) => {
  const [local, setLocal] = useState(value);
  // Sync external value → local (e.g. when parent resets)
  useEffect(() => {
    setLocal(value);
  }, [value]);
  // Debounce: only call onChange after user stops typing
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value && typeof onChange === "function") onChange(local);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [local, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      style={{ position: "relative", width: "100%", maxWidth: 400 }}
      role="search"
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 11,
          top: "50%",
          transform: "translateY(-50%)",
          color: T.muted,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center"
        }}
      >
        <SearchIcon size={15} strokeWidth={2.5} />
      </span>
      <label className="sr-only" htmlFor={`search-${placeholder || "q"}`}>
        {placeholder || "Search"}
      </label>
      <input
        id={`search-${placeholder || "q"}`}
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder || "Search…"}
        onFocus={(e) => {
          e.target.style.borderColor = T.accent;
          e.target.style.background = T.card;
          e.target.style.boxShadow = `0 0 0 4px ${T.accent}15`;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = T.border;
          e.target.style.background = T.card2;
          e.target.style.boxShadow = 'none';
        }}
        aria-label={placeholder || "Search"}
        style={{
          background: T.card2,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: "10px 12px 10px 40px",
          color: T.txt,
          fontSize: 13,
          outline: "none",
          width: "100%",
          transition: 'all 0.2s ease'
        }}
      />
    </div>
  );
};
export const Pills = ({ opts = [], val, onChange, sm }) => (
  <div style={{ 
    display: "flex", 
    width: "100%",
    background: T.surface, 
    padding: 4, 
    borderRadius: 14, 
    gap: 4,
    border: `1px solid ${T.border}`,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    paddingRight: 12
  }}>
    {opts.map((o, idx) => {
      const isObj = typeof o === 'object' && o !== null;
      const oVal = isObj ? (o.v ?? o.id) : o;
      const oLabel = isObj ? (o.l ?? o.name ?? o.v) : o;
      const isActive = oVal === val;
      
      return (
        <button
          key={`pill-${oVal}-${idx}`}
          onClick={() => onChange(oVal)}
          style={{
            background: isActive ? T.accent : 'transparent',
            color: isActive ? "#060A10" : T.muted,
            border: 'none',
            borderRadius: 10,
            padding: sm ? "6px 12px" : "8px 16px",
            fontSize: sm ? 11 : 12,
            fontWeight: 800,
            cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0
          }}
        >
          {oLabel}
        </button>
      );
    })}
  </div>
);


// ── Document lightbox viewer ──────────────────────────────────
export const DocViewer = ({ doc, onClose }) => {
  useModalLock();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Document viewer — ${doc.name}`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.94)",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: MODAL_TOP_OFFSET,
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close document viewer"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "#ffffff20",
          border: "none",
          color: "#fff",
          borderRadius: 99,
          width: 36,
          height: 36,
          cursor: "pointer",
          fontSize: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>
      <div
        style={{
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 12,
          opacity: 0.7,
        }}
      >
        {doc.name}
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "92vw",
          maxHeight: "80vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {doc.type?.startsWith("image/") ? (
          <img
            src={doc.dataUrl}
            alt={doc.name}
            style={{
              maxWidth: "92vw",
              maxHeight: "78vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 8px 40px #000",
            }}
          />
        ) : (
          <div
            style={{
              background: T.bg,
              borderRadius: 12,
              padding: "40px 48px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 64, marginBottom: 16 }}>📄</div>
            <div style={{ color: T.txt, fontWeight: 700, fontSize: 15 }}>
              {doc.name}
            </div>
            <div style={{ color: T.dim, fontSize: 12, marginTop: 6 }}>
              PDF — cannot preview inline
            </div>
            <a
              href={doc.dataUrl}
              download={doc.name}
              style={{
                display: "inline-block",
                marginTop: 16,
                background: T.accent,
                color: "#060A10",
                padding: "8px 20px",
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              ⬇ Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Structured Document Upload (4 fixed slots) ────────────────
export const DOC_SLOTS = [
  {
    key: "id_front",
    label: "ID — Front",
    icon: "🪪",
    required: true,
    accept: "image/*",
    capture: undefined,
  },
  {
    key: "id_back",
    label: "ID — Back",
    icon: "🪪",
    required: true,
    accept: "image/*",
    capture: undefined,
  },
  {
    key: "passport",
    label: "Passport Photo",
    icon: "🖼️",
    required: true,
    accept: "image/*",
    capture: undefined,
  },
  {
    key: "biz_doc",
    label: "Business Document",
    icon: "📋",
    required: false,
    accept: "image/*,application/pdf",
    capture: undefined,
  },
];

export const StructuredDocUpload = ({ docs, onAdd, onRemove, showVal }) => {
  const [uploading, setUploading] = useState({});
  const [viewing, setViewing] = useState(null);

  const handleFile = async (e, slot) => {
    const originalFile = e.target.files?.[0];
    if (!originalFile) return;
    e.target.value = "";
    setUploading((u) => ({ ...u, [slot.key]: true }));
    try {
      const file = await compressImage(originalFile);
      const blobUrl = URL.createObjectURL(file);
      
      const existing = docs.find((d) => d.key === slot.key);
      if (existing) onRemove(existing.id);
      
      onAdd({
        id: uid("DOC"),
        key: slot.key,
        name: slot.label,
        originalName: file.name,
        type: file.type,
        size: file.size,
        dataUrl: blobUrl, // Lightweight preview URL
        file: file, // Store the File object to upload directly
        uploaded: now(),
      });
      try { SFX.upload(); } catch (e) {}
    } catch (err) {
      console.error("Failed to process file", err);
    } finally {
      setUploading((u) => {
        const n = { ...u };
        delete n[slot.key];
        return n;
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {viewing && <DocViewer doc={viewing} onClose={() => setViewing(null)} />}
      {DOC_SLOTS.map((slot, idx) => {
        const doc = docs.find((d) => d.key === slot.key);
        const busy = uploading[slot.key];
        const isReady = !!doc;
        const isMissing = showVal && slot.required && !isReady;
        return (
          <div
            key={slot.key}
            style={{
              background: isMissing ? `${T.danger}0a` : T.surface,
              border: `1.5px solid ${isReady ? T.ok : isMissing ? T.danger : T.border + '30'}`,
              borderRadius: 12,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              transition: "all .3s ease",
            }}
          >
            {/* Step number */}
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 99,
                background: isReady ? T.ok : isMissing ? T.danger : T.border,
                color: isReady || isMissing ? "#fff" : T.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {isReady ? "✓" : idx + 1}
            </div>
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>{slot.icon}</span>
                <span style={{ color: T.txt, fontSize: 13, fontWeight: 700 }}>
                  {slot.label}
                </span>
                {slot.required && (
                  <span
                    style={{ color: isMissing ? T.danger : T.muted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    ★ Mandatory
                  </span>
                )}
              </div>
              {isReady ? (
                <div style={{ color: T.ok, fontSize: 11, marginTop: 2 }}>
                  ✓ Uploaded · {doc.uploaded}
                </div>
              ) : (
                <div style={{ color: isMissing ? T.danger : T.muted, fontSize: 11, marginTop: 2 }}>
                  {isMissing ? "⚠ This document is required to continue" : slot.required ? "Must upload before proceeding" : "Upload if available"}
                </div>
              )}
            </div>
            {/* Thumbnail / preview */}
            {isReady && (
              <div
                onClick={() => setViewing(doc)}
                style={{ cursor: "pointer", flexShrink: 0 }}
              >
                {doc.type?.startsWith("image/") ? (
                  <img
                    src={doc.dataUrl}
                    alt={slot.label}
                    style={{
                      width: 52,
                      height: 52,
                      objectFit: "cover",
                      borderRadius: 7,
                      border: `2px solid ${T.ok}`,
                      boxShadow: "0 2px 8px #00000040",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      background: T.card,
                      borderRadius: 7,
                      border: `2px solid ${T.ok}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                    }}
                  >
                    📄
                  </div>
                )}
              </div>
            )}
            {/* Actions */}
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {isReady && (
                <>
                  <button
                    onClick={() => setViewing(doc)}
                    style={{
                      background: T.aLo,
                      border: `1px solid ${T.accent}38`,
                      color: T.accent,
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => onRemove(doc.id)}
                    style={{
                      background: T.dLo,
                      border: `1px solid ${T.danger}30`,
                      color: T.danger,
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
              {!isReady && !busy && (
                <label
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: T.bLo,
                    border: `1px solid ${T.blue}38`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 14 }}>📎</span>
                  <span
                    style={{ color: T.blue, fontSize: 11, fontWeight: 700 }}
                  >
                    Upload
                  </span>
                  <input
                    type="file"
                    accept={slot.accept}
                    capture={slot.capture}
                    style={{ display: "none" }}
                    onChange={(e) => handleFile(e, slot)}
                  />
                </label>
              )}
              {busy && (
                <div
                  style={{ color: T.accent, fontSize: 11, padding: "7px 8px" }}
                >
                  Uploading…
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Document Upload Component (legacy freeform — kept for other uses) ─────────────────────────────────
const DocUpload = ({ docs, onAdd, onRemove, label }) => {
  const fileRef = useRef();
  const camRef = useRef();
  const [uploading, setUploading] = useState([]);
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

  const handleFile = async (e, source) => {
    const originalFiles = Array.from(e.target.files || []);
    if (!originalFiles.length) return;
    const ids = originalFiles.map(() => uid("DOC"));
    setUploading(ids);
    originalFiles.forEach(async (origFile, fi) => {
      const file = await compressImage(origFile);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const doc = {
          id: ids[fi],
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: ev.target.result,
          source,
          uploaded: now(),
        };
        onAdd(doc);
        setUploading((u) => u.filter((x) => x !== ids[fi]));
        if (fi === files.length - 1) {
          showToast(
            `✓ ${files.length} file${files.length > 1 ? "s" : ""} uploaded successfully`,
          );
          try {
            SFX.upload();
          } catch (e) {}
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <div
          style={{
            color: T.dim,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}
      >
        <label
          style={{
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: T.bLo,
            border: `1px solid ${T.blue}38`,
            color: T.blue,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          📎 Upload File
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleFile(e, "storage")}
          />
        </label>
        <label
          style={{
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: T.aLo,
            border: `1px solid ${T.accent}38`,
            color: T.accent,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          📷 Use Camera
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e, "camera")}
          />
        </label>
      </div>
      {uploading.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ color: T.dim, fontSize: 12 }}>
              Uploading {uploading.length} file{uploading.length > 1 ? "s" : ""}
              …
            </span>
          </div>
          <div
            style={{
              height: 5,
              background: T.border,
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "60%",
                background: T.accent,
                borderRadius: 99,
                animation: "pulse 1s infinite",
              }}
            />
          </div>
        </div>
      )}
      {toast && (
        <div
          style={{
            background: T.oLo,
            border: `1px solid ${T.ok}38`,
            borderRadius: 8,
            padding: "8px 12px",
            color: T.ok,
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {toast}
        </div>
      )}
      {docs && docs.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))",
            gap: 8,
          }}
        >
          {docs.map((doc) => (
            <div
              key={doc.id}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 9,
                padding: 8,
                position: "relative",
              }}
            >
              {doc.type?.startsWith("image/") ? (
                <img
                  src={doc.dataUrl}
                  alt={doc.name}
                  style={{
                    width: "100%",
                    height: 70,
                    objectFit: "cover",
                    borderRadius: 5,
                    marginBottom: 5,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 70,
                    background: T.card,
                    borderRadius: 5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    marginBottom: 5,
                  }}
                >
                  📄
                </div>
              )}
              <div
                style={{
                  color: T.txt,
                  fontSize: 10,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {doc.name}
              </div>
              <div style={{ color: T.muted, fontSize: 9 }}>
                {doc.source === "camera" ? "📷 Camera" : "📁 Upload"}
              </div>
              <button
                onClick={() => onRemove(doc.id)}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  background: T.dLo,
                  border: "none",
                  color: T.danger,
                  borderRadius: 99,
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  fontSize: 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <style>{`
        .pop {
          animation: popIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @media(max-width:600px) {
           .pop { animation: slideUpIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slideUpIn {
          from { opacity: 0; transform: translateY(100%) scale(1); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {(!docs || docs.length === 0) && (
        <div
          style={{
            background: T.surface,
            border: `1px dashed ${T.border}`,
            borderRadius: 9,
            padding: "16px",
            textAlign: "center",
            color: T.muted,
            fontSize: 12,
          }}
        >
          No documents uploaded yet
        </div>
      )}
    </div>
  );
};

// ── Popup Validation Warning ──────────────────────────────────
export const ValidationPopup = ({ fields, onClose }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    try {
      SFX.error();
    } catch (e) {}
  }, []);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(8,12,20,0.8)",
        zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        backdropFilter: 'blur(10px)',
        animation: 'vdPop .4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes vdPop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes vdContent {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        className="shake"
        style={{
          background: T.card,
          border: `1px solid ${T.danger}30`,
          borderRadius: 24,
          padding: 30,
          width: "100%", maxWidth: 440,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.05)',
          animation: 'vdContent .5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          textAlign: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ 
          width: 60, height: 60, borderRadius: 30, background: `${T.danger}15`, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          margin: '0 auto 20px', color: T.danger 
        }}>
          <AlertCircle size={32} />
        </div>
        <h2 style={{ color: T.txt, fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Incomplete Form</h2>
        <p style={{ color: T.muted, fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          Please complete the following mandatory fields before proceeding:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 30, textAlign: 'left' }}>
          {fields.map((f, i) => (
            <div key={i} style={{ 
              display: "flex", alignItems: "center", gap: 10, padding: '10px 14px', 
              background: `${T.surface}60`, borderRadius: 12, border: `1px solid ${T.border}10`
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: T.danger }} />
              <div style={{ color: T.txt, fontSize: 13, fontWeight: 600 }}>{f}</div>
            </div>
          ))}
        </div>

        <Btn onClick={onClose} full v="danger" style={{ padding: '14px', borderRadius: 16 }}>
          Got it
        </Btn>
      </div>
    </div>
  );
};
export const LOCATIONS = [
  "Korompoi", "Kimalat", "Muigai", "Yukos", "Luckybase", "Mariam's Road", "Noonkopir", 
  "Chang'ombe", "St Monica", "Saitoti Road", "Prison Road", "EPZ", "Tropicana", 
  "Balozi Road", "Baraka Road", "Milele Centre", "G26", "Mwireri Road", "Waiguru Road", 
  "Deliverance Road", "3-Ways", "Muthenya", "Kitengela Soko", "Eastmatt", "Rembo Stage", 
  "Sixers", "Old Namanga", "County Glass", "Enkare", "Milimani", "GMC Place", 
  "Ola/Leadway", "Step Inn", "KAG University", "Vannilla's", "Makadara", "Nyambura", 
  "Site", "Athi River Kichinjio", "Athi River Soko", "Devik", "Athi River 24", 
  "Shalom/Tufoam", "JuakaliE", "Equity Afia"
];

// ═══════════════════════════════════════════
//  ONBOARD FORM (Lead → Customer)
// ═══════════════════════════════════════════
const ONBOARD_DRAFT_KEY = "acl_onboard_draft";
export const OnboardForm = ({ workers, onSave, onClose, prefill, leadId }) => {
  const vw = typeof window !== "undefined" ? window.innerWidth : 600;
  const isMobileSize = vw < 600;

  const [draftPrompt, setDraftPrompt] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(ONBOARD_DRAFT_KEY) || "null");
      return d && d.f?.name ? d : null;
    } catch (e) {
      return null;
    }
  });
  const prefillLoc = prefill?.location || prefill?.businessLocation || "";
  const locParts = prefillLoc.split(' | ');
  const initialArea = LOCATIONS.includes(locParts[0]) ? locParts[0] : "";
  // If there's an area match, the rest is the description
  const initialDesc = initialArea ? locParts.slice(1).join(' | ').replace(/^Directions: /, '') : prefillLoc;

  const blankF = {
    name: prefill?.name || "",
    dob: "",
    gender: "Female",
    idNo: "",
    phone: prefill?.phone || "",
    altPhone: prefill?.altPhone || prefill?.alt_phone || "",
    businessName: prefill?.business || prefill?.businessName || "",
    businessType: prefill?.businessType || "Retail",
    businessArea: initialArea,
    businessLocation: initialDesc,
    businessMapRoad: "",
    businessMapLandmark: "",
    businessMapBuilding: "",
    businessMapFloor: "",
    residenceArea: "",
    residenceLandmark: "",
    residenceRoad: "",
    residenceDirections: "",
    officer: prefill?.officer || "",
    n1n: "",
    n1p: "",
    n1r: "",
    n2n: "",
    n2p: "",
    n2r: "",
    n3n: "",
    n3p: "",
    n3r: "",
    customBusinessType: "",
    gps: "",
  };
  const [f, setF] = useState(blankF);
  const [docs, setDocs] = useState([]);
  const [step, setStep] = useState(1);
  const [valErr, setValErr] = useState(null);
  const [showVal, setShowVal] = useState(false);
  const [fetchingGps, setFetchingGps] = useState(false);
  const s = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const loadGps = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setFetchingGps(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        setF(p => ({ ...p, gps: coords }));
        setFetchingGps(false);
        try { SFX.save(); } catch(e) {}
      },
      err => {
        setFetchingGps(false);
        alert(`Failed to fetch location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Autosave draft on every change
  useEffect(() => {
    try {
      localStorage.setItem(
        ONBOARD_DRAFT_KEY,
        JSON.stringify({
          f,
          step,
          savedAt: new Date().toLocaleTimeString("en-KE"),
        }),
      );
    } catch (e) {}
  }, [f, step]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(ONBOARD_DRAFT_KEY);
    } catch (e) {}
  };

  const continueDraft = () => {
    if (draftPrompt) {
      setF(draftPrompt.f);
      setStep(draftPrompt.step || 1);
    }
    setDraftPrompt(null);
  };
  const startFresh = () => {
    setF(blankF);
    setStep(1);
    setDocs([]);
    clearDraft();
    setDraftPrompt(null);
  };

  const renderSH = ({ title, icon }) => (
    <div
      style={{
        color: T.muted,
        fontSize: isMobileSize ? 9 : 10,
        fontWeight: 900,
        letterSpacing: '0.1em',
        textTransform: "uppercase",
        margin: isMobileSize ? "8px 0 12px" : "12px 0 16px",
        paddingBottom: 8,
        borderBottom: `1px solid ${T.border}15`,
        gridColumn: "span 2",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: isMobileSize ? 12 : 14 }}>{icon}</span>
      {title}
    </div>
  );

  const STEPS = [
    { n: 1, label: "Personal" },
    { n: 2, label: "Business" },
    { n: 3, label: "Next of Kin" },
    { n: 4, label: "Documents" },
    { n: 5, label: "Review" },
  ];

  const validateStep = () => {
    const missing = [];
    if (step === 1) {
      if (!f.name) missing.push("Full Name");
      if (!f.dob) missing.push("Date of Birth");
      else {
        const birthDate = new Date(f.dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (age < 18) missing.push("Applicant must be at least 18 years old");
      }
      if (!f.idNo) missing.push("National ID Number");
      if (!f.phone) missing.push("Primary Phone");
      if (!f.residenceArea) missing.push("Home Estate/Area");
      if (!f.residenceDirections) missing.push("Home Description/Directions");
    }
    if (step === 2) {
      if (!f.businessName) missing.push("Business Name");
      if (!f.businessArea) missing.push("Business Town/Area");
      if (!f.businessLocation) missing.push("Business Directions/Description");
      if (!f.officer) missing.push("Assigned Officer");
    }
    if (step === 3) {
      if (!f.n1n) missing.push("Next of Kin 1 – Name");
      if (!f.n1p) missing.push("Next of Kin 1 – Phone");
      if (!f.n1r) missing.push("Next of Kin 1 – Relationship");
    }
    if (step === 4) {
      const mandatoryKeys = ["id_front", "id_back", "passport"];
      const uploadedKeys = docs.map((d) => d.key);
      if (!uploadedKeys.includes("id_front"))
        missing.push("National ID — Front (mandatory)");
      if (!uploadedKeys.includes("id_back"))
        missing.push("National ID — Back (mandatory)");
      if (!uploadedKeys.includes("passport"))
        missing.push("Passport Photo (mandatory)");
    }
    return missing;
  };

  const next = () => {
    const missing = validateStep();
    if (missing.length > 0) {
      setValErr(missing);
      setShowVal(true);
      try {
        SFX.error();
      } catch (e) {}
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  };

  const save = async () => {
    const finalData = { ...f };
    if (finalData.businessType === "Other" && finalData.customBusinessType) {
      finalData.businessType = finalData.customBusinessType;
    }
    delete finalData.customBusinessType;

    // Build compound location strings
    const bizParts = [];
    if (finalData.businessMapRoad) bizParts.push(`Road: ${finalData.businessMapRoad}`);
    if (finalData.businessMapLandmark) bizParts.push(`Landmark: ${finalData.businessMapLandmark}`);
    if (finalData.businessMapBuilding) bizParts.push(`Bldg: ${finalData.businessMapBuilding}`);
    if (finalData.businessMapFloor) bizParts.push(`Floor: ${finalData.businessMapFloor}`);
    if (finalData.businessLocation) bizParts.push(`Directions: ${finalData.businessLocation}`);
    
    finalData.businessLocation = finalData.businessArea 
      ? `${finalData.businessArea} | ${bizParts.join(', ')}`
      : bizParts.join(', ');

    const resParts = [];
    if (finalData.residenceLandmark) resParts.push(`Landmark: ${finalData.residenceLandmark}`);
    if (finalData.residenceRoad) resParts.push(`Road: ${finalData.residenceRoad}`);
    if (finalData.residenceDirections) resParts.push(`Desc: ${finalData.residenceDirections}`);
    
    finalData.residence = finalData.residenceArea
      ? `${finalData.residenceArea} | ${resParts.join(', ')}`
      : resParts.join(', ');

    const officerWorker = workers?.find(w => w.name === finalData.officer);
    // Use auth_user_id (UUID) to satisfy DB foreign key constraint, fallback to id for legacy logic
    const officerId = officerWorker?.auth_user_id || officerWorker?.authUserId || officerWorker?.id || null;

    const customerId = uid("CUS");
    return await onSave({
      id: customerId,
      ...finalData,
      officerId, // Passing for toSupabaseCustomer
      idNumber: finalData.idNo,
      accountNumber: customerId, 
      usesIdAsAccount: false,
      loans: 0,
      risk: "Low",
      joined: now(),
      blacklisted: false,
      fromLead: leadId || null,
      docs,
    });
  };
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await save();
      if (res !== false) {
        clearDraft();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.target.tagName.match(/textarea|button/i)) {
           e.preventDefault();
           if (step < 5) next();
           else if (step === 5 && !isSaving) handleSave();
        }
      }}
    >
      {showVal && valErr && (
        <ValidationPopup fields={valErr} onClose={() => setShowVal(false)} />
      )}
      {/* Draft restore prompt */}
      {draftPrompt && (
        <div
          style={{
            background: `${T.gold}10`,
            border: `1px solid ${T.gold}25`,
            borderRadius: 16,
            padding: "16px 18px",
            marginBottom: 20,
            backdropFilter: 'blur(10px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: T.gold,
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              📝 Recovery Available
            </div>
            <div style={{ color: T.muted, fontSize: 13 }}>
              Continue registration for <b style={{ color: T.txt }}>{draftPrompt.f?.name || "unknown"}</b>?
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={continueDraft} sm v="accent" style={{ background: T.gold, color: '#000' }}>
              Resume
            </Btn>
            <Btn v="ghost" onClick={startFresh} sm style={{ color: T.muted }}>
              Discard
            </Btn>
          </div>
        </div>
      )}
      {/* Step indicator */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 28,
          padding: "6px",
          borderRadius: 20,
          background: `${T.surface}60`,
          backdropFilter: "blur(20px)",
          border: `1px solid ${T.border}30`,
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)',
        }}
      >
        {STEPS.map((st) => (
          <div
            key={st.n}
            style={{
              flex: 1,
              padding: "10px 4px",
              textAlign: "center",
              background: step === st.n ? T.accent : step > st.n ? `${T.accent}15` : 'transparent',
              borderRadius: 16,
              transition: "all .4s cubic-bezier(0.16, 1, 0.3, 1)",
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2
            }}
          >
            <div
              style={{
                color: step === st.n ? 'var(--accent-txt, #fff)' : step > st.n ? T.accent : T.muted,
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {step > st.n ? "✓" : st.n}
            </div>
            <div
              style={{
                color: step === st.n ? 'var(--accent-txt, #fff)' : step > st.n ? T.accent : T.muted,
                fontSize: 9,
                fontWeight: 700,
                opacity: step >= st.n ? 1 : 0.6
              }}
            >
              {st.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, paddingBottom: 24 }}>
        {step === 1 && (
          <div
            className="mob-grid1"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 14px",
            }}
          >
            {renderSH({ title: "Personal Details", icon: <User size={14} /> })}
            <FI
              label="Full Name"
              value={f.name}
              onChange={s("name")}
              required
              error={showVal}
              half
            />
            <FI
              label="Date of Birth"
              value={f.dob}
              onChange={s("dob")}
              type="date"
              required
              error={showVal}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
              min={new Date(new Date().setFullYear(new Date().getFullYear() - 100)).toISOString().split("T")[0]}
              half
            />
            <FI
              label="Gender"
              value={f.gender}
              onChange={s("gender")}
              type="select"
              options={["Female", "Male", "Other"]}
              half
            />
            <NumericInput
              label="National ID No."
              value={f.idNo}
              onChange={s("idNo")}
              required
              error={showVal}
              half
              placeholder="e.g. 12345678"
            />
            <PhoneInput
              label="Primary Phone"
              value={f.phone}
              onChange={s("phone")}
              required
              error={showVal}
              half
            />
            <PhoneInput
              label="Alt Phone"
              value={f.altPhone}
              onChange={s("altPhone")}
              half
            />
            <div style={{ gridColumn: 'span 2', background: `${T.accent}08`, border: `1px dashed ${T.accent}30`, borderRadius: 16, padding: '16px 20px', marginBottom: 12 }}>
              <div style={{ color: T.accent, fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Home size={16} /> Home Location Mapping Guide
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                <FI
                  label="Estate/Area Name"
                  value={f.residenceArea}
                  onChange={s("residenceArea")}
                  required
                  error={showVal}
                  placeholder="e.g. South B"
                />
                <FI
                  label="Nearest Landmark"
                  value={f.residenceLandmark}
                  onChange={s("residenceLandmark")}
                  placeholder="e.g. School, Petrol Station"
                />
                <FI
                  label="Nearby Road"
                  value={f.residenceRoad}
                  onChange={s("residenceRoad")}
                  placeholder="e.g. Mombasa Road"
                />
                <FI
                  label="General Description"
                  value={f.residenceDirections}
                  onChange={s("residenceDirections")}
                  required
                  error={showVal}
                  placeholder="Behind landmark, near shop..."
                />
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div
            className="mob-grid1"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 14px",
            }}
          >
            {renderSH({ title: "Business Details", icon: <Briefcase size={14} /> })}
            <FI
              label="Business Name"
              value={f.businessName}
              onChange={s("businessName")}
              required
              error={showVal}
              half
            />
            <FI
              label="Business Type"
              value={f.businessType}
              onChange={s("businessType")}
              type="select"
              options={[
                "Butchery", "Carpentry", "Charcoal/firewood seller", "Clothes & Accessories", 
                "Food kiosk", "Fruits & Vegetables", "General shop", "Juakali artisan", 
                "Milk ATM", "Rentals/accommodation", "Agrovet", "Autospares", 
                "Animal feeds", "Bakery", "Boutique", "Salon/Kinyozi", 
                "Poultry", "Second hand items", "Photo studio", "DSTV/Video show", 
                "Health centre", "Electrical shop", "Bags", "Bookshop", 
                "Pharmacy", "Beauty & cosmetics", "Welding", "Wines & spirits", 
                "Money agent", "Fish seller", "Shoeshiner/repair", "Cereals", 
                "Malimali", "Movie shop", "Soaps & detergents", "Cyber cafe", 
                "Events & entertainment", "Gas cylinders", "Poshio mill", "Murtura base", 
                "Pond table", "School", "Ballar & sand", "Glass", 
                "Garage", "Computer college", "Dry cleaner", "Carpet seller", 
                "Car wash", "Timberyard", "Sugarcane", "Tailor", 
                "Bar & restaurant", "School uniforms", "Brick seller", "Bakery & weaving", 
                "Egg seller", "Gas shop", "Gym", "Shoe seller", 
                "Day care", "Security firm", "Curtains", "Ice cream", 
                "Maize", "Massage spa", "Chemicals", "Curios", 
                "Detergent supplier", "Electronics", "Loans on item", "Optician", 
                "Packaging material", "Potato seller", "Other", "Add option"
              ]}
              half
            />
            {f.businessType === "Other" && (
              <FI
                label="Custom Business Type"
                value={f.customBusinessType}
                onChange={s("customBusinessType")}
                placeholder="Specify your business..."
                required
                error={showVal}
                half
              />
            )}
            <div style={{ gridColumn: 'span 2', background: `${T.accent}08`, border: `1px dashed ${T.accent}30`, borderRadius: 16, padding: '16px 20px', marginBottom: 12, marginTop: 4 }}>
              <div style={{ color: T.accent, fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={16} /> Business Location Mapping Guide
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                <FI
                  label="Town/Area"
                  type="select"
                  options={["", ...LOCATIONS]}
                  value={f.businessArea}
                  onChange={s("businessArea")}
                  required
                  error={showVal}
                />
                <FI
                  label="Nearest Main Road"
                  value={f.businessMapRoad}
                  onChange={s("businessMapRoad")}
                  placeholder="e.g. Namanga Rd"
                />
                <FI
                  label="Landmark"
                  value={f.businessMapLandmark}
                  onChange={s("businessMapLandmark")}
                  placeholder="e.g. School, Petrol station"
                />
                <FI
                  label="Building Name/Description"
                  value={f.businessMapBuilding}
                  onChange={s("businessMapBuilding")}
                />
                <FI
                  label="Floor/Room"
                  value={f.businessMapFloor}
                  onChange={s("businessMapFloor")}
                  placeholder="if applicable"
                />
                <FI
                  label="Directions"
                  value={f.businessLocation}
                  onChange={s("businessLocation")}
                  required
                  error={showVal}
                  placeholder="Opposite landmark, next to..."
                />
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: T.warn, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} /> ⚠️ Ensure directions are simple, clear, and easy to follow.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: 'span 1' }}>
              <div 
                onClick={(e) => {
                  if (fetchingGps) return;
                  if (f.gps) {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.gps.replace(' ', ''))}`, '_blank');
                  } else {
                    loadGps();
                  }
                }} 
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', 
                  borderRadius: 99, background: f.gps ? `linear-gradient(135deg, ${T.ok} 0%, #00a884 100%)` : T.cardHi || T.surface,
                  color: f.gps ? '#000' : T.txt, fontSize: 13, fontWeight: 800, 
                  cursor: fetchingGps ? 'wait' : 'pointer', border: `1px solid ${f.gps ? 'transparent' : T.border}`,
                  boxShadow: f.gps ? `0 6px 16px ${T.ok}40` : '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', alignSelf: 'flex-start'
                }}
              >
                <MapPin size={16} /> 
                {fetchingGps ? "Acquiring satellite lock..." : f.gps ? "✓ View Pinned Map" : "Tag GPS Location"}
              </div>
            </div>
            <FI
              label="Assigned Officer"
              value={f.officer}
              onChange={s("officer")}
              type="select"
              options={(workers || [])
                .filter((w) => w.status === "Active")
                .map((w) => w.name)}
              required
              error={showVal}
              half
            />
          </div>
        )}
        {step === 3 && (
          <div
            className="mob-grid1"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 14px",
            }}
          >
            {renderSH({ title: "Next of Kin — 1 required", icon: <Users size={14} /> })}
            {[
              [1, "n1n", "n1p", "n1r"],
              [2, "n2n", "n2p", "n2r"],
              [3, "n3n", "n3p", "n3r"],
            ].map(([n, nk, pk, rk]) => [
              <FI
                key={nk}
                label={`NOK ${n} Name`}
                value={f[nk]}
                onChange={s(nk)}
                required
                error={showVal}
                half
              />,
              <PhoneInput
                key={pk}
                label={`NOK ${n} Phone`}
                value={f[pk]}
                onChange={s(pk)}
                required
                error={showVal}
                half
              />,
              <FI
                key={rk}
                label={`NOK ${n} Relationship`}
                value={f[rk]}
                onChange={s(rk)}
                type="select"
                options={[
                  "",
                  "Spouse",
                  "Parent",
                  "Sibling",
                  "Child",
                  "Friend",
                  "Colleague",
                ]}
                required
                error={showVal}
                half
              />,
              <div
                key={`sep${n}`}
                style={{
                  gridColumn: "span 2",
                  height: 1,
                  background: T.border,
                  margin: "4px 0",
                }}
              />,
            ])}
          </div>
        )}
        {step === 4 && (
          <div>
            <div
              style={{
                color: T.accent,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 10,
                fontFamily: T.head,
              }}
            >
              📎 KYC Documents
            </div>
            <Alert type="info" style={{ marginBottom: 12 }}>
              Upload the 3 mandatory documents in order. The business document
              is optional.
            </Alert>
            <StructuredDocUpload
              docs={docs}
              onAdd={(d) => setDocs((p) => [...p, d])}
              onRemove={(id) => setDocs((p) => p.filter((x) => x.id !== id))}
            />
          </div>
        )}
        {step === 5 && (
          <div>
            <Alert type="ok">
              ✓ Review all information before saving the customer profile.
            </Alert>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {[
                ["Name", f.name],
                ["ID No.", f.idNo],
                ["Phone", f.phone],
                ["Residence", f.residenceArea ? `${f.residenceArea}${f.residenceDirections ? ` | ${f.residenceDirections}` : ''}` : null],
                ["Business", f.businessName],
                ["Business Type", f.businessType],
                ["Bus. Location", (() => {
                  const base = f.businessArea ? `${f.businessArea}${f.businessLocation ? ` | ${f.businessLocation}` : ''}` : f.businessLocation;
                  return f.gps ? `${base} (${f.gps})` : base;
                })()],
                ["Officer", f.officer],
                ["NOK 1", `${f.n1n} · ${f.n1p}`],
                ["NOK 2", `${f.n2n} · ${f.n2p}`],
                ["NOK 3", `${f.n3n} · ${f.n3p}`],
                ["Documents", `${docs.length} uploaded`],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    background: T.surface,
                    borderRadius: 8,
                    padding: "9px 12px",
                  }}
                >
                  <div
                    style={{
                      color: T.muted,
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      marginBottom: 2,
                    }}
                  >
                    {k}
                  </div>
                  <div style={{ color: T.txt, fontSize: 13, fontWeight: 600 }}>
                    {v || <span style={{ color: T.danger }}>Not filled</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 20,
          paddingTop: 16,
          borderTop: `1px solid ${T.border}20`,
        }}
      >
        {step > 1 && (
          <Btn v="secondary" onClick={() => setStep((s) => s - 1)} style={{ background: `${T.surface}80`, backdropFilter: 'blur(10px)' }}>
            ← Back
          </Btn>
        )}
        {step < 5 && (
          <Btn onClick={next} full v="accent" style={{ borderRadius: 14 }}>
            Continue →
          </Btn>
        )}
        {step === 5 && (
          <Btn disabled={isSaving} onClick={handleSave} full v="ok" style={{ borderRadius: 14, opacity: isSaving ? 0.7 : 1 }}>
            {isSaving ? "⏳ Saving Profile..." : "💾 Complete Registration"}
          </Btn>
        )}
        <Btn v="ghost" onClick={onClose} style={{ color: T.muted }}>
          Cancel
        </Btn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
//  LOAN FORM
// ═══════════════════════════════════════════
export const LoanForm = ({
  customers,
  payments,
  loans,
  onSave,
  onClose,
  workerMode,
  workerName,
}) => {
  const vw = typeof window !== "undefined" ? window.innerWidth : 600;
  const isMobileSize = vw < 600;

  const LOAN_DRAFT_KEY = "acl_loan_draft";
  const [draftPrompt, setDraftPrompt] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(LOAN_DRAFT_KEY) || "null");
      return d && d.f?.cid ? d : null;
    } catch (e) {
      return null;
    }
  });

  const [f, setF] = useState({ cid: "", repayType: "Monthly", amount: 1 });
  const [showVal, setShowVal] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [limitError, setLimitError] = useState(null);
  
  // Autosave draft
  useEffect(() => {
    try {
      if (f.cid || f.amount !== 1) {
        localStorage.setItem(
          LOAN_DRAFT_KEY,
          JSON.stringify({
            f,
            custSearch,
            savedAt: new Date().toLocaleTimeString("en-KE"),
          })
        );
      }
    } catch (e) {}
  }, [f, custSearch]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(LOAN_DRAFT_KEY);
    } catch (e) {}
  };

  const continueDraft = () => {
    if (draftPrompt) {
      setF(draftPrompt.f);
      if (draftPrompt.custSearch) setCustSearch(draftPrompt.custSearch);
    }
    setDraftPrompt(null);
  };

  const startFresh = () => {
    setF({ cid: "", repayType: "Monthly", amount: 1 });
    setCustSearch("");
    clearDraft();
    setDraftPrompt(null);
  };

  const s = (k) => (v) => {
    setF((p) => ({ ...p, [k]: v }));
    if (k === 'amount') setLimitError(null);
  };
  const allLoansArr = loans || [];
  const cust = customers.find((c) => c.id === f.cid);
  const activeLimit = getCustomerActiveLimit(cust, allLoansArr);
  // Use the customer's discount to compute the live interest preview.
  // At 0% discount this is exactly 30%, preserving all existing behaviour.
  const custDiscount = Number(cust?.interestDiscount || 0);
  const custEffectiveRate = 0.3 * (1 - custDiscount / 100);
  const interest = Math.round(Number(f.amount || 0) * custEffectiveRate);
  const total = Number(f.amount || 0) + interest;
  const isNewCust = cust && (cust.loans || 0) === 0;
  
  // SINGLE SOURCE OF TRUTH — checks DB flag first, then ledger
  const hasRegFee = !cust ? true : (
    !isNewCust ||
    cust.mpesaRegistered === true ||
    (payments || []).some(p =>
      p.customerId === cust.id &&
      (p.isRegFee === true ||
        (p.amount >= 500 && typeof p.note === 'string' &&
          (p.note.toLowerCase().includes('registration') || p.note.toLowerCase().includes('reg fee'))))
    )
  );

  const fee = hasRegFee ? 0 : 500;

  const REQUIRED_DOC_KEYS = ["id_front", "id_back", "passport"];

  // Hard blocks: active/overdue loans, blacklisted status, or customer tags
  const custEligibility = (cu) => {
    const reasons = [];
    if (!cu) return { eligible: true, reasons: [], warnings: [] };

    if (cu.blacklisted) {
      reasons.push("Customer is blacklisted");
    }

    // ── Customer Tag Blocks (Red = Bad Faith, Amber = Bad Luck) ──
    const tag = cu.customerTag || cu.customer_tag;
    if (tag === 'Red') {
      reasons.push("Customer has a Red Tag (Bad Faith) — disbursement is blocked");
    } else if (tag === 'Amber') {
      reasons.push("Customer has an Amber Tag (Bad Luck) — disbursement is blocked pending review");
    }

    if (cu.limitSuspended) {
      reasons.push("Credit limit is suspended due to late settlement (>30 days overdue)");
    }

    const activeLimit = getCustomerActiveLimit(cu, allLoansArr);
    if (activeLimit <= 0 && !cu.limitSuspended) {
      reasons.push("Available credit limit is KES 0 (due to default/overdue days)");
    }

    const activeLoan = allLoansArr.find(
      (l) => {
        if (l.customerId !== cu.id) return false;
        const s = (l.status || "").toLowerCase();
        const isFinal = ["settled", "written off", "rejected"].includes(s);
        if (isFinal) return false;
        // Optimization: Check balance directly instead of recalculating all payments
        if (Number(l.balance || 0) <= 0) return false;
        return true;
      }
    );
    if (activeLoan) {
      const s = (activeLoan.status || "active").toLowerCase();
      reasons.push(`Has a ${s} loan (${activeLoan.id})`);
    }

    return { eligible: reasons.length === 0, reasons, warnings: [] };
  };

  const selectedEligibility = cust
    ? custEligibility(cust)
    : { eligible: true, reasons: [], warnings: [] };

  // Show ALL customers in the dropdown (including blacklisted),
  // so ineligible ones appear with a clear INELIGIBLE badge rather than silently disappearing.
  const filteredCusts = customers.filter(
    (c) =>
      !custSearch ||
      c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(custSearch.toLowerCase()) ||
      (c.phone || "").includes(custSearch)
  );

  const calcSchedule = () => {
    const bal = total + fee;
    if (!bal) return [];
    const rt = f.repayType;
    if (rt === "Daily") {
      const d = 30;
      return [
        { p: "Per Day", a: Math.ceil(bal / d) },
        { p: "Per Week", a: Math.ceil(bal / d) * 7 },
        { p: "Per Month", a: bal },
      ];
    }
    if (rt === "Weekly") {
      return [
        { p: "Per Week", a: Math.ceil(bal / 4) },
        { p: "Per Month (4w)", a: bal },
      ];
    }
    if (rt === "Biweekly") {
      return [
        { p: "Per 2 Weeks", a: Math.ceil(bal / 2) },
        { p: "Per Month", a: bal },
      ];
    }
    if (rt === "Monthly") {
      return [{ p: "Per Month", a: bal }];
    }
    if (rt === "Lump Sum") {
      return [{ p: "One-time", a: bal }];
    }
    return [];
  };

  const save = async () => {
    if (!f.cid || Number(f.amount) < 1) {
      setShowVal(true);
      return false;
    }
    const activeLimit = getCustomerActiveLimit(cust, allLoansArr);
    if (Number(f.amount) > activeLimit) {
      setLimitError(`Loan amount of KES ${Number(f.amount).toLocaleString()} exceeds the customer's active credit limit of KES ${activeLimit.toLocaleString()}`);
      return false;
    }
    if (!selectedEligibility.eligible) {
      return false;
    }
    const status = workerMode ? "worker-pending" : "Application submitted";
    return await onSave({
      id: uid("LN"),
      customerId: f.cid,
      customer: cust.name,
      amount: Math.floor(Number(f.amount)),
      balance: total + fee,
      status,
      daysOverdue: 0,
      officer: workerName || cust.officer,
      risk: cust.risk,
      disbursed: null,
      mpesa: null,
      phone: cust.phone,
      repaymentType: f.repayType,
      payments: [],
      // Freeze the customer's current discount into this loan permanently.
      // Future discount changes on the customer will NOT affect this loan.
      interestDiscount: custDiscount,
    });
  };

  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await save();
      if (res !== false) {
        clearDraft();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
      {draftPrompt && (
        <div
          style={{
            background: `${T.gold}10`,
            border: `1px solid ${T.gold}`,
            borderRadius: 16,
            padding: "16px 18px",
            marginBottom: 20,
            backdropFilter: 'blur(10px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: T.gold,
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              📝 Recovery Available
            </div>
            <div style={{ color: T.muted, fontSize: 13 }}>
              Continue draft loan for <b style={{ color: T.txt }}>{customers.find(c => c.id === draftPrompt.f.cid)?.name || draftPrompt.f.cid}</b>?
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={continueDraft} sm v="accent" style={{ background: T.gold, color: '#000' }}>
              Resume
            </Btn>
            <Btn v="ghost" onClick={startFresh} sm style={{ color: T.muted }}>
              Discard
            </Btn>
          </div>
        </div>
      )}

      {showVal && (
        <ValidationPopup
          fields={["Customer selection", "Loan amount (min KES 1)"]}
          onClose={() => setShowVal(false)}
        />
      )}
      {/* Searchable Customer Selector */}
      <div style={{ marginBottom: 12, position: "relative" }}>
        <label
          style={{
            display: "block",
            color: T.dim,
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 5,
            letterSpacing: 0.7,
            textTransform: "uppercase",
          }}
        >
          Customer <span style={{ color: T.danger }}>★</span>
        </label>
        <div style={{ position: "relative" }}>
          <input
            value={cust ? `${cust.name} (${cust.id})` : custSearch}
            onChange={(e) => {
              setCustSearch(e.target.value);
              setF((p) => ({ ...p, cid: "" }));
              setShowCustDrop(true);
            }}
            onFocus={() => setShowCustDrop(true)}
            placeholder="Search by name, ID or phone…"
            style={{
              width: "100%",
              background: T.surface,
              border: `1px solid ${f.cid ? T.accent : T.border}`,
              borderRadius: 8,
              padding: "10px 12px",
              color: T.txt,
              fontSize: 14,
              outline: "none",
            }}
          />
          {cust && (
            <button
              onClick={() => {
                setF((p) => ({ ...p, cid: "" }));
                setCustSearch("");
                setShowCustDrop(true);
              }}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: T.muted,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          )}
        </div>
        {showCustDrop && !cust && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              zIndex: 500,
              maxHeight: 220,
              overflowY: "auto",
              boxShadow: "0 8px 24px #00000060",
              marginTop: 3,
            }}
          >
            {filteredCusts.length === 0 && (
              <div
                style={{
                  padding: "14px",
                  color: T.muted,
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                No customers found
              </div>
            )}
            {filteredCusts.map((c) => {
              const isNew = c.loans === 0;
              const elig = custEligibility(c, !!workerMode);
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (!elig.eligible) return; // block ineligible selection
                    setF((p) => ({ ...p, cid: c.id }));
                    setCustSearch("");
                    setShowCustDrop(false);
                  }}
                  style={{
                    padding: "10px 14px",
                    cursor: elig.eligible ? "pointer" : "not-allowed",
                    borderBottom: `1px solid ${T.border}20`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "transparent",
                    opacity: elig.eligible ? 1 : 0.6,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = T.surface)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          color: elig.eligible ? T.txt : T.muted,
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {c.name}
                      </span>
                      {isNew && (
                        <span
                          style={{
                            background: "#3B82F620",
                            color: T.blue,
                            border: `1px solid ${T.blue}38`,
                            borderRadius: 99,
                            padding: "1px 7px",
                            fontSize: 10,
                            fontWeight: 800,
                          }}
                        >
                          NEW
                        </span>
                      )}
                      {!elig.eligible && (
                        <span
                          style={{
                            background: T.dLo,
                            color: T.danger,
                            border: `1px solid ${T.danger}38`,
                            borderRadius: 99,
                            padding: "1px 7px",
                            fontSize: 10,
                            fontWeight: 800,
                          }}
                        >
                          INELIGIBLE
                        </span>
                      )}
                    </div>
                    <div style={{ color: T.muted, fontSize: 11, marginTop: 1 }}>
                      {c.id} · {c.phone} · {c.business || "—"}
                    </div>
                    {!elig.eligible && (
                      <div
                        style={{ color: T.danger, fontSize: 10, marginTop: 2 }}
                      >
                        {elig.reasons.join(" · ")}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
        </div>
      {cust && (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: `${T.border}20`, borderRadius: 10, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>
            {cust.name} · {cust.id}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
            {cust.loans} previous loan(s)
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: activeLimit > 0 ? T.txt : T.danger, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>💳 Active Credit Limit:</span>
            <span style={{ color: activeLimit > 0 ? T.accent : T.danger, fontFamily: T.mono, fontWeight: 800 }}>
              KES {activeLimit.toLocaleString()}
            </span>
            {cust.limitSuspended && (
              <span style={{ background: '#EF444420', color: T.danger, border: `1px solid ${T.danger}38`, borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 800 }}>
                SUSPENDED
              </span>
            )}
            {custDiscount > 0 && (
              <span style={{ background: `${T.accent}20`, color: T.accent, border: `1px solid ${T.accent}38`, borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 800 }}>
                🏷️ {custDiscount}% INT. DISCOUNT APPLIED
              </span>
            )}
          </div>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0 14px",
        }}
      >
        <FI
          label="Amount (KES)"
          type="number"
          value={f.amount}
          onChange={s("amount")}
          hint={cust ? `Max KES ${activeLimit.toLocaleString()}` : "Min KES 1"}
          required
          error={Number(f.amount) < 1 || (cust && Number(f.amount) > activeLimit)}
          half
        />
        <FI
          label="Repayment Type"
          type="select"
          options={["Lump Sum", "Daily", "Weekly", "Biweekly", "Monthly"]}
          value={f.repayType}
          onChange={s("repayType")}
          half
        />
      </div>
      {Number(f.amount) >= 1 && (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: 13,
            marginBottom: 13,
          }}
        >
          <div
            style={{
              color: T.muted,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.9,
              marginBottom: 9,
            }}
          >
            Loan Summary
          </div>
          {[
            ["Principal", fmt(f.amount)],
            [
              custDiscount > 0
                ? `Interest (${(30 * (1 - custDiscount / 100)).toFixed(1)}% flat)`
                : "Interest (30% flat)",
              fmt(interest),
            ],
            ["Registration Fee", fmt(fee)],
            ["Total Repayable", fmt(total + fee)],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: `1px solid ${T.border}`,
                fontSize: 13,
              }}
            >
              <span style={{ color: T.muted }}>{k}</span>
              <span
                style={{
                  color: k.includes("Total") ? T.accent : T.txt,
                  fontWeight: k.includes("Total") ? 800 : 500,
                  fontFamily: T.mono,
                }}
              >
                {v}
              </span>
            </div>
          ))}
          {calcSchedule().length > 0 && (
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px solid ${T.border}`,
              }}
            >
              <div
                style={{
                  color: T.accent,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  marginBottom: 7,
                }}
              >
                📅 Repayment Schedule
              </div>
              {calcSchedule().map(({ p, a }) => (
                <div
                  key={p}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: T.muted }}>{p}</span>
                  <span
                    style={{
                      color: T.accent,
                      fontFamily: T.mono,
                      fontWeight: 700,
                    }}
                  >
                    {fmt(a)}
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>
      )}
      </div>
      <div style={{ flexShrink: 0, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        {limitError && (
          <div style={{
            background: `${T.danger}10`,
            border: `1px solid ${T.danger}40`,
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 14,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🚫</span>
            <div>
              <div style={{ color: T.danger, fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                Limit Exceeded
              </div>
              <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5 }}>
                {limitError}
              </div>
            </div>
          </div>
        )}
        {cust && !selectedEligibility.eligible && (
          <div style={{
            background: `${T.danger}10`,
            border: `1px solid ${T.danger}40`,
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 14,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🚫</span>
            <div>
              <div style={{ color: T.danger, fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                Not Eligible for a New Loan
              </div>
              {selectedEligibility.reasons.map((r, i) => (
                <div key={i} style={{ color: T.muted, fontSize: 12, lineHeight: 1.5 }}>
                  • {r}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 9 }}>
          <Btn onClick={handleSave} full disabled={!selectedEligibility.eligible} loading={isSaving}>
            {workerMode ? "Submit for Admin Approval →" : "Submit Application"}
          </Btn>
          <Btn v="secondary" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
//  REMINDERS SYSTEM
// ═══════════════════════════════════════════
// Reminder seed uses relative future dates so they don't immediately fire as overdue
const _futureDate = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};
const REMINDER_SEED = [
  {
    id: "REM-001",
    title: "Follow up with Peter Otieno",
    note: "Call him about the overdue payment of KES 13,420. He promised to pay by end of week. Check if M-Pesa payment came in.",
    dueDate: _futureDate(1),
    dueTime: "09:00",
    priority: "High",
    done: false,
    fired: false,
  },
  {
    id: "REM-002",
    title: "Board meeting prep",
    note: "Prepare the monthly portfolio report. Include PAR figures, collection rates, and disbursement totals.",
    dueDate: _futureDate(2),
    dueTime: "08:30",
    priority: "Medium",
    done: false,
    fired: false,
  },
  {
    id: "REM-003",
    title: "Disburse loan LN-2404",
    note: "David Kipchoge KES 50,000 loan approved and ready for disbursement. Confirm M-Pesa details before sending.",
    dueDate: _futureDate(3),
    dueTime: "14:00",
    priority: "High",
    done: false,
    fired: false,
  },
];

export const useReminders = () => {
  const [reminders, setReminders] = useState([]);
  const [firing, setFiring] = useState(null);

  // Fetch from Supabase on mount
  useEffect(() => {
    import("@/config/supabaseClient").then(({ supabase, DEMO_MODE }) => {
      if (DEMO_MODE || !supabase) {
        setReminders(REMINDER_SEED);
        return;
      }
      supabase.from("reminders").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setReminders(data.map(fromSupabaseReminder));
          }
        });
    });
  }, []);

  // Check every 60s for firing alerts
  useEffect(() => {
    const check = () => {
      const nowDT = new Date();
      setReminders((rs) => {
        let changed = false;
        const next = rs.map((r) => {
          if (r.done || r.fired) return r;
          const due = new Date(r.dueDate + "T" + r.dueTime + ":00");
          if (nowDT >= due) {
            changed = true;
            return { ...r, fired: true };
          }
          return r;
        });
        if (changed) {
          const fired = next.find(
            (r) => r.fired && !rs.find((x) => x.id === r.id && x.fired),
          );
          if (fired) {
            setTimeout(() => {
              try { SFX.reminder(); } catch (e) {}
              setFiring(fired);
            }, 0);
            // Persist the "fired" state change
            sbWrite("reminders", toSupabaseReminder(fired)).catch(console.error);
          }
        }
        return changed ? next : rs;
      });
    };
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  const add = (rem) => {
    setReminders((rs) => [rem, ...rs]);
    sbInsert("reminders", toSupabaseReminder(rem)).catch(console.error);
  };
  const done = (id) => {
    setReminders((rs) => {
      const target = rs.find(r => r.id === id);
      if (!target) return rs;
      const updated = { ...target, done: true };
      sbWrite("reminders", toSupabaseReminder(updated)).catch(console.error);
      return rs.map((r) => (r.id === id ? updated : r));
    });
  };
  const remove = (id) => {
    setReminders((rs) => rs.filter((r) => r.id !== id));
    sbDelete("reminders", id).catch(console.error);
  };
  const update = (rem) => {
    setReminders((rs) => rs.map((r) => (r.id === rem.id ? rem : r)));
    sbWrite("reminders", toSupabaseReminder(rem)).catch(console.error);
  };
  const dismissFiring = () => setFiring(null);

  return { reminders, add, done, remove, update, firing, dismissFiring };
};

export const ReminderAlertModal = ({ reminder, onDismiss, onDone }) => {
  const isHigh = reminder.priority === 'High';
  return (
  <div
    className="dialog-backdrop"
    style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 99998, display: "flex", alignItems: "flex-start",
      justifyContent: "center", paddingTop: MODAL_TOP_OFFSET + 30,
      paddingLeft: 20, paddingRight: 20,
      background: "rgba(4,8,16,0.8)", backdropFilter: "var(--glass-blur)",
      overflow: "hidden",
    }}
  >
    <div
      className="pop"
      style={{
        background: T.card,
        border: `2px solid ${isHigh ? T.danger : T.gold}`,
        borderRadius: 24,
        padding: "32px 28px",
        width: "100%",
        maxWidth: 380,
        boxShadow: `0 0 60px ${isHigh ? T.danger : T.gold}25, 0 40px 90px #000000`,
        textAlign: 'center'
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <div style={{ 
          marginBottom: 16, 
          animation: isHigh ? 'shake 1.5s infinite' : 'pulse 1.8s infinite',
          color: isHigh ? T.danger : T.gold,
          display: 'flex', justifyContent: 'center'
        }}>
          {isHigh ? <ShieldAlert size={50} strokeWidth={2.5} /> : <Bell size={50} strokeWidth={2.5} />}
        </div>
        <div style={{ 
          fontFamily: T.head, 
          color: isHigh ? T.danger : T.gold, 
          fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.5 
        }}>
          {isHigh ? 'Urgent Alert' : 'Reminder Notification'}
        </div>
        <div style={{ color: T.txt, fontWeight: 800, fontSize: 18, marginTop: 8 }}>
          {reminder.title}
        </div>
        <div style={{ color: T.muted, fontSize: 12, marginTop: 4 }}>
          {reminder.dueDate} at {reminder.dueTime}
        </div>
      </div>
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 18,
          color: T.dim,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {reminder.note || "No additional notes."}
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <Btn
          v="gold"
          full
          onClick={() => {
            onDone(reminder.id);
            onDismiss();
          }}
        >
          ✓ Mark Done
        </Btn>
        <Btn v="secondary" onClick={onDismiss}>
          Dismiss
        </Btn>
      </div>
    </div>
  </div>
  );
};

// FIX C — ReminderCard hoisted to module scope.
// Previously defined INSIDE RemindersPanel's render body, meaning React saw a new
// component type on every render → unmount+remount of every card, destroying any
// interactions mid-gesture and causing consistent jank in the reminders list.
const PC_COLORS = { High: T.danger, Medium: T.gold, Low: T.ok };
const ReminderCard = ({ r, onClick, onDone, onRemove }) => {
  const due = new Date(`${r.dueDate}T${r.dueTime}:00`);
  const overdue = !r.done && due < new Date();
  
  const Icon = r.done ? CheckCircle : (overdue ? AlertTriangle : (r.priority === 'High' ? Flame : (r.priority === 'Medium' ? Bell : Zap)));
  const accent = r.done ? T.ok : (overdue ? T.danger : (r.priority === 'High' ? T.danger : (r.priority === 'Medium' ? T.warn : T.blue)));

  return (
    <div
      onClick={onClick}
      style={{
        background: T.card,
        border: `1px solid ${overdue ? `${T.danger}30` : `${accent}15`}`,
        borderRadius: 18,
        padding: "16px",
        cursor: "pointer",
        transition: "all .3s cubic-bezier(0.16, 1, 0.3, 1)",
        marginBottom: 12,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 4px 12px ${accent}08`
      }}
      onMouseEnter={(e)=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 12px 24px ${accent}12`;e.currentTarget.style.borderColor=`${accent}40`;}}
      onMouseLeave={(e)=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow=`0 4px 12px ${accent}08`;e.currentTarget.style.borderColor=`${overdue ? `${T.danger}30` : `${accent}15`}`;}}
    >
      {r.priority === 'High' && !r.done && (
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: `linear-gradient(to bottom, ${T.danger}, ${T.warn})` }} />
      )}
      
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ 
          padding: '10px', borderRadius: 14, background: `${accent}10`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          border: `1px solid ${accent}20`,
          animation: (overdue || r.priority === 'High') && !r.done ? 'pulse 2s infinite' : 'none'
        }}>
          <Icon size={18} strokeWidth={2.5} />
        </div>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: r.done ? T.muted : T.txt,
            fontWeight: 800, fontSize: 14, marginBottom: 4,
            textDecoration: r.done ? "line-through" : "none",
            letterSpacing: '-0.01em'
          }}>
            {r.title}
          </div>
          <div style={{ color: T.dim, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
             <Clock size={11} strokeWidth={2.5} /> {new Date(r.dueDate).toLocaleDateString('en-GB', { day:'numeric', month:'short' })} · {r.dueTime}
             {overdue && <span style={{ color: T.danger, fontWeight: 900, textTransform: 'uppercase', fontSize: 9 }}>· Overdue</span>}
          </div>
          {r.note && (
            <div style={{
              color: T.muted, fontSize: 12, marginTop: 8, opacity: 0.8,
              lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical"
            }}>
              {r.note}
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
          <Badge sm color={accent}>{r.priority}</Badge>
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}
            style={{ 
              background: 'none', border: 'none', color: T.danger, opacity: 0.3, 
              cursor: 'pointer', padding: 4, transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {!r.done && (
          <button
            onClick={(e) => { e.stopPropagation(); onDone(r.id); SFX.save(); }}
            style={{
              background: T.accent, border: 'none', color: '#000',
              borderRadius: 10, padding: "6px 14px", fontSize: 11, fontWeight: 850, cursor: "pointer",
              boxShadow: `0 4px 10px ${T.accent}30`
            }}
          >
            Mark Done
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}
          style={{
            background: 'none', border: `1px solid ${T.border}`, color: T.dim,
            borderRadius: 10, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer"
          }}
        >
          {r.done ? 'Delete' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
};

export const RemindersPanel = ({
  reminders,
  unallocatedCount = 0,
  overdueCount = 0,
  loans = [],
  customers = [],
  payments = [],
  onAdd,
  onDone,
  onRemove,
  onUpdate,
  onClose,
  onAction,
  theme = 'light',
}) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(i);
  }, []);

  const [tab, setTab] = useState('alerts');
  const [showNew, setShowNew] = useState(false);
  const [sel, setSel] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lms_dismissed_alerts') || '[]'); } catch { return []; }
  });
  const dismissAlert = (id) => {
    setDismissed(prev => {
      const next = [...prev, id];
      localStorage.setItem('lms_dismissed_alerts', JSON.stringify(next.slice(-500)));
      return next;
    });
  };
  const [f, setF] = useState({
    title: "",
    note: "",
    dueDate: now(),
    dueTime: "09:00",
    priority: "Medium",
  });
  const s = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (!f.title) return;
    const rem = { id: uid("REM"), ...f, done: false, fired: false };
    onAdd(rem);
    SFX.save();
    setShowNew(false);
    setF({ title: "", note: "", dueDate: now(), dueTime: "09:00", priority: "Medium" });
  };

  const saveEdit = () => {
    if (!sel) return;
    onUpdate(sel);
    SFX.save();
    setSel(null);
  };

  const active = useMemo(
    () => reminders.filter((r) => !r.done).sort(
      (a, b) => new Date(a.dueDate + "T" + a.dueTime) - new Date(b.dueDate + "T" + b.dueTime)
    ),
    [reminders],
  );
  const completed = useMemo(() => reminders.filter((r) => r.done), [reminders]);

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    let cleanDate = dateStr;
    if (typeof dateStr === 'string' && dateStr.includes('/') && dateStr.includes(',')) {
      const [dPart, tPart] = dateStr.split(', ');
      const [d, m, y] = dPart.split('/');
      cleanDate = `${y}-${m}-${d}T${tPart}`;
    }
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);

    if (seconds < 0) {
      // Future date handling
      const absSec = Math.abs(seconds);
      if (absSec < 60) return 'Scheduled';
      const absMin = Math.floor(absSec / 60);
      if (absMin < 60) return `In ${absMin}m`;
      const absHr = Math.floor(absMin / 60);
      if (absHr < 24) return `In ${absHr}h`;
      return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    }

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  };

  // ── System Alerts — auto-generated from business data ──
  const systemAlerts = useMemo(() => {
    const alerts = [];
    const today = new Date();
    const todayStr = now();
    const msInDay = 1000 * 60 * 60 * 24;

    const daysSince = (dateStr) => {
      if (!dateStr) return Infinity;
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? Infinity : Math.floor((today - d) / msInDay);
    };
    const payDate = (p) => p.date || p.created_at || p.createdAt || '';

    // 1. Recent payments (last 3 days)
    payments.forEach(p => {
      if (p.status === 'Unallocated') return; // handled by unallocated banner
      const ds = daysSince(payDate(p));
      if (ds <= 3 && p.amount > 0) {
        const isRegFee = p.isRegFee === true || (typeof p.note === 'string' && (p.note.toLowerCase().includes('registration') || p.note.toLowerCase().includes('reg fee')));
        if (isRegFee) {
          const cust = customers.find(c => c.id === p.customerId);
          alerts.push({
            id: `reg-${p.id}`,
            type: 'reg_fee',
            icon: '🔑',
            color: T.gold,
            title: `Registration Fee Paid`,
            detail: `${cust?.name || 'Customer'} paid ${fmt(p.amount)}`,
            date: payDate(p),
            action: 'paymentshub',
            actionParams: { tab: 'registration-fee' },
            priority: 1
          });
        } else if (p.loanId && p.status === 'Allocated') {
          const cust = customers.find(c => c.id === p.customerId || c.name === p.customer);
          alerts.push({
            id: `pay-${p.id}`,
            type: 'payment',
            icon: '💰',
            color: T.ok,
            title: `Payment Received`,
            detail: `${fmt(p.amount)} from ${cust?.name || p.customer || 'Customer'} → Loan ${p.loanId}`,
            date: payDate(p),
            action: 'payments',
            actionParams: null,
            priority: 2
          });
        }
      }
    });

    // 2. Recently disbursed loans (last 3 days)
    loans.forEach(l => {
      const dbs = l.disbursed || l.disbursed_at || l.disbursedAt;
      if (dbs && daysSince(dbs) <= 3 && ['Active', 'Overdue'].includes(l.status)) {
        alerts.push({
          id: `disb-${l.id}`,
          type: 'disbursement',
          icon: '🏦',
          color: T.blue,
          title: `Loan Disbursed`,
          detail: `${fmt(l.amount)} disbursed to ${l.customer}`,
          date: dbs,
          action: 'paymentshub',
          actionParams: { tab: 'disbursements' },
          priority: 1
        });
      }
    });

    // 3. Loans about to be due (within 5 days)
    loans.forEach(l => {
      const dbs = l.disbursed || l.disbursed_at || l.disbursedAt;
      if (!dbs || l.status !== 'Active') return;
      const dueDate = new Date(dbs);
      dueDate.setDate(dueDate.getDate() + 30);
      
      const dueDateStr = new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      const ms = new Date(dueDateStr).getTime() - new Date(todayStr).getTime();
      const daysUntilDue = Math.round(ms / msInDay);

      if (daysUntilDue >= 0 && daysUntilDue <= 5) {
        alerts.push({
          id: `due-soon-${l.id}`,
          type: 'due_soon',
          icon: '⏰',
          color: T.warn,
          title: daysUntilDue === 0 ? `Loan Due Today` : daysUntilDue === 1 ? `Loan Due Tomorrow` : `Loan Due in ${daysUntilDue}d`,
          detail: `${l.customer} · ${fmt(l.amount)} · Loan ${l.id}`,
          date: dueDate.toISOString(),
          action: 'collections',
          actionParams: null,
          priority: 0
        });
      }
    });

    // 4. Loans that became overdue (currently overdue, within first 7 days of being overdue)
    loans.forEach(l => {
      if (!['Overdue'].includes(l.status)) return;
      const od = l.daysOverdue || 0;
      if (od > 0 && od <= 7) {
        alerts.push({
          id: `overdue-${l.id}`,
          type: 'overdue',
          icon: '🚨',
          color: T.danger,
          title: `Loan Now Overdue`,
          detail: `${l.customer} · ${od} day${od > 1 ? 's' : ''} overdue · ${fmt(l.amount)}`,
          date: todayStr,
          action: 'collections',
          actionParams: null,
          priority: 0
        });
      }
    });

    // 5. Recently settled loans (last 7 days) — status is Settled
    loans.forEach(l => {
      if (l.status !== 'Settled') return;
      // Approximate settled date from last payment
      const loanPayments = payments.filter(p => p.loanId === l.id && p.status === 'Allocated');
      const lastPay = loanPayments.sort((a, b) => new Date(payDate(b)) - new Date(payDate(a)))[0];
      if (lastPay && daysSince(payDate(lastPay)) <= 7) {
        alerts.push({
          id: `settled-${l.id}`,
          type: 'settled',
          icon: '✅',
          color: T.ok,
          title: `Loan Settled`,
          detail: `${l.customer} fully paid off Loan ${l.id}`,
          date: payDate(lastPay),
          action: 'loans',
          actionParams: null,
          priority: 1
        });
      }
    });

    // 6. New customers (last 3 days)
    customers.forEach(c => {
      const cDate = c.created_at || c.createdAt || c.joinDate || '';
      if (cDate && daysSince(cDate) <= 3) {
        alerts.push({
          id: `new-cust-${c.id}`,
          type: 'new_customer',
          icon: '👤',
          color: T.accent,
          title: `New Customer Registered`,
          detail: `${c.name} · ${c.phone || 'No phone'}`,
          date: cDate,
          action: 'customers',
          actionParams: null,
          priority: 2
        });
      }
    });

    // Sort by priority (lower = more urgent), then by date desc
    alerts.sort((a, b) => a.priority - b.priority || new Date(b.date) - new Date(a.date));
    return alerts;
  }, [loans, customers, payments]);

  const visibleAlerts = useMemo(() => systemAlerts.filter(a => !dismissed.includes(a.id)), [systemAlerts, dismissed]);

  const NOTIF_ICONS = { reg_fee: '🔑', payment: '💰', disbursement: '🏦', due_soon: '⏰', overdue: '🚨', settled: '✅', new_customer: '👤' };
  const TAB_STYLE = (isActive) => ({
    flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 800,
    letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer',
    color: isActive ? T.accent : T.muted,
    background: 'none',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: `2.5px solid ${isActive ? T.accent : 'transparent'}`,
    transition: 'all 0.2s'
  });

  return (
    <Panel
      title="Notifications"
      subtitle={`${visibleAlerts.length} alerts · ${active.length} reminders`}
      onClose={onClose}
      width={480}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 16, gap: 0 }}>
        <button onClick={() => setTab('alerts')} style={TAB_STYLE(tab === 'alerts')}>
          🔔 System Alerts {visibleAlerts.length > 0 && <span style={{ background: T.danger, color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: 9, fontWeight: 900, marginLeft: 6 }}>{visibleAlerts.length}</span>}
        </button>
        <button onClick={() => setTab('reminders')} style={TAB_STYLE(tab === 'reminders')}>
          📌 My Reminders {active.length > 0 && <span style={{ background: T.accent, color: '#000', borderRadius: 99, padding: '1px 6px', fontSize: 9, fontWeight: 900, marginLeft: 6 }}>{active.length}</span>}
        </button>
      </div>

      {/* ═══ System Alerts Tab ═══ */}
      {tab === 'alerts' && (
        <div>
          {/* Overdue Loans banner */}
          {overdueCount > 0 && (
            <div 
              onClick={() => { onAction && onAction('collections'); onClose(); }}
              style={{
                background: `linear-gradient(135deg, ${T.danger}1a 0%, ${T.danger}05 100%)`,
                border: `1px solid ${T.danger}40`,
                borderRadius: 16, padding: '16px 18px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 14,
                cursor: 'pointer', transition: 'transform 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: T.danger,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
              }}>
                <AlertTriangle size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.txt, fontWeight: 800, fontSize: 14 }}>Overdue Loans</div>
                <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>
                  <span style={{ color: T.danger, fontWeight: 800 }}>{overdueCount}</span> loan{overdueCount > 1 ? 's' : ''} currently in arrears.
                </div>
              </div>
              <div style={{ color: T.danger }}><ArrowRight size={20} /></div>
            </div>
          )}

          {/* Unallocated Payments banner */}
          {unallocatedCount > 0 && (
            <div 
              onClick={() => { onAction && onAction('paymentshub', { tab: 'paybill' }); onClose(); }}
              style={{
                background: `linear-gradient(135deg, ${T.warn}1a 0%, ${T.warn}05 100%)`,
                border: `1px solid ${T.warn}40`,
                borderRadius: 16, padding: '16px 18px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 14,
                cursor: 'pointer', transition: 'transform 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: T.warn,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
              }}>
                <CreditCard size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.txt, fontWeight: 800, fontSize: 14 }}>Unallocated Payments</div>
                <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>
                  <span style={{ color: T.warn, fontWeight: 800 }}>{unallocatedCount}</span> M-Pesa records waiting to be assigned.
                </div>
              </div>
              <div style={{ color: T.warn }}><ArrowRight size={20} /></div>
            </div>
          )}

          {/* Alert cards */}
          <div style={{ maxHeight: '55vh', overflowY: 'auto', overflowX: 'hidden' }}>
            {visibleAlerts.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button 
                  onClick={() => { 
                    const allIds = systemAlerts.map(a => a.id);
                    setDismissed(prev => {
                      const next = [...new Set([...prev, ...allIds])];
                      localStorage.setItem('lms_dismissed_alerts', JSON.stringify(next.slice(-500)));
                      return next;
                    });
                  }}
                  style={{ background: 'none', border: 'none', color: T.accent, fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <CheckCircle size={14} /> Mark all as read
                </button>
              </div>
            )}
            {visibleAlerts.length === 0 && unallocatedCount === 0 && (
              <div style={{ color: T.muted, textAlign: 'center', padding: '40px 0', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>🔔</div>
                No new system alerts
              </div>
            )}
            {visibleAlerts.map(alert => (
              <div
                key={alert.id}
                onClick={() => { if (alert.action && onAction) { onAction(alert.action, alert.actionParams || undefined); onClose(); } }}
                style={{
                  background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', 
                  border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                  borderRadius: 20, padding: '14px 16px', marginBottom: 10,
                  cursor: alert.action ? 'pointer' : 'default',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative',
                  display: 'flex', alignItems: 'center', gap: 14,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                }}
                className="hover-scale"
                onMouseEnter={e => { 
                  e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,1)'; 
                  e.currentTarget.style.borderColor = `${alert.color}60`;
                  e.currentTarget.style.boxShadow = `0 12px 24px ${alert.color}15`;
                }}
                onMouseLeave={e => { 
                  e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'; 
                  e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)';
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 14,
                  background: `linear-gradient(135deg, ${alert.color}25 0%, ${alert.color}10 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0, color: alert.color,
                  border: `1px solid ${alert.color}30`
                }}>
                  {alert.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ color: T.txt, fontWeight: 800, fontSize: 13, letterSpacing: '-0.02em', fontFamily: 'Outfit' }}>{alert.title}</div>
                    <div style={{ color: T.dim, fontSize: 10, fontWeight: 700, opacity: 0.7, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.5 }}>{timeAgo(alert.date)}</div>
                  </div>
                  <div style={{ color: T.dim, fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{alert.detail}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: 'none', color: T.dim, cursor: 'pointer',
                    width: 28, height: 28, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, opacity: 0.4, transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = `${T.danger}20`; e.currentTarget.style.color = T.danger; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = T.dim; }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Clear all dismissed */}
          {dismissed.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                onClick={() => { setDismissed([]); localStorage.removeItem('lms_dismissed_alerts'); }}
                style={{
                  background: 'none', border: `1px dashed ${T.border}`, color: T.dim,
                  borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Restore {dismissed.length} dismissed alert{dismissed.length > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ My Reminders Tab ═══ */}
      {tab === 'reminders' && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <Btn full onClick={() => setShowNew((s) => !s)} v="secondary">
              + New Personal Reminder
            </Btn>
          </div>

          {showNew && (
            <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 16px", marginBottom: 18 }}>
              <div style={{ color: T.txt, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>New Reminder</div>
              <FI label="Title" value={f.title} onChange={s("title")} required placeholder="e.g. Call Peter about overdue loan" />
              <FI label="Notes" type="textarea" value={f.note} onChange={s("note")} placeholder="Add details, context, or instructions…" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
                <FI label="Date" type="date" value={f.dueDate} onChange={s("dueDate")} half />
                <FI label="Time" type="time" value={f.dueTime} onChange={s("dueTime")} half />
              </div>
              <FI label="Priority" type="select" options={["High", "Medium", "Low"]} value={f.priority} onChange={s("priority")} />
              <div style={{ display: "flex", gap: 9 }}>
                <Btn full onClick={save}>Save Reminder</Btn>
                <Btn v="secondary" onClick={() => setShowNew(false)}>Cancel</Btn>
              </div>
            </div>
          )}

          {/* Read / Edit modal */}
          {sel && (
            <div className="dialog-backdrop" style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
              display: "flex", alignItems: "flex-start", justifyContent: "center",
              paddingTop: MODAL_TOP_OFFSET + 30, paddingLeft: 20, paddingRight: 20,
              background: "rgba(4,8,16,0.7)", backdropFilter: "var(--glass-blur)", overflow: "hidden",
            }}>
              <div className="pop" style={{
                background: T.card, border: `1px solid ${T.hi}`, borderRadius: 20,
                width: "100%", maxWidth: 440, maxHeight: "90vh",
                display: "flex", flexDirection: "column", boxShadow: "0 40px 80px #000000D0",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                  <div style={{ color: T.txt, fontWeight: 800, fontSize: 15, fontFamily: T.head }}>Edit Reminder</div>
                  <button onClick={() => setSel(null)} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 99, width: 28, height: 28, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
                  <FI label="Title" value={sel.title} onChange={(v) => setSel((s) => ({ ...s, title: v }))} required />
                  <FI label="Notes" type="textarea" value={sel.note || ""} onChange={(v) => setSel((s) => ({ ...s, note: v }))} placeholder="Notes…" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
                    <FI label="Date" type="date" value={sel.dueDate} onChange={(v) => setSel((s) => ({ ...s, dueDate: v }))} half />
                    <FI label="Time" type="time" value={sel.dueTime} onChange={(v) => setSel((s) => ({ ...s, dueTime: v }))} half />
                  </div>
                  <FI label="Priority" type="select" options={["High", "Medium", "Low"]} value={sel.priority} onChange={(v) => setSel((s) => ({ ...s, priority: v }))} />
                  <div style={{ display: "flex", gap: 9 }}>
                    <Btn full onClick={saveEdit}>Save Changes</Btn>
                    <Btn v="secondary" onClick={() => setSel(null)}>Cancel</Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {active.length === 0 && (
            <div style={{ color: T.muted, textAlign: "center", padding: "24px 0", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📌</div>
              No active reminders
            </div>
          )}
          <div style={{ maxHeight: "40vh", overflowY: "auto", overflowX: "hidden" }}>
            {active.map((r) => (
              <ReminderCard key={r.id} r={r} onClick={() => setSel({ ...r })} onDone={onDone} onRemove={onRemove} />
            ))}
          </div>

          {completed.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ color: T.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
                Completed ({completed.length})
              </div>
              <div style={{ maxHeight: "40vh", overflowY: "auto", overflowX: "hidden" }}>
                {completed.map((r) => (
                  <ReminderCard key={r.id} r={r} onClick={() => setSel({ ...r })} onDone={onDone} onRemove={onRemove} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

// ═══════════════════════════════════════════
//  CUSTOMER CONTACT POPUP
// ═══════════════════════════════════════════
// ── Contact Popover — anchored near click point ───────────────
const CustomerContactPopup = ({ name, phone, altPhone, customerId, onClose, onSMS, anchorX, anchorY }) => {
  if (!phone && !altPhone) return null;
  const popRef = useRef(null);
  
  const renderActions = (p, label, customerId) => {
    if (!p) return null;
    const cleanPhone = (p || "").replace(/\s/g, "");
    const waPhone = cleanPhone.startsWith("0") ? "254" + cleanPhone.slice(1) : cleanPhone;
    const smsText = `Dear ${(name || "").split(" ")[0]}, this is a message from Intervention Capital Ltd regarding your account. Please contact us at your earliest convenience.`;
    const waText = encodeURIComponent(`Hello ${(name || "").split(" ")[0]}, this is Intervention Capital Ltd. Please contact us regarding your account.`);

    return (
      <div key={p} style={{ marginTop: label ? 10 : 0 }}>
        {label && (
          <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingLeft: 2 }}>
            {label} ({p})
          </div>
        )}
        <div style={{ display: "flex", gap: 7 }}>
          <a
            href={`tel:${cleanPhone}`}
            onClick={() => { onClose(); SFX.send(); }}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              background: T.oLo, border: `1px solid ${T.ok}38`, borderRadius: 11, padding: "10px 6px",
              textDecoration: "none", color: T.ok, fontWeight: 700, fontSize: 11, transition: "background .15s"
            }}
          >
            <span style={{ fontSize: 20 }}>📞</span>
            <span>Call</span>
          </a>
          <button
            onClick={() => { onSMS(cleanPhone, smsText, customerId); SFX.send(); }}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              background: T.bLo, border: `1px solid ${T.blue}38`, borderRadius: 11, padding: "10px 6px",
              textDecoration: "none", color: T.blue, fontWeight: 700, fontSize: 11, cursor: "pointer"
            }}
          >
            <span style={{ fontSize: 20 }}>💬</span>
            <span>SMS</span>
          </button>
          <a
            href={`https://wa.me/${waPhone}?text=${waText}`}
            target="_blank" rel="noreferrer"
            onClick={() => { onClose(); SFX.send(); }}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              background: "#25D36618", border: "1px solid #25D36638", borderRadius: 11, padding: "10px 6px",
              textDecoration: "none", color: "#25D366", fontWeight: 700, fontSize: 11
            }}
          >
            <span style={{ fontSize: 20 }}>📱</span>
            <span>WA</span>
          </a>
        </div>
      </div>
    );
  };

  // Compute smart position
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const POPW = 260;
  const POPH = altPhone ? 280 : 168; // Adjust height if alt phone exists
  
  let left = anchorX != null ? anchorX + 16 : vw / 2 - POPW / 2;
  let top = anchorY != null ? anchorY - POPH / 2 : vh / 2 - POPH / 2;

  // Smarter positioning: flip to left of anchor if too close to right edge
  if (anchorX != null && anchorX + POPW + 32 > vw) {
    left = anchorX - POPW - 16;
  }
  
  // Final safety constraints
  left = Math.max(8, Math.min(left, vw - POPW - 12));
  top = Math.max(8, Math.min(top, vh - POPH - 12));

  useEffect(() => {
    const h = (e) => { 
      if (popRef.current && !popRef.current.contains(e.target)) {
        // If clicking on an open dialog/portal, don't close the popover
        if (e.target.closest('.dialog-backdrop') || e.target.closest('.pop')) return;
        onClose(); 
      }
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [onClose]);

  return (
    <>
      <div
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 110008, pointerEvents: "all", overflow: "hidden" }}
        onClick={onClose}
      />
      <div
        ref={popRef}
        className="pop"
        style={{
          position: "fixed", left, top, zIndex: 110009, background: T.card, border: `1px solid ${T.hi}`,
          borderRadius: 16, padding: "16px 16px 14px", width: POPW, boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          backdropFilter: "var(--glass-blur)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: T.txt, fontWeight: 800, fontSize: 14, fontFamily: T.head, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </div>
            <div style={{ color: T.muted, fontSize: 11, marginTop: 2, fontFamily: T.mono }}>
               {altPhone ? "Multiple Numbers" : phone}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 99, width: 24, height: 24, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 8 }}
          >✕</button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
           {renderActions(phone, altPhone ? "Primary" : null, customerId)}
           {altPhone && <div style={{ height: 1, background: T.border, margin: '8px 0 4px' }} />}
           {renderActions(altPhone, "Alternative", customerId)}
        </div>
      </div>
    </>
  );
};

// Hook for contact popup — SMS state is lifted here so the SMS dialog renders
// OUTSIDE the popup, preventing backdrop/z-index conflicts on textarea click.
export const useContactPopup = () => {
  const [contact, setContact] = useState(null);
  const [smsTarget, setSmsTarget] = useState(null);

  const open = (name, phone, event, altPhone, customerId) => {
    const x = event?.clientX ?? null;
    const y = event?.clientY ?? null;
    setContact({ name, phone, altPhone, x, y, customerId });
    try { SFX.notify(); } catch (e) {}
  };
  const close = () => setContact(null);

  const handleSMS = (phone, msg, customerId) => {
    setContact(null);                        // close popup first
    setSmsTarget({ phone, message: msg, customerId });   // then open SMS dialog independently
  };

  const Popup = (
    <>
      {contact && (
        <CustomerContactPopup
          name={contact.name}
          phone={contact.phone}
          altPhone={contact.altPhone}
          customerId={contact.customerId}
          onClose={close}
          onSMS={handleSMS}
          anchorX={contact.x}
          anchorY={contact.y}
        />
      )}
      {smsTarget && (
        <SendSMSDialog
          phone={smsTarget.phone}
          initialMessage={smsTarget.message}
          customerId={smsTarget.customerId}
          onClose={() => setSmsTarget(null)}
          zIndex={120000}
        />
      )}
    </>
  );

  return { open, close, Popup };
};

// ── Internal SMS Dialog ──
const SendSMSDialog = ({ phone, initialMessage = "", customerId, onClose, zIndex = 120000 }) => {
  const [recipient, setRecipient] = useState(phone || "");
  const [text, setText] = useState(() => {
    try { return decodeURIComponent(initialMessage || ""); } catch(e) { return initialMessage || ""; }
  });
  const [loading, setLoading] = useState(false);
  const { show: showToast } = useToast();

  const handleSend = async () => {
    if (!text.trim() || !recipient.trim()) return;
    setLoading(true);
    try {
      const { supabase } = await import("@/config/supabaseClient");
      if (!supabase) throw new Error("Supabase not connected");
      
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { msisdn: recipient.trim(), message: text }
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.response?.message || "Failed to send SMS");
      
      showToast("SMS sent successfully", "ok");

      // ── LOG TO DB ──
      try {
        await supabase.from('sms_logs').insert([{
          phone: recipient.trim(),
          message: text,
          customer_id: customerId,
          source: 'Admin Portal',
          status_code: 200,
          response_body: data,
          sender_id: 'Admin' // Fallback
        }]);
      } catch(e) { console.error('[SMS Log Error]', e); }
      
      try {
        addAudit("SMS Sent", recipient.trim(), text.substring(0, 100));
      } catch(e) {}
      
      SFX.save();
      onClose();
    } catch (err) {
      showToast("Failed to send: " + err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Force focus to textarea after Dialog's mount focus logic runs
    setTimeout(() => {
      const ta = document.querySelector('textarea[placeholder="Type your message here..."]');
      if (ta) ta.focus();
    }, 100);
  }, []);

  return (
    <Dialog title="Send SMS" onClose={onClose} width={400} zIndex={zIndex}>
       <div style={{ padding: "8px 4px 4px" }}>
          <FI
             label="Recipient"
             value={recipient}
             onChange={setRecipient}
             placeholder="e.g. 0712345678"
             style={{ marginBottom: 0 }}
          />
          
          <FI 
            label="Message" 
            type="textarea" 
            value={text} 
            onChange={setText} 
            placeholder="Type your message here..."
          />
          
          <div style={{ marginTop: 8, fontSize: 11, color: T.muted, textAlign: 'right', fontWeight: 600 }}>
             {text.length} characters · {Math.ceil(text.length / 160)} page(s)
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
             <Btn v="secondary" onClick={onClose} full>Cancel</Btn>
             <Btn onClick={handleSend} disabled={loading || !text.trim()} full icon={Send}>
                {loading ? "Sending..." : "Send SMS"}
             </Btn>
          </div>
       </div>
    </Dialog>
  );
};

export const useSMS = () => {
  const [smsData, setSmsData] = useState(null); // { phone, msg, customerId }
  const open = (phone, msg = "", customerId = null) => setSmsData({ phone, msg, customerId });
  const close = () => setSmsData(null);
  const Dialog = smsData ? (
    <SendSMSDialog
      phone={smsData.phone}
      initialMessage={smsData.msg}
      customerId={smsData.customerId}
      onClose={close}
    />
  ) : null;
  return { open, close, Dialog };
};

// ═══════════════════════════════════════════
//  DASHBOARD — Animated Pie Charts
// ═══════════════════════════════════════════
const DonutChart = ({
  segments,
  size = 160,
  thickness = 32,
  label,
  sub,
  centerValue,
  centerLabel,
  onClickSegment,
}) => {
  const [animated, setAnimated] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [clicked, setClicked] = useState(null);
  const hovRef = useRef(null);

  // FIX 2A — Animation: previously animated=false made animEnd===startA (zero-length arc)
  // so SVG rendered nothing until the 80ms timeout fired. Now segments always draw at full
  // size; the CSS 'pop' class on the SVG wrapper handles the visual entrance animation.
  // The animated state is kept only for the clip/scale entrance, not for arc geometry.
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 60);
    return () => clearTimeout(t);
  }, []);

  const setHovDebounced = useCallback((i) => {
    clearTimeout(hovRef.current);
    if (i === null) {
      hovRef.current = setTimeout(() => setHovered(null), 60);
    } else {
      setHovered(i);
    }
  }, []);

  const total = segments.reduce((s, sg) => s + sg.value, 0) || 1;
  const R = size / 2;
  const r = R - thickness;
  const cx = R,
    cy = R;

  const segAngles = useMemo(() => {
    let cum = -Math.PI / 2;
    return segments.map((sg) => {
      let angle = (sg.value / total) * (Math.PI * 2);
      // SVG arcs fail to render if start === end (angle === 2PI). 
      // Cap at 1.9999PI to draw a visually perfect circle.
      if (angle >= Math.PI * 2) angle = Math.PI * 1.9999;
      const start = cum;
      cum += angle;
      return { start, end: cum, angle, mid: start + angle / 2 };
    });
  }, [segments, total]);

  const paths = segments.map((sg, i) => {
    const { start: startA, angle, mid: midA } = segAngles[i];
    if (sg.value === 0) return null;

    // FIX 2B — Always use the full angle for geometry. Previously (animated ? angle : 0)
    // produced zero-length arcs (invisible) before the 80ms timeout. Now segments are
    // always drawn at full size. The entrance animation is CSS-only (opacity on the SVG).
    const endA = startA + angle;
    const x1 = cx + R * Math.cos(startA),
      y1 = cy + R * Math.sin(startA);
    const x2 = cx + R * Math.cos(endA),
      y2 = cy + R * Math.sin(endA);
    const ix1 = cx + r * Math.cos(startA),
      iy1 = cy + r * Math.sin(startA);
    const ix2 = cx + r * Math.cos(endA),
      iy2 = cy + r * Math.sin(endA);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large},0 ${ix1},${iy1} Z`;
    const isHov = hovered === i;
    const isClick = clicked === i;
    const off = isHov ? 7 : isClick ? 5 : 0;
    const tx = off ? Math.cos(midA) * off : 0;
    const ty = off ? Math.sin(midA) * off : 0;
    const hR = R + 6,
      hr = Math.max(r - 6, 2);
    const hx1 = cx + hR * Math.cos(startA),
      hy1 = cy + hR * Math.sin(startA);
    const hx2 = cx + hR * Math.cos(endA),
      hy2 = cy + hR * Math.sin(endA);
    const hix1 = cx + hr * Math.cos(startA),
      hiy1 = cy + hr * Math.sin(startA);
    const hix2 = cx + hr * Math.cos(endA),
      hiy2 = cy + hr * Math.sin(endA);
    const hd = `M${hx1},${hy1} A${hR},${hR} 0 ${large},1 ${hx2},${hy2} L${hix2},${hiy2} A${hr},${hr} 0 ${large},0 ${hix1},${hiy1} Z`;
    return (
      <g
        key={i}
        onMouseEnter={() => setHovDebounced(i)}
        onMouseLeave={() => setHovDebounced(null)}
        onClick={() => {
          setClicked(i);
          setTimeout(() => setClicked(null), 600);
          if (onClickSegment) onClickSegment(sg, i);
        }}
      >
        <path d={hd} fill="transparent" style={{ cursor: "pointer" }} />
        <path
          d={d}
          fill={sg.color}
          opacity={
            clicked !== null
              ? isClick
                ? 1
                : 0.35
              : hovered === null
                ? 1
                : isHov
                  ? 1
                  : 0.5
          }
          transform={`translate(${tx},${ty})`}
          filter={isClick ? `drop-shadow(0 0 8px ${sg.color})` : "none"}
          style={{
            transition:
              "opacity .15s, transform .18s cubic-bezier(.22,1,.36,1)",
            cursor: "pointer",
            pointerEvents: "none",
          }}
        />
      </g>
    );
  });

  const hovSeg =
    hovered !== null
      ? segments[hovered]
      : clicked !== null
        ? segments[clicked]
        : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {label && (
        <div
          style={{
            color: T.txt,
            fontWeight: 700,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          overflow: "visible",
        }}
      >
        <svg
          width={size}
          height={size}
          style={{
            overflow: "visible",
            opacity: animated ? 1 : 0,
            transition: "opacity .3s ease",
          }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={(R + r) / 2}
            fill="none"
            stroke={T.border}
            strokeWidth={thickness}
            opacity={0.4}
          />
          {paths}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {hovSeg ? (
            <>
              <div
                style={{
                  color: hovSeg.color,
                  fontWeight: 900,
                  fontSize: 14,
                  fontFamily: T.mono,
                  lineHeight: 1,
                }}
              >
                {((hovSeg.value / total) * 100).toFixed(1)}%
              </div>
              <div
                style={{
                  color: T.muted,
                  fontSize: 10,
                  marginTop: 2,
                  textAlign: "center",
                  maxWidth: r * 1.4,
                }}
              >
                {hovSeg.label}
              </div>
            </>
          ) : (
            <>
              {centerValue && (
                <div style={{ color: T.txt, fontWeight: 800, fontSize: 13 }}>
                  {centerValue}
                </div>
              )}
              {centerLabel && (
                <div style={{ color: T.muted, fontSize: 9 }}>{centerLabel}</div>
              )}
            </>
          )}
        </div>
      </div>
      {sub && (
        <div style={{ color: T.muted, fontSize: 10, marginTop: 4 }}>{sub}</div>
      )}
      {/* Segment Legend — always visible so info is never "lost" */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", marginTop: 6 }}>
        {segments.filter(sg => sg.value > 0).map((sg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: sg.color, flexShrink: 0 }} />
            <span style={{ color: T.muted, fontSize: 10, flex: 1, lineHeight: 1.3 }}>{sg.label}</span>
            <span style={{ color: sg.color, fontWeight: 800, fontFamily: T.mono, fontSize: 10 }}>
              {((sg.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const deriveDashboardMetrics = (loans = [], payments = [], customers = [], filters = {}) => {
  const { startDate, endDate } = filters;

  // 1. Calculate historical paidMap up to endDate for status checks
  // (We need full history to know if a loan IS settled, not just payments in the window)
  const fullPaidMap = (payments || []).reduce((acc, p) => {
    // Match CustomerProfile logic exactly for fullPaidMap so drilldowns perfectly align
    if (p.loanId && (!endDate || localDateStr(p.date) <= endDate))
      acc[p.loanId] = (acc[p.loanId] || 0) + Number(p.amount || 0);
    return acc;
  }, {});

  let filteredLoans = loans;
  let filteredPayments = payments;

  if (startDate && endDate) {
    // Cohort state (Loans): strictly include loans disbursed in the window
    filteredLoans = loans.filter(l => {
      const d = l.disbursed || l.disbursedAt || l.createdAt?.split('T')[0];
      return d && d >= startDate && d <= endDate;
    });

    // Performance flow (Payments): strictly windowed
    filteredPayments = payments.filter(p => {
      const d = localDateStr(p.date);
      return d && d >= startDate && d <= endDate;
    });
  }

  // 2. Metrics paidMap for the SELECTED window (used for collections rate etc)
  const windowPaidMap = filteredPayments.reduce((acc, p) => {
    const isAllocated = (p.status || "").toLowerCase() === "allocated";
    if (p.loanId && isAllocated)
      acc[p.loanId] = (acc[p.loanId] || 0) + Number(p.amount || 0);
    return acc;
  }, {});

  let book = 0, active = 0, overdue = 0, written = 0, approved = 0;
  let totalDisb = 0, ovAmt = 0, settledVolume = 0, writtenVolume = 0, approvedVolume = 0, activeVolume = 0;
  let par1 = 0, par7 = 0, par30 = 0, parTotal = 0, healthyCount = 0;
  
  const activeList = [], ovList = [];

  filteredLoans.forEach(l => {
    const pTotal = fullPaidMap[l.id] || 0;
    const e = calculateLoanStatus(l, null, pTotal);
    
    // 0. Skip non-disbursed records (Rejected, Pending, etc.)
    if (['Rejected', 'Declined', 'Cancelled', 'Application submitted', 'worker-pending'].includes(e.badgeStatus)) return;

    const pWindow = windowPaidMap[l.id] || 0;
    
    // 1. Handle Approved loans (not yet disbursed)
    if (e.badgeStatus === 'Approved') {
      approved++;
      approvedVolume += (l.amount || 0);
      return;
    }

    // 2. Handle Disbursed loans (Active, Overdue, Settled, etc.)
    if (e.isSettled) {
      settledVolume += (l.amount || 0);
      totalDisb += (l.amount || 0);
      return;
    }

    totalDisb += (l.amount || 0);
    parTotal++;

    if (e.badgeStatus === 'Written off') {
      written++;
      writtenVolume += (l.amount || 0);
    } else if (e.badgeStatus === 'Overdue' || e.badgeStatus === 'Frozen') {
      overdue++;
      book += e.totalAmountDue;
      ovAmt += e.totalAmountDue;
      ovList.push(l);
      par1++;
      if (e.overdueDays >= 7) par7++;
      if (e.overdueDays >= 30) par30++;
    } else {
      active++;
      book += e.totalAmountDue;
      activeVolume += e.totalAmountDue; // Keep track of active performing portfolio volume
      activeList.push(l);
      healthyCount++;
    }
  });

  const unalloc = filteredPayments.filter(p => !p.loanId || p.status === "Unallocated").reduce((s, p) => s + p.amount, 0);
  const coll = filteredPayments.filter(p => p.loanId && (p.status || "").toLowerCase() === "allocated").reduce((s, p) => s + Number(p.amount || 0), 0);

  let prevDisb = 0;
  let prevCohortLoanIds = new Set();
  let prevStartStr = null, prevEndStr = null;
  if (startDate && endDate) {
    const shiftMonth = (dateStr, offset) => {
      const [y, m, d] = dateStr.split('-');
      const date = new Date(y, m - 1 + offset, d);
      if (date.getDate() < parseInt(d, 10)) date.setDate(0);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    };
    prevStartStr = shiftMonth(startDate, -1);
    prevEndStr = shiftMonth(endDate, -1);
    
    loans.forEach(l => {
      const d = l.disbursed || l.disbursedAt || l.createdAt?.split('T')[0];
      const status = l.status || 'Active';
      if (d && d >= prevStartStr && d <= prevEndStr && !['Rejected', 'Declined', 'Cancelled', 'Application submitted', 'worker-pending'].includes(status)) {
        prevDisb += (l.amount || 0);
        prevCohortLoanIds.add(l.id);
      }
    });
  } else {
    prevDisb = totalDisb;
    filteredLoans.forEach(l => prevCohortLoanIds.add(l.id));
  }

  const totalExpectedVolume = prevDisb * 1.3;
  
  let prevCohortCollections = 0;
  payments.forEach(p => {
    const isAllocated = (p.status || "").toLowerCase() === "allocated";
    if (prevCohortLoanIds.has(p.loanId) && isAllocated) {
      if (!endDate || localDateStr(p.date) <= endDate) {
        prevCohortCollections += Number(p.amount || 0);
      }
    }
  });

  const collRate = totalExpectedVolume > 0 
    ? ((prevCohortCollections / totalExpectedVolume) * 100).toFixed(1) 
    : "0.0";
    
  const prevCohortRemaining = Math.max(0, totalExpectedVolume - prevCohortCollections);

  const activeBorrowerIds = new Set();
  filteredLoans.forEach(l => {
    const p = fullPaidMap[l.id] || 0;
    const e = calculateLoanStatus(l, null, p);
    if (!['Settled', 'Written off', 'Approved', 'Application submitted', 'worker-pending'].includes(e.badgeStatus)) {
      if (l.customerId) activeBorrowerIds.add(l.customerId);
    }
  });
  const activeBorrowersCount = activeBorrowerIds.size;
  const filteredCustomers = customers.filter(c => activeBorrowerIds.has(c.id));

  const pendingApprovals = filteredLoans.filter(l => l.status === 'Application submitted' || l.status === 'worker-pending').length;

  return { 
    book, active, overdue, written, approved, totalDisb, prevDisb, coll, ovAmt, unalloc, 
    settledVolume, writtenVolume, approvedVolume, activeVolume, par1, par7, par30, parTotal, healthyCount, 
    totalExpectedVolume, prevCohortCollections, prevCohortRemaining, prevStartStr, prevEndStr, prevCohortLoanIds, paidMap: fullPaidMap, windowPaidMap, activeList, ovList, collRate, activeBorrowersCount,
    pendingApprovals, filteredCustomers
  };
};

export const LivePortfolioChart = ({
  loans,
  payments,
  customers,
  onNav,
  setDrill,
  openContact,
  custPhone,
  scrollTop,
}) => {
  const getInitialDates = () => {
    const d = new Date();
    const first = localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
    const last = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { first, last };
  };

  const { first, last } = getInitialDates();
  const [startDate, setStartDate] = useState(first);
  const [endDate, setEndDate] = useState(last);
  const [focus, setFocus] = useState("All");

  const derived = useMemo(() => 
    deriveDashboardMetrics(loans, payments, customers, { startDate, endDate }), 
  [loans, payments, customers, startDate, endDate]);

  const { book, active, overdue, written, approved, totalDisb, prevDisb, coll, unalloc, settledVolume, writtenVolume, approvedVolume, ovAmt, par1, par7, par30, parTotal, healthyCount, totalExpectedVolume, prevCohortCollections, prevCohortRemaining, prevStartStr, prevEndStr, paidMap, collRate, filteredCustomers = customers } = derived;

  const fmtK = (v) =>
    v >= 1e6
      ? (v / 1e6).toFixed(2) + "M"
      : v >= 1e3
        ? (v / 1e3).toFixed(1) + "K"
        : v.toLocaleString("en-KE");

  const activeBookValue = book - ovAmt;

  const charts = [
    {
      id: "portfolio",
      label: "Loan Portfolio",
      sub: `${active} active · ${overdue} overdue`,
      centerValue: `KES ${fmtK(book)}`,
      centerLabel: "Book Value",
      segments: [
        {
          label: "Active Loans",
          value: activeBookValue,
          color: T.ok,
          nav: "loans",
          navFilter: "Active",
        },
        {
          label: "Overdue",
          value: ovAmt,
          color: T.danger,
          nav: "collections",
          navFilter: "Overdue",
        },
        {
          label: "Approved (pending)",
          value: approvedVolume,
          color: T.gold,
          nav: "loans",
          navFilter: "Approved",
        },
      ],
    },
    {
      id: "collections",
      label: "Collections",
      sub: `Prev Disbursed: KES ${fmtK(prevDisb)}`,
      centerValue: `${collRate}%`,
      centerLabel: "Rate",
      segments: [
        {
          label: "Collected",
          value: prevCohortCollections,
          color: T.accent,
          nav: "payments",
          navFilter: "Allocated",
        },
        {
          label: "Remaining",
          value: prevCohortRemaining,
          color: T.warn,
          nav: "loans",
          navFilter: "Active",
        },
      ],
    },
    {
      id: "par",
      label: "Portfolio at Risk",
      sub: `${par1} loans overdue`,
      centerValue: `${parTotal > 0 ? ((par1 / parTotal) * 100).toFixed(1) : 0}%`,
      centerLabel: "PAR",
      segments: [
        {
          label: "Healthy (paying)",
          value: healthyCount,
          color: T.ok,
          nav: "loans",
          navFilter: "Active",
        },
        {
          label: "PAR 1–6 days",
          value: par1 - par7,
          color: T.warn,
          nav: "collections",
          navFilter: "Overdue",
        },
        {
          label: "PAR 7–29 days",
          value: par7 - par30,
          color: T.danger,
          nav: "collections",
          navFilter: "Overdue",
        },
        {
          label: "PAR 30+ days",
          value: par30,
          color: T.purple,
          nav: "collections",
          navFilter: "Overdue",
        },
      ],
    },
    {
      id: "risk",
      label: "Customer Risk",
      sub: `${filteredCustomers.length} total customers`,
      centerValue: filteredCustomers.length,
      centerLabel: "Customers",
      segments: [
        {
          label: "Low risk",
          value: filteredCustomers.filter((c) => c.risk === "Low").length,
          color: T.ok,
          nav: "customers",
          navFilter: "Low",
        },
        {
          label: "Medium risk",
          value: filteredCustomers.filter((c) => c.risk === "Medium").length,
          color: T.warn,
          nav: "customers",
          navFilter: "Medium",
        },
        {
          label: "High risk",
          value: filteredCustomers.filter((c) => c.risk === "High").length,
          color: T.danger,
          nav: "customers",
          navFilter: "High",
        },
        {
          label: "Very High risk",
          value: filteredCustomers.filter((c) => c.risk === "Very High").length,
          color: T.purple,
          nav: "customers",
          navFilter: "Very High",
        },
      ],
    },
  ];

  const visibleCharts = focus === "All" ? charts : charts.filter(c => c.id === focus);

  return (
    <Card style={{ marginBottom: 16 }}>
      <div
        style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              color: T.txt,
              fontWeight: 900,
              fontSize: 15,
              fontFamily: T.head,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
          >
            <BarChart3 size={18} color={T.accent} /> Portfolio Performance
          </div>
          <div style={{ color: T.muted, fontSize: 11, marginTop: 4, fontWeight: 600 }}>
            Period: {new Date(startDate).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
           <DateRangePicker 
              start={startDate} 
              end={endDate} 
              onStartChange={setStartDate} 
              onEndChange={setEndDate}
              onSearch={() => {}} // Live update is handled by useMemo, but button exists in component
           />

           {/* Chart Selector */}
           <select 
             value={focus} 
             onChange={e => setFocus(e.target.value)}
             style={{ height: 32, padding: '0 10px', fontSize: 11, fontWeight: 800, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, color: T.txt }}
           >
              <option value="All">All Performance Charts</option>
              <option value="portfolio">Loan Portfolio Focus</option>
              <option value="collections">Collections Focus</option>
              <option value="par">Risk Analysis (PAR)</option>
              <option value="risk">Customer Risk Levels</option>
           </select>

           <div style={{ width: 1, height: 20, background: T.border }} />

           <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: T.ok,
                boxShadow: `0 0 6px ${T.ok}88`,
              }}
            />
            <span style={{ color: T.muted, fontSize: 11, fontWeight: 700 }}>Interactive</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "20px 18px" }}>
        <div className="port-grid">
          {visibleCharts.map((c, i) => (
            <DonutChart
              key={c.id || c.label}
              {...c}
              size={164}
              thickness={28}
              onClickSegment={(seg) => {
                try {
                  SFX.notify();
                } catch (e) {}
                // Build drill data based on segment label/navFilter
                const nf = seg.navFilter;
                let rows = [],
                  title = seg.label,
                  cols = [];
                const fmtV = (v) => (
                  <span style={{ fontFamily: "monospace", color: T.accent }}>
                    {v >= 1e6
                      ? (v / 1e6).toFixed(2) + "M"
                      : v >= 1e3
                        ? (v / 1e3).toFixed(1) + "K"
                        : (v?.toLocaleString?.() ?? v)}
                  </span>
                );
                if (seg.nav === "loans" || seg.nav === "collections") {
                  rows = loans
                    .filter((l) => {
                      const d = l.disbursed || l.disbursedAt || l.createdAt?.split('T')[0];
                      
                      if (c.id === "collections") {
                        if (prevStartStr && prevEndStr) {
                          if (d < prevStartStr || d > prevEndStr) return false;
                        }
                      } else {
                        if (startDate && endDate) {
                          if (d < startDate || d > endDate) return false;
                        }
                      }

                      const p = paidMap[l.id] || 0;
                      const e = calculateLoanStatus(l, null, p);
                      
                      // Match the derived logic exactly
                      if (seg.label === "Active Loans")
                        return e.badgeStatus === "Active";
                      if (seg.label === "Overdue")
                        return e.badgeStatus === "Overdue" || e.badgeStatus === "Frozen";
                      if (seg.label === "Written off") 
                        return e.badgeStatus === "Written off";
                      if (seg.label === "Approved (pending)")
                        return l.status === "Approved" && !e.isSettled;
                      if (seg.label === "Healthy (paying)")
                        return (
                          !e.isSettled && 
                          !e.isWrittenOff && 
                          e.overdueDays <= 0 && 
                          l.status === "Active"
                        );
                      if (seg.label === "PAR 1–6 days")
                        return (
                          (e.badgeStatus === "Overdue" || e.badgeStatus === "Frozen") &&
                          e.overdueDays >= 1 &&
                          e.overdueDays < 7
                        );
                      if (seg.label === "PAR 7–29 days")
                        return (
                          (e.badgeStatus === "Overdue" || e.badgeStatus === "Frozen") &&
                          e.overdueDays >= 7 &&
                          e.overdueDays < 30
                        );
                      if (seg.label === "PAR 30+ days")
                        return (
                          (e.badgeStatus === "Overdue" || e.badgeStatus === "Frozen") &&
                          e.overdueDays >= 30
                        );
                      if (seg.label === "Outstanding" || seg.label === "Remaining" || seg.label === "Collected")
                        return (e.badgeStatus === "Active" || e.badgeStatus === "Overdue" || e.badgeStatus === "Frozen");
                      if (seg.label === "Settled")
                        return e.isSettled;
                      if (seg.label === "Written off")
                        return e.badgeStatus === "Written off";
                      
                      return nf ? (l.status === nf || e.badgeStatus === nf) : true;
                    })
                    .map((l) => {
                      const p = paidMap[l.id] || 0;
                      const e = calculateLoanStatus(l, null, p);
                      return {
                        ...l,
                        balance: e.totalAmountDue,
                        daysOverdue: e.overdueDays,
                        totalDays: e.totalDays,
                      };
                    });

                  cols = [
                    {
                      k: "id",
                      l: "Loan ID",
                      r: (v) => (
                        <span
                          style={{
                            color: T.accent,
                            fontFamily: "monospace",
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          {v}
                        </span>
                      ),
                    },
                    {
                      k: "customer",
                      l: "Customer",
                      r: (v) => {
                        const ph = custPhone?.(v) || "";
                        return (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              openContact?.(v, ph, e);
                            }}
                            style={{
                              color: T.accent,
                              cursor: "pointer",
                              fontWeight: 600,
                              borderBottom: `1px dashed ${T.accent}50`,
                            }}
                          >
                            {v}
                          </span>
                        );
                      },
                    },
                    { k: "balance", l: "Balance", r: (v) => fmt(v) },
                    {
                      k: "status",
                      l: "Status",
                      r: (v, row) => {
                        const p = paidMap[row.id] || 0;
                        const e = calculateLoanStatus(row, null, p);
                        return (
                          <Badge color={SC[e.badgeStatus] || T.muted}>
                            {e.status}
                          </Badge>
                        );
                      },
                    },
                    {
                      k: "totalDays",
                      l: "Days",
                      r: (v) => (
                        <span
                          style={{
                            color: v > 120 ? T.danger : T.txt,
                            fontWeight: 800,
                            fontFamily: "monospace",
                          }}
                        >
                          {v}d
                        </span>
                      ),
                    },
                    { k: "officer", l: "Officer" },
                  ];
                } else if (seg.nav === "payments") {
                  rows = payments.filter((p) => {
                    if (c.id === "collections") {
                      return derived.prevCohortLoanIds.has(p.loanId) && (!endDate || localDateStr(p.date) <= endDate);
                    } else {
                      const d = localDateStr(p.date);
                      const inDate = (startDate && endDate) ? (d >= startDate && d <= endDate) : true;
                      return inDate && (nf ? p.status === nf : true);
                    }
                  });
                  cols = [
                    {
                      k: "id",
                      l: "Pay ID",
                      r: (v) => (
                        <span
                          style={{
                            color: T.accent,
                            fontFamily: "monospace",
                            fontSize: 12,
                          }}
                        >
                          {v}
                        </span>
                      ),
                    },
                    {
                      k: "customer",
                      l: "Customer",
                      r: (v) => {
                        const ph = custPhone?.(v) || "";
                        return (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              openContact?.(v, ph, e);
                            }}
                            style={{
                              color: T.accent,
                              cursor: "pointer",
                              fontWeight: 600,
                              borderBottom: `1px dashed ${T.accent}50`,
                            }}
                          >
                            {v}
                          </span>
                        );
                      },
                    },
                    {
                      k: "amount",
                      l: "Amount",
                      r: (v) => (
                        <span
                          style={{
                            color: T.ok,
                            fontFamily: "monospace",
                            fontWeight: 700,
                          }}
                        >
                          {fmt(v)}
                        </span>
                      ),
                    },
                    { k: "mpesa", l: "M-Pesa" },
                    { k: "date", l: "Date" },
                    {
                      k: "status",
                      l: "Status",
                      r: (v) => <Badge color={SC[v] || T.muted}>{v}</Badge>,
                    },
                  ];
                } else if (seg.nav === "customers") {
                  rows = customers.filter((c) => (nf ? c.risk === nf : true));
                  cols = [
                    {
                      k: "id",
                      l: "ID",
                      r: (v) => (
                        <span
                          style={{
                            color: T.accent,
                            fontFamily: "monospace",
                            fontSize: 12,
                          }}
                        >
                          {v}
                        </span>
                      ),
                    },
                    {
                      k: "name",
                      l: "Name",
                      r: (v, r) => (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            openContact?.(v, r.phone, e);
                          }}
                          style={{
                            color: T.accent,
                            cursor: "pointer",
                            fontWeight: 600,
                            borderBottom: `1px dashed ${T.accent}50`,
                          }}
                        >
                          {v}
                        </span>
                      ),
                    },
                    { k: "phone", l: "Phone" },
                    { k: "business", l: "Business" },
                    {
                      k: "risk",
                      l: "Risk",
                      r: (v) => <Badge color={RC[v]}>{v}</Badge>,
                    },
                  ];
                }
                if (setDrill && rows.length > 0)
                  setDrill({
                    title: `${seg.label} — ${rows.length} records`,
                    rows,
                    cols,
                    color: seg.color,
                  });
                else if (onNav && seg.nav) {
                  onNav(seg.nav);
                }
              }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
};

// ═══════════════════════════════════════════
//  7-DAY COLLECTIONS BAR CHART
// ═══════════════════════════════════════════
export const WeeklyCollectionsChart = ({ payments }) => {
  const [selDay, setSelDay] = useState(null);
  // FIX — memoize the days array. Previously it called new Date(), filter, and reduce
  // for every day on every render. Now it only recalculates when payments change.
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const label = d.toLocaleDateString("en-KE", {
          weekday: "short",
          day: "numeric",
        });
        const dayPays = payments.filter((p) => localDateStr(p.date) === iso);
        const total = dayPays.reduce((s, p) => s + p.amount, 0);
        const isToday = iso === now();
        return {
          iso,
          label,
          total,
          count: dayPays.length,
          pays: dayPays,
          isToday,
        };
      }),
    [payments],
  );
  const maxVal = Math.max(...days.map((d) => d.total), 1);
  const COLORS = [T.accent, T.blue, T.purple, T.ok, T.gold, T.warn, T.danger];
  const fmtK = (v) =>
    v >= 1e6
      ? (v / 1e6).toFixed(2) + "M"
      : v >= 1e3
        ? (v / 1e3).toFixed(1) + "K"
        : v.toLocaleString("en-KE");
  const totalWeek = days.reduce((s, d) => s + d.total, 0);
  const totalCount = days.reduce((s, d) => s + d.count, 0);
  return (
    <Card style={{ marginBottom: 12 }}>
      <CH
        title="💳 7-Day Collections"
        sub={`${totalCount} payments · KES ${fmtK(totalWeek)} total this week`}
      />
      <div style={{ padding: "16px 18px" }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-end",
            height: 120,
            marginBottom: 12,
          }}
        >
          {days.map((d, i) => {
            const pct = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
            const color = COLORS[i];
            const isSel = selDay && selDay.iso === d.iso;
            return (
              <div
                key={d.iso}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  cursor: d.count > 0 ? "pointer" : "default",
                }}
                onClick={() => {
                  if (d.count > 0) {
                    try {
                      SFX.notify();
                    } catch (e) {}
                    setSelDay(isSel ? null : d);
                  }
                }}
              >
                <div
                  style={{
                    color: color,
                    fontSize: 9,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    opacity: d.total > 0 ? 1 : 0,
                  }}
                >
                  {fmtK(d.total)}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max(pct, 2)}%`,
                    background: isSel
                      ? color
                      : d.total > 0
                        ? color + "CC"
                        : T.border,
                    borderRadius: "6px 6px 3px 3px",
                    transition:
                      "height .4s cubic-bezier(.22,1,.36,1), background .2s",
                    boxShadow: isSel ? `0 0 14px ${color}55` : "none",
                    border: isSel
                      ? `1px solid ${color}`
                      : "1px solid transparent",
                    minHeight: 4,
                  }}
                />
                <div
                  style={{
                    color: d.isToday ? color : T.muted,
                    fontSize: 9,
                    fontWeight: d.isToday ? 800 : 500,
                    textAlign: "center",
                    lineHeight: 1.3,
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.label.split(" ")[0]}
                  <br />
                  {d.label.split(" ")[1] || ""}
                </div>
              </div>
            );
          })}
        </div>
        {selDay && (
          <div
            className="expand-in"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: "14px 16px",
              marginTop: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div>
                <div style={{ color: T.txt, fontWeight: 800, fontSize: 13 }}>
                  {selDay.isToday ? "Today" : selDay.label}
                </div>
                <div style={{ color: T.muted, fontSize: 11, marginTop: 2 }}>
                  {selDay.count} payment{selDay.count !== 1 ? "s" : ""} · KES{" "}
                  {fmtK(selDay.total)}
                </div>
              </div>
              <button
                onClick={() => setSelDay(null)}
                style={{
                  background: "none",
                  border: `1px solid ${T.border}`,
                  color: T.muted,
                  borderRadius: 99,
                  width: 24,
                  height: 24,
                  cursor: "pointer",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>
            {selDay.pays.length === 0 ? (
              <div
                style={{
                  color: T.muted,
                  fontSize: 12,
                  textAlign: "center",
                  padding: "8px 0",
                }}
              >
                No payments on this day
              </div>
            ) : (
              <div
                style={{
                  maxHeight: "40vh",
                  overflowY: "auto",
                  overflowX: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {selDay.pays.map((p, i) => (
                  <div
                    key={p.id || i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "7px 10px",
                      background: T.card,
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <div>
                      <div
                        style={{ color: T.txt, fontWeight: 600, fontSize: 12 }}
                      >
                        {p.customer || "Unknown"}
                      </div>
                      <div style={{ color: T.muted, fontSize: 11 }}>
                        {p.mpesa || "—"} · {p.loanId || "Unallocated"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          color: p.status === "Allocated" ? T.ok : T.warn,
                          fontWeight: 800,
                          fontSize: 13,
                          fontFamily: "monospace",
                        }}
                      >
                        KES {(p.amount || 0).toLocaleString("en-KE")}
                      </div>
                      <div
                        style={{ color: T.muted, fontSize: 10, marginTop: 1 }}
                      >
                        {p.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════
//  REPAYMENT SCHEDULE TRACKER
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
//  PAYMENT ENGINE v3 — strictly conforms to Issue 2 requirements
// ═══════════════════════════════════════════════════════════════════════════════

export var computeLoanSchedule = function (loan, allPayments) {
  if (!loan || !loan.disbursed)
    return { slots: [], ledger: [], runningBalance: 0, summary: {} };

  var todayStr = now();
  var rt = loan.repaymentType || "Monthly";
  var principal = Number(loan.amount) || 0;
  var loanDiscount = Number(loan.interestDiscount || 0);
  var effectiveRate = 0.3 * (1 - loanDiscount / 100);
  var interest = Math.round(principal * effectiveRate);
  var totalOwed = principal + interest;

  // ── Frequency-aware slot configuration ─────────────────────────────────────
  // Each repayment type divides the 30-day window into equal installments.
  // Daily  → 30 slots, 1-day apart
  // Weekly → 4 slots, 7 days apart
  // Biweekly → 2 slots, 14 days apart
  // Monthly / Lump Sum → 1 slot on day 30
  var intervalDays, numSlots;
  if (rt === "Daily") {
    intervalDays = 1; numSlots = 30;
  } else if (rt === "Weekly") {
    intervalDays = 7; numSlots = 4;
  } else if (rt === "Biweekly") {
    intervalDays = 14; numSlots = 2;
  } else {
    intervalDays = 30; numSlots = 1;
  }

  var perSlot = Math.round(totalOwed / numSlots);
  if (perSlot === 0 && totalOwed > 0) {
    // If rounding yields 0 (e.g., test loan of 10 KES over 30 days), 
    // force perSlot to a float to prevent "ON TIME" 0 KES bugs.
    perSlot = Number((totalOwed / numSlots).toFixed(2));
  }
  // Last slot absorbs rounding remainder so totals stay exact
  var lastSlot = Number((totalOwed - perSlot * (numSlots - 1)).toFixed(2));

  // ── Build slot schedule ────────────────────────────────────────────────────
  var startDate = new Date(loan.disbursed);
  var slots = [];
  for (var i = 0; i < numSlots; i++) {
    var slotDate = new Date(startDate);
    slotDate.setDate(startDate.getDate() + intervalDays * (i + 1));
    slots.push({
      index: i,
      due: slotDate.toISOString().slice(0, 10),
      perSlot: i === numSlots - 1 ? lastSlot : perSlot,
      status: "upcoming",
      payment: null,
      negBalance: 0,
    });
  }

  // 2. Map global payments safely

  // IMPORTANT: this engine currently uses a single "maturity" slot equal to totalOwed.
  // Allocation must therefore only mark the slot paid when the full total is covered.
  // (Previously, the allocator used repayment-type instalment perSlot, which could
  // incorrectly "clear" the single slot on partial payments.)
  var allocPerSlot = Number(slots[0] && slots[0].perSlot) || 0;

  // 2. Map global payments safely
  var loanPays = (allPayments || [])
    .filter(function (p) {
      return (
        (p.loanId === loan.id || p.loan_id === loan.id) &&
        (p.status === "Allocated" || p.status === "allocated")
      );
    })
    .slice()
    .sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });

  // 3. Compute explicit Total Paid correctly
  var totalPaid = loanPays.reduce(function (acc, p) {
    return acc + Number(p.amount || 0);
  }, 0);

  // 4. Calculate strict Progress Percentage
  var calcPct = 0;
  if (totalOwed > 0) {
    calcPct = (totalPaid / totalOwed) * 100;
  }
  if (calcPct > 100 || Number(loan.balance) <= 0) calcPct = 100;
  else if (calcPct < 1 && totalPaid > 0) calcPct = 1; // Never show 0% if money paid
  var pctPaid = Math.round(calcPct);

  // 5. Fill Slots Chronologically via Ledger (Issue 2 specific states)
  // 5. Fill Slots Chronologically with Fractional Support
  var ledger = [];
  slots.forEach(function (s) {
    s.paidAmount = 0;
    s.payments = [];
    s.completionDate = null;
  });

  var remainingAmount = 0;
  var isLoanSettled = loan.status === "Settled" || loan.status === "Written off" || Number(loan.balance) <= 0 || pctPaid >= 100;

  loanPays.forEach(function (pay) {
    var amt = Number(pay.amount || 0);
    remainingAmount += amt;
    var paidSlots = [];

    slots.forEach(function (s, idx) {
      if (remainingAmount <= 0) return;
      var shortfall = s.perSlot - s.paidAmount;
      if (shortfall <= 0) return;

      var apply = Math.min(remainingAmount, shortfall);
      s.paidAmount += apply;
      remainingAmount -= apply;
      s.payments.push(pay);
      if (!s.payment) s.payment = pay; // primary payment reference
      
      if (s.paidAmount >= s.perSlot) {
         paidSlots.push(idx);
         if (!s.completionDate) s.completionDate = pay.date;
      }
    });

    ledger.push({
      payId: pay.id,
      date: pay.date,
      amount: amt,
      paidSlots: paidSlots,
      surplusSlots: 0,
      negativeBalance: remainingAmount, // surplus amount
      mpesa: pay.mpesa || pay.mpesa_code || null,
      allocatedBy: pay.allocatedBy || null,
    });
  });

  // 6. Resolve Statuses and Due Amounts
  slots.forEach(function (s, idx) {
    s.negBalance = 0; // Clear the old semantic
    s.carriedForward = 0;
    s.isCombined = false;
    // Calculate what is ACTUALLY remaining to pay for this specific slot
    s.totalDue = Math.max(0, s.perSlot - s.paidAmount);

    if (isLoanSettled || s.paidAmount >= s.perSlot) {
      // Slot is fully paid
      var cDate = (s.completionDate || "").slice(0, 10).trim();
      var sDue = (s.due || "").trim();
      if (sDue < todayStr && cDate && cDate > sDue) {
        s.status = "paid_late";
      } else {
        s.status = "paid";
      }
    } else {
      // Slot is NOT fully paid
      if (s.due < todayStr) {
        s.status = "overdue";
      } else if (s.due === todayStr) {
        s.status = "due_today";
      } else {
        s.status = "upcoming";
      }
    }
  });

  // 7. Summaries
  var paidCt = slots.filter(function (s) {
    return s.status === "paid";
  }).length;
  var lateCt = slots.filter(function (s) {
    return s.status === "paid_late";
  }).length;
  var missedCt = slots.filter(function (s) {
    return s.status === "missed";
  }).length;
  var overdueCt = slots.filter(function (s) {
    return s.status === "overdue";
  }).length;
  var upcomingCt = slots.filter(function (s) {
    return s.status === "upcoming" || s.status === "due_today";
  }).length;

  return {
    slots: slots,
    ledger: ledger,
    runningBalance: 0, // Obsoleted: fractional accounting natively handles part-payments now
    perSlot: perSlot,
    total: totalOwed,
    totalPaid: totalPaid,
    pctPaid: pctPaid,
    summary: {
      paid: paidCt,
      late: lateCt,
      missed: missedCt,
      overdue: overdueCt,
      upcoming: upcomingCt,
    },
  };
};

const REPAY_STATUS = {
  paid: {
    col: "#10B981",
    bg: "#10B98114",
    border: "#10B981",
    icon: "✓",
    label: "ON TIME",
  },
  paid_late: {
    col: "#F59E0B",
    bg: "#F59E0B14",
    border: "#F59E0B",
    icon: "✓",
    label: "LATE PAID",
  },
  missed: {
    col: "#EF4444",
    bg: "#EF444414",
    border: "#EF4444",
    icon: "✕",
    label: "MISSED (SKIPPED)",
  },
  overdue: {
    col: "#EF4444",
    bg: "#EF444414",
    border: "#EF4444",
    icon: "!",
    label: "OVERDUE",
  },
  due_today: {
    col: "#F59E0B",
    bg: "#F59E0B18",
    border: "#F59E0B",
    icon: "!",
    label: "DUE TODAY",
  },
  upcoming: {
    col: "var(--dim)",
    bg: "transparent",
    border: "var(--border)",
    icon: "",
    label: "UPCOMING",
  },
};

const LoanDetail = ({
  loan,
  payments,
  customers,
  selSlot,
  setSelSlot,
  setSelLoan,
  renderSlotPopup,
}) => {
  useModalLock();
  const sched = computeLoanSchedule(loan, payments);
  const {
    slots,
    ledger,
    runningBalance,
    perSlot,
    total,
    totalPaid,
    pctPaid,
    summary,
  } = sched;
  const [slotFilter, setSlotFilter] = useState(null);
  const scrollRef = useRef(null);

  // Reset scroll to top whenever a new loan is selected
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [loan.id]);

  const filteredSlots = slotFilter
    ? slots.filter((s) => s.status === slotFilter)
    : slots;

  const customerObj = customers?.find((c) => 
    (loan.customerId && c.id === loan.customerId) || 
    (loan.customer_id && c.id === loan.customer_id) || 
    (c.name === loan.customer && c.phone === loan.phone)
  ) || customers?.find((c) => c.name === loan.customer);
  const accNo = customerObj?.accountNumber || customerObj?.idNo || customerObj?.idNumber || loan.id;

  const phone = (loan.phone || "").replace(/\s/g, "");
  const waPhone = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
  const smsBody = encodeURIComponent(
    "Dear " +
      loan.customer.split(" ")[0] +
      ", your loan " +
      loan.id +
      " has a balance of KES " +
      loan.balance.toLocaleString("en-KE") +
      ". Please make your next installment payment via Paybill 4166191, Account: " +
      accNo +
      ". Thank you.",
  );
  const { open: openSMS, Dialog: SMSDialog } = useSMS();
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "rgba(4,8,16,0.92)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "max(56px, calc(12px + env(safe-area-inset-top, 0px)))",
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: "max(40px, calc(16px + env(safe-area-inset-bottom, 0px)))",
        backdropFilter: "var(--glass-blur)",
        overflow: "hidden",
      }}
    >
      {selSlot &&
        renderSlotPopup({
          slot: selSlot,
          loan,
          totalSlots: slots.length,
          ledgerEntry:
            ledger.find((e) => e.paidSlots.includes(selSlot.index)) || null,
        })}
      <div
        style={{
          background: T.card,
          border: "1px solid " + T.border,
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          height: "100%",
          maxHeight: "calc(100vh - max(96px, calc(52px + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px))))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 0 0 1px " + T.accent + "10,0 40px 80px rgba(0,0,0,.15)",
        }}
      >
        <div
          style={{
            padding: "14px 18px 12px",
            borderBottom: "1px solid " + T.border,
            flexShrink: 0,
            background: T.card,
            borderRadius: "16px 16px 0 0",
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "monospace",
                  color: T.accent,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 2.5,
                  marginBottom: 3,
                }}
              >
                {loan.id}
              </div>
              <div style={{ color: T.txt, fontWeight: 700, fontSize: 15 }}>
                {loan.customer}
              </div>
              <div style={{ color: T.dim, fontSize: 11, marginTop: 2 }}>
                {loan.repaymentType} · KES {perSlot.toLocaleString("en-KE")}
                /instalment · {loan.officer}
              </div>
              <div style={{ color: T.muted, fontSize: 10, marginTop: 1 }}>
                Disbursed {loan.disbursed}
              </div>
            </div>
            <button
              onClick={() => {
                setSelLoan(null);
                setSelSlot(null);
              }}
              style={{
                background: T.bg,
                border: "1px solid " + T.border,
                color: T.dim,
                borderRadius: 99,
                width: 28,
                height: 28,
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginLeft: 12,
              }}
            >
              ✕
            </button>
          </div>
          {phone && (
            <div style={{ display: "flex", gap: 7 }}>
              <a
                href={`tel:${phone}`}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  background: T.accent + "14",
                  border: "1px solid " + T.accent + "30",
                  color: T.accent,
                  borderRadius: 8,
                  padding: "7px 10px",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                📞 Call
              </a>
              <button
                onClick={() => openSMS(phone, smsBody, loan.customerId)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  background: T.blue + "14",
                  border: "1px solid " + T.blue + "30",
                  color: T.blue,
                  borderRadius: 8,
                  padding: "7px 10px",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                💬 SMS
              </button>
              <a
                href={`https://wa.me/${waPhone}?text=${smsBody}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  background: "#25D36614",
                  border: "1px solid #25D36630",
                  color: "#25D366",
                  borderRadius: 8,
                  padding: "7px 10px",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                WhatsApp
              </a>
            </div>
          )}
        </div>
        <div
          ref={scrollRef}
          style={{
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            flex: 1,
          }}
        >
          <div style={{ padding: "14px 18px 48px" }}>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 5,
                }}
              >
                <span
                  style={{
                    color: T.dim,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Repayment Progress
                </span>
                <span
                  style={{
                    color: T.accent,
                    fontFamily: "monospace",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {pctPaid}%
                </span>
              </div>
              <div
                style={{
                  height: 5,
                  background: T.border,
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: pctPaid + "%",
                    background: "linear-gradient(90deg," + T.accent + "," + T.accent + "dd)",
                    borderRadius: 99,
                    transition: "width .5s",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 4,
                }}
              >
                <span style={{ color: T.muted, fontSize: 10 }}>
                  Paid: KES {totalPaid.toLocaleString("en-KE")}
                </span>
                <span style={{ color: T.muted, fontSize: 10 }}>
                  Total: KES {total.toLocaleString("en-KE")}
                </span>
              </div>
              {runningBalance < 0 && (
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#F59E0B10",
                    border: "1px solid #F59E0B30",
                    borderRadius: 7,
                    padding: "5px 10px",
                  }}
                >
                  <span style={{ fontSize: 11 }}>⚠</span>
                  <span
                    style={{ color: "#F59E0B", fontSize: 11, fontWeight: 600 }}
                  >
                    Partial balance on file: KES{" "}
                    {runningBalance.toLocaleString("en-KE")}
                  </span>
                </div>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 5,
                marginBottom: 12,
              }}
            >
              {[
                [
                  "Principal",
                  "KES " + loan.amount.toLocaleString("en-KE"),
                  "#64748B",
                  null,
                ],
                [
                  "Interest",
                  "KES " +
                    Math.round(loan.amount * (0.3 * (1 - Number(loan.interestDiscount || 0) / 100))).toLocaleString("en-KE"),
                  "#64748B",
                  null,
                ],
                ["On Time", summary.paid, "#10B981", "paid"],
                [
                  "Late",
                  summary.late,
                  summary.late > 0 ? "#F59E0B" : "#475569",
                  "paid_late",
                ],
                [
                  "Missed/Overdue",
                  summary.missed + summary.overdue,
                  summary.missed + summary.overdue > 0 ? "#EF4444" : "#475569",
                  "missed",
                ],
                ["Upcoming", summary.upcoming, "#475569", "upcoming"],
              ].map((item) => {
                const isActive = slotFilter === item[3] && item[3] !== null;
                return (
                  <div
                    key={item[0]}
                    onClick={() => {
                      if (item[3])
                        setSlotFilter((f) => (f === item[3] ? null : item[3]));
                    }}
                    style={{
                      background: isActive ? item[2] + "22" : T.bg,
                      border: "1px solid " + (isActive ? item[2] : T.border),
                      borderRadius: 8,
                      padding: "8px 5px",
                      textAlign: "center",
                      cursor: item[3] ? "pointer" : "default",
                      transition: "all .15s",
                    }}
                  >
                    <div
                      style={{
                        color: "#475569",
                        fontSize: 8,
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        marginBottom: 3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      {item[0]}
                    </div>
                    <div
                      style={{
                        color: item[2],
                        fontWeight: 800,
                        fontSize: 11,
                        fontFamily: "monospace",
                      }}
                    >
                      {item[1]}
                    </div>
                    {isActive && (
                      <div
                        style={{
                          color: item[2],
                          fontSize: 7,
                          marginTop: 1,
                          fontWeight: 700,
                        }}
                      >
                        ▼ filtered
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              {[
                ["#10B981", "✅ On time"],
                ["#F59E0B", "⚠ Late"],
                ["#EF4444", "❌ Missed/Overdue"],
                ["#475569", "· Upcoming"],
              ].map((item) => (
                <div
                  key={item[1]}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: item[0],
                    }}
                  />
                  <span style={{ color: "#475569", fontSize: 9 }}>
                    {item[1]}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                color: T.dim,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                Schedule — click any instalment
                {slots.length > 0 && (
                  <span style={{ color: T.muted, marginLeft: 6 }}>
                    ({slots.length} total)
                  </span>
                )}
              </span>
              {slotFilter && (
                <button
                  onClick={() => setSlotFilter(null)}
                  style={{
                    background: T.bg,
                    border: "1px solid " + T.border,
                    color: T.muted,
                    borderRadius: 6,
                    padding: "2px 8px",
                    cursor: "pointer",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  ✕ Clear filter ({filteredSlots.length} shown)
                </button>
              )}
            </div>
            <div
              style={{
                marginBottom: 16,
                paddingRight: 2,
                borderRadius: 8,
                border: "1px solid " + T.border,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {filteredSlots.length === 0 ? (
                  <div
                    style={{
                      color: "#475569",
                      textAlign: "center",
                      padding: 16,
                      fontSize: 12,
                    }}
                  >
                    No installments match this filter
                  </div>
                ) : (
                  filteredSlots.map((slot) => {
                    const sty =
                      REPAY_STATUS[slot.status] || REPAY_STATUS.upcoming;
                    const filled = ["paid", "paid_late"].includes(slot.status);
                    return (
                      <div
                        key={slot.index}
                        onClick={() => setSelSlot(slot)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: sty.bg,
                          border: "1px solid " + sty.border + "40",
                          borderRadius: 9,
                          padding: "9px 13px",
                          cursor: "pointer",
                          transition: "all .1s",
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            border: "1px solid " + sty.border,
                            background: filled ? sty.border : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              color: filled ? "#060A10" : sty.col,
                              fontSize: 11,
                              fontWeight: 900,
                            }}
                          >
                            {sty.icon || slot.index + 1}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                color: T.txt,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {slot.synthetic
                                ? "Next Payment Due"
                                : "Instalment " + (slot.index + 1)}
                            </span>
                            {slot.synthetic && (
                              <span
                                style={{
                                  background: "#10B98118",
                                  color: "#10B981",
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: "1px 6px",
                                  borderRadius: 3,
                                  letterSpacing: 0.5,
                                }}
                              >
                                UPCOMING
                              </span>
                            )}
                            {slot.status === "due_today" && (
                              <span
                                style={{
                                  background: "#F59E0B18",
                                  color: "#F59E0B",
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: "1px 6px",
                                  borderRadius: 3,
                                }}
                              >
                                TODAY
                              </span>
                            )}
                            {slot.payment && (
                              <span
                                style={{
                                  color: T.dim,
                                  fontSize: 9,
                                  fontFamily: "monospace",
                                }}
                              >
                                {slot.payment.mpesa || slot.payment.id}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              color: T.dim,
                              fontSize: 10,
                              marginTop: 1,
                            }}
                          >
                            Due {slot.due}
                          </div>
                          {slot.negBalance < 0 && (
                            <div
                              style={{
                                color: "#F59E0B",
                                fontSize: 10,
                                marginTop: 1,
                              }}
                            >
                              ⚠ Partial: KES{" "}
                              {slot.negBalance.toLocaleString("en-KE")}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div
                            style={{
                              color: sty.col,
                              fontFamily: "monospace",
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            KES {(["paid", "paid_late"].includes(slot.status) ? slot.perSlot : (slot.totalDue !== undefined ? slot.totalDue : slot.perSlot)).toLocaleString("en-KE")}
                          </div>
                          {sty.label && (
                            <div
                              style={{
                                color: sty.col,
                                fontSize: 9,
                                fontWeight: 800,
                                marginTop: 1,
                                letterSpacing: 0.6,
                              }}
                            >
                              {sty.label}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {ledger.length > 0 && (
              <div>
                <div
                  style={{
                    color: "#475569",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 8,
                  }}
                >
                  Payment ledger
                </div>
                <div>
                  {ledger.map((entry) => (
                    <div
                      key={entry.payId}
                      style={{
                        background: T.bg,
                        border: "1px solid " + T.border,
                        borderRadius: 8,
                        padding: "10px 12px",
                        marginBottom: 5,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: 5,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color: T.accent,
                              fontFamily: "monospace",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {entry.payId}
                          </div>
                          <div
                            style={{
                              color: T.dim,
                              fontSize: 10,
                              marginTop: 1,
                            }}
                          >
                            {entry.mpesa || "Manual"} · {entry.date}
                          </div>
                        </div>
                        <div
                          style={{
                            color: T.accent,
                            fontFamily: "monospace",
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          KES {entry.amount.toLocaleString("en-KE")}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          borderTop: "1px solid " + T.border,
                          paddingTop: 6,
                        }}
                      >
                        <span style={{ color: "#475569", fontSize: 9 }}>
                          Covered:{" "}
                          {entry.paidSlots
                            .map((i) => "I" + (i + 1))
                            .join(", ") || "none"}
                        </span>
                        {entry.surplusSlots > 0 && (
                          <span style={{ color: "#F59E0B", fontSize: 9 }}>
                            {entry.surplusSlots} surplus slots
                          </span>
                        )}
                        {entry.negativeBalance < 0 && (
                          <span style={{ color: "#F59E0B", fontSize: 9 }}>
                            Remainder: KES{" "}
                            {entry.negativeBalance.toLocaleString("en-KE")}
                          </span>
                        )}
                        {entry.allocatedBy && (
                          <span style={{ color: "#374151", fontSize: 9 }}>
                            by {entry.allocatedBy}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {SMSDialog}
      </div>
    </div>
  );
};

export const RepayTracker = ({ loans, payments, customers, onSelectLoan, onSelectCustomer }) => {
  const [activeType, setActiveType] = useState("Daily");
  const [selLoan, setSelLoan] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Save scroll position before showing detail; restore when closing.
  const savedScrollRef = useRef(0);

  // Lock the page scroll container synchronously before paint so the modal
  // and the lock appear in the same frame — no visible jump on first open.
  useLayoutEffect(() => {
    const el = document.querySelector(".main-scroll");
    if (!el) return;
    if (selLoan) {
      el.style.overflow = "hidden";
    } else {
      el.style.overflow = "";
      // Restore scroll after list fully repaints. Double rAF + setTimeout ensure
      // the layout has settled regardless of how complex the re-render is.
      const pos = savedScrollRef.current;
      if (pos > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: pos, behavior: 'instant' });
          });
        });
        setTimeout(() => {
          window.scrollTo({ top: pos, behavior: 'instant' });
        }, 50);
      }
    }
    return () => {
      el.style.overflow = "";
    };
  }, [selLoan]);

  const TYPES = ["Daily", "Weekly", "Biweekly", "Monthly"];
  const STATUS = REPAY_STATUS;

  // Memoize active loans for the selected type — only recomputes when loans or activeType changes
  const activeLoans = useMemo(
    () =>
      loans.filter(function (l) {
        return (
          l.repaymentType === activeType &&
          l.disbursed &&
          !["Settled", "Rejected", "Written off"].includes(l.status)
        );
      }),
    [loans, activeType],
  );

  // Memoize per-type counts for the filter buttons — prevents 4× loans.filter on every render
  const typeCounts = useMemo(() => {
    const eligible = loans.filter(
      (l) =>
        l.disbursed &&
        !["Settled", "Rejected", "Written off"].includes(l.status),
    );
    return Object.fromEntries(
      TYPES.map((t) => [
        t,
        eligible.filter((l) => l.repaymentType === t).length,
      ]),
    );
  }, [loans]);

  // Memoize total active count shown in the subtitle — was an inline loans.filter in JSX
  const totalActive = useMemo(
    () =>
      loans.filter(
        (l) =>
          l.disbursed &&
          !["Settled", "Rejected", "Written off"].includes(l.status),
      ).length,
    [loans],
  );

  // KEY FIX — computeLoanSchedule runs the full payment allocation engine.
  // Memoize the full schedules array so it only recomputes when loans or payments change.
  const schedules = useMemo(() => {
    const result = {};
    activeLoans.forEach((loan) => {
      result[loan.id] = computeLoanSchedule(loan, payments);
    });
    return result;
  }, [activeLoans, payments]);

  // Search filter — matches customer name or loan ID (case-insensitive)
  const filteredLoans = useMemo(() => {
    if (!searchQuery.trim()) return activeLoans;
    const q = searchQuery.trim().toLowerCase();
    return activeLoans.filter(
      (l) =>
        (l.customer || "").toLowerCase().includes(q) ||
        (l.id || "").toLowerCase().includes(q),
    );
  }, [activeLoans, searchQuery]);

  // ── Slot detail popup ──────────────────────────────────────────────────────
  // FIX — Bug 3: SlotPopup was a component defined inside RepayTracker's render body.
  // Every re-render produced a new function identity → React treated it as a different
  // component type → full unmount+remount of the popup (and any inputs inside it).
  // Converted to a plain render function called as slotPopupContent(...) below so React
  // reconciles the returned JSX in-place without remounting.
  const renderSlotPopup = function (props) {
    const slot = props.slot;
    const loan = props.loan;
    const sty = STATUS[slot.status] || STATUS.upcoming;
    const pay = slot.payment;
    const ledgerEntry = props.ledgerEntry;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10002,
          background: "rgba(15,23,42,0.6)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: MODAL_TOP_OFFSET + 16,
          paddingLeft: 16,
          paddingRight: 16,
          backdropFilter: "var(--glass-blur)",
          overflow: "hidden",
        }}
        onClick={function () {
          setSelSlot(null);
        }}
      >
        <div
          onClick={function (e) {
            e.stopPropagation();
          }}
          style={{
            background: T.card,
            border: "1px solid " + sty.border + "50",
            borderRadius: 14,
            padding: 20,
            width: "100%",
            maxWidth: 380,
            boxShadow:
              "0 0 0 1px " + sty.border + "15,0 32px 64px rgba(0,0,0,.15)",
          }}
        >
          {/* Slot header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 16,
            }}
          >
            <div>
              <div
                style={{
                  color: "#475569",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginBottom: 3,
                }}
              >
                {loan.repaymentType} · Instalment {slot.index + 1} of{" "}
                {props.totalSlots}
              </div>
              <div
                style={{
                  color: sty.col,
                  fontFamily: "monospace",
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                KES {(slot.totalDue || slot.perSlot).toLocaleString("en-KE")}
              </div>
              {slot.isCombined && (
                <div style={{ color: "#EF4444", fontSize: 10, fontWeight: 700, marginTop: 2, background: "#EF444415", padding: "2px 6px", borderRadius: 4, display: "inline-block" }}>
                  Incl. KES {slot.carriedForward.toLocaleString("en-KE")} missed
                </div>
              )}
              <div style={{ color: "#475569", fontSize: 11, marginTop: 3 }}>
                Due {slot.due}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <span
                style={{
                  background: sty.bg,
                  border: "1px solid " + sty.border + "50",
                  color: sty.col,
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: 6,
                  letterSpacing: 0.8,
                }}
              >
                {sty.label || "UPCOMING"}
              </span>
              <button
                onClick={function () {
                  setSelSlot(null);
                }}
                style={{
                  background: T.bg,
                  border: "1px solid " + T.border,
                  color: T.dim,
                  borderRadius: 99,
                  width: 24,
                  height: 24,
                  cursor: "pointer",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Allocation detail */}
          <div
            style={{
              background: T.bg,
              border: "1px solid " + T.border,
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: slot.negBalance < 0 ? 10 : 0,
              }}
            >
              <div>
                <div
                  style={{
                    color: T.dim,
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginBottom: 3,
                  }}
                >
                  Required this slot
                </div>
                <div
                  style={{
                    color: T.txt,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  KES {slot.perSlot.toLocaleString("en-KE")}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: T.dim,
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginBottom: 3,
                  }}
                >
                  {pay ? "Payment received" : "Amount received"}
                </div>
                <div
                  style={{
                    color: pay ? T.accent : "#EF4444",
                    fontFamily: "monospace",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {pay ? "KES " + pay.amount.toLocaleString("en-KE") : "KES 0"}
                </div>
              </div>
            </div>
            {slot.negBalance < 0 && (
              <div
                style={{
                  borderTop: "1px solid " + T.border,
                  paddingTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{ color: "#F59E0B", fontSize: 10, fontWeight: 700 }}
                  >
                    ⚠ Partial remainder
                  </div>
                  <div style={{ color: T.dim, fontSize: 10, marginTop: 1 }}>
                    Not applied — less than 1 instalment
                  </div>
                </div>
                <div
                  style={{
                    color: "#F59E0B",
                    fontFamily: "monospace",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {slot.negBalance.toLocaleString("en-KE")}
                </div>
              </div>
            )}
          </div>

          {/* Linked payment */}
          {!pay ? (
            <div
              style={{
                background: T.bg,
                border: "1px dashed " + T.border,
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
                color: T.dim,
                fontSize: 11,
              }}
            >
              {slot.status === "missed"
                ? "No payment received by " + slot.due
                : slot.status === "duetoday"
                  ? "Payment due today — not yet received"
                  : "Instalment not yet due"}
            </div>
          ) : (
            <div>
              <div
                style={{
                  color: T.dim,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 7,
                }}
              >
                Payment record
              </div>
              <div
                style={{
                  background: T.bg,
                  border: "1px solid " + T.border,
                  borderRadius: 9,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: T.accent,
                        fontFamily: "monospace",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {pay.id}
                    </div>
                    <div
                      style={{ color: T.dim, fontSize: 10, marginTop: 2 }}
                    >
                      {pay.mpesa || "Manual entry"}
                    </div>
                  </div>
                  <div
                    style={{
                      color: T.accent,
                      fontFamily: "monospace",
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                  >
                    KES {pay.amount.toLocaleString("en-KE")}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 8,
                    borderTop: "1px solid " + T.border,
                  }}
                >
                  <span style={{ color: T.dim, fontSize: 10 }}>
                    Received: {pay.date}
                  </span>
                  <span
                    style={{
                      background:
                        pay.date <= slot.due ? T.oLo : T.wLo,
                      color: pay.date <= slot.due ? T.ok : T.warn,
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 7px",
                      borderRadius: 4,
                      letterSpacing: 0.5,
                    }}
                  >
                    {pay.date <= slot.due ? "ON TIME" : "LATE"}
                  </span>
                </div>
                {ledgerEntry && ledgerEntry.paidSlots.length > 1 && (
                  <div
                    style={{
                      marginTop: 8,
                      color: T.dim,
                      fontSize: 10,
                      borderTop: "1px solid " + T.border,
                      paddingTop: 8,
                    }}
                  >
                    This payment also covers {ledgerEntry.paidSlots.length - 1}{" "}
                    other instalment
                    {ledgerEntry.paidSlots.length > 2 ? "s" : ""}
                  </div>
                )}
                {pay.allocatedBy && (
                  <div style={{ marginTop: 4, color: T.muted, fontSize: 9 }}>
                    Allocated by: {pay.allocatedBy}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Loan detail modal ──────────────────────────────────────────────────────
  // FIX: LoanDetail was originally defined inside RepayTracker's render body,
  // making it a new component type on every render → full remount on every state
  // change. It cannot be a plain render function because it owns useState.
  // Correctly hoisted to module scope above RepayTracker; all previously
  // closed-over values are passed as explicit props.

  // ── Main tracker UI ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: T.card,
        border: "1px solid " + T.border,
        borderRadius: 16,
        padding: "18px 20px",
        marginBottom: 20,
        boxShadow: "inset 0 1px 0 " + T.border,
      }}
    >
      {selLoan && (
        <LoanDetail
          loan={selLoan}
          payments={payments}
          customers={customers}
          selSlot={selSlot}
          setSelSlot={setSelSlot}
          setSelLoan={setSelLoan}
          renderSlotPopup={renderSlotPopup}
        />
      )}

      {/* Title row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              color: T.accent,
              fontFamily: "monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 3,
              marginBottom: 3,
            }}
          >
            LOAN MONITOR ENGINE
          </div>
          <div style={{ color: T.txt, fontWeight: 800, fontSize: 15 }}>
            Schedule Monitor
          </div>
          <div style={{ color: T.dim, fontSize: 11, marginTop: 2 }}>
            Central allocation engine · {totalActive} active loans
          </div>
        </div>
        {/* Type filter */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TYPES.map(function (t) {
            var ct = typeCounts[t] || 0;
            return (
              <button
                key={t}
                onClick={function () {
                  setActiveType(t);
                  setSearchQuery("");
                }}
                style={{
                  background: activeType === t ? T.accent : "transparent",
                  color: activeType === t ? "#060A10" : T.dim,
                  border:
                    "1px solid " + (activeType === t ? T.accent : T.border),
                  borderRadius: 8,
                  padding: "5px 11px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all .15s",
                }}
              >
                {t}
                {ct > 0 && (
                  <span
                    style={{
                      background:
                        activeType === t ? "rgba(6,10,16,.25)" : T.bg,
                      color: activeType === t ? "#060A10" : T.muted,
                      borderRadius: 99,
                      padding: "0 5px",
                      fontSize: 9,
                      fontWeight: 900,
                      minWidth: 14,
                      textAlign: "center",
                    }}
                  >
                    {ct}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 10, position: "relative" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={function (e) { setSearchQuery(e.target.value); }}
          placeholder="Search by customer name or loan ID…"
          style={{
            width: "100%",
            background: T.bg,
            border: "1px solid " + (searchQuery ? T.accent + "60" : T.border),
            borderRadius: 8,
            padding: "7px 12px 7px 32px",
            color: T.txt,
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color .15s",
          }}
        />
        <span style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: searchQuery ? T.accent : T.dim,
          fontSize: 12,
          pointerEvents: "none",
        }}>🔍</span>
        {searchQuery && (
          <button
            onClick={function () { setSearchQuery(""); }}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
              lineHeight: 1,
            }}
          >✕</button>
        )}
      </div>

      {/* Loan cards — scrollable container, max 3 cards visible */}
      {activeLoans.length === 0 ? (
        <div
          style={{
            color: "#475569",
            textAlign: "center",
            padding: "24px",
            fontSize: 12,
            border: "1px dashed " + T.border,
            borderRadius: 10,
          }}
        >
          No active {activeType.toLowerCase()} repayment loans
        </div>
      ) : (
        <div
          style={{
            maxHeight: "40vh",
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: 2,
          }}
        >
          {filteredLoans.length === 0 && (
            <div style={{
              color: T.dim,
              textAlign: "center",
              padding: "20px",
              fontSize: 12,
              border: "1px dashed " + T.border,
              borderRadius: 10,
            }}>
              No loans match &ldquo;{searchQuery}&rdquo;
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {filteredLoans.map(function (loan) {
              const sched =
                schedules[loan.id] || computeLoanSchedule(loan, payments);
              const {
                slots,
                runningBalance,
                pctPaid,
                summary,
                perSlot,
                total,
                totalPaid,
              } = sched;
              return (
                <div
                  key={loan.id}
                  style={{
                    background: T.bg,
                    border:
                      "1px solid " +
                      (summary.missed > 0
                        ? "#EF444428"
                        : loan.status === "Overdue"
                          ? "#EF444418"
                          : loan.status === "Frozen"
                            ? "#3B82F618"
                            : T.border),
                    borderRadius: 12,
                    padding: "13px 15px",
                    cursor: "pointer",
                    transition: "border-color .15s",
                  }}
                  onClick={function () {
                    // Save scroll position BEFORE jumping to top to show the detail view
                    savedScrollRef.current = window.scrollY;
                    setSelLoan(loan);
                    setSelSlot(null);
                    if (onSelectLoan) onSelectLoan(loan);
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                >
                  {/* Top row */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <span
                        onClick={function(e) {
                          e.stopPropagation();
                          if (onSelectLoan) onSelectLoan(loan);
                        }}
                        style={{
                          fontFamily: "monospace",
                          color: T.accent,
                          fontWeight: 800,
                          fontSize: 12,
                          letterSpacing: 0.5,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textDecorationStyle: 'dotted'
                        }}
                      >
                        {loan.id}
                      </span>
                      {loan.status === "Overdue" && (
                        <span
                          style={{
                            background: "#EF444412",
                            color: "#EF4444",
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: "1px solid #EF444428",
                          }}
                        >
                          OVERDUE
                        </span>
                      )}
                      {loan.status === "Frozen" && (
                        <span
                          style={{
                            background: "#3B82F612",
                            color: "#3B82F6",
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: "1px solid #3B82F628",
                          }}
                        >
                          FROZEN
                        </span>
                      )}
                      {summary.missed > 0 && (
                        <span
                          style={{
                            background: "#EF444412",
                            color: "#EF4444",
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 5px",
                            borderRadius: 4,
                          }}
                        >
                          {summary.missed} missed
                        </span>
                      )}
                      {runningBalance < 0 && (
                        <span
                          style={{
                            background: "#F59E0B12",
                            color: "#F59E0B",
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 5px",
                            borderRadius: 4,
                          }}
                        >
                          ⚠ partial
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          color: T.txt,
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        KES {loan.balance.toLocaleString("en-KE")}
                      </div>
                      <div style={{ color: T.dim, fontSize: 9 }}>
                        balance
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ color: "#64748B", fontSize: 11, marginBottom: 8 }}
                  >
                    <span 
                      onClick={function(e) {
                        e.stopPropagation();
                        if (onSelectCustomer) onSelectCustomer(loan);
                      }}
                      style={{ 
                        color: T.accent, 
                        fontWeight: 700, 
                        cursor: 'pointer',
                        borderBottom: `1px dashed ${T.accent}40`
                      }}
                    >
                      {loan.customer}
                    </span> ·{" "}
                    <span
                      style={{
                        color: T.dim,
                        fontFamily: "monospace",
                        fontSize: 10,
                      }}
                    >
                      KES {perSlot.toLocaleString("en-KE")}/slot
                    </span>
                  </div>
                  {/* Progress */}
                  <div
                    style={{
                      height: 4,
                      background: T.border,
                      borderRadius: 99,
                      overflow: "hidden",
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: pctPaid + "%",
                        background: "linear-gradient(90deg, #0F172A, #1E40AF, #3B82F6)",
                        borderRadius: 99,
                        boxShadow: pctPaid > 0 ? "0 0 6px #1E40AF60" : "",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 9,
                    }}
                  >
                    <span style={{ color: T.dim, fontSize: 9 }}>
                      {summary.paid + summary.late}/{slots.length} paid ·{" "}
                      {pctPaid}%
                      {runningBalance < 0 && (
                        <span style={{ color: "#F59E0B" }}>
                          {" "}
                          · {runningBalance.toLocaleString("en-KE")} balance
                        </span>
                      )}
                    </span>
                    {loan.daysOverdue > 0 && loan.status !== "Settled" && loan.status !== "Written off" && (
                      <span
                        style={{
                          color: "#EF4444",
                          fontSize: 9,
                          fontWeight: 700,
                        }}
                      >
                        {loan.daysOverdue}d overdue
                      </span>
                    )}
                  </div>
                  {/* Mini dot track — horizontal scroll, no wrap */}
                  <div
                    style={{
                      overflowX: "auto",
                      WebkitOverflowScrolling: "touch",
                      paddingBottom: 2,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 3,
                        flexWrap: "nowrap",
                        minWidth: "min-content",
                      }}
                    >
                      {slots.map(function (slot) {
                        var sty = STATUS[slot.status] || STATUS.upcoming;
                        var filled = ["paid", "paid_late"].includes(
                          slot.status,
                        );
                        var w =
                          activeType === "Daily"
                            ? 10
                            : activeType === "Weekly"
                              ? 24
                              : activeType === "Biweekly"
                                ? 36
                                : 72;
                        return (
                          <div
                            key={slot.index}
                            className={`slot-${slot.status}`}
                            title={
                              "I" +
                              (slot.index + 1) +
                              " · " +
                              slot.due +
                              " · " +
                              (sty.label || "upcoming")
                            }
                            style={{
                              width: w,
                              height: 9,
                              borderRadius: 2,
                              flexShrink: 0,
                              background: filled
                                ? sty.border
                                : slot.status === "missed"
                                  ? sty.border + "25"
                                  : slot.status === "due_today"
                                    ? sty.border + "45"
                                    : T.border,
                              border:
                                "1px solid " +
                                sty.border +
                                (filled ? "" : "50"),
                              boxShadow: filled
                                ? "0 0 4px " + sty.border + "30"
                                : "",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════
//  CUSTOMER EDIT FORM
// ═══════════════════════════════════════════
export const CustomerEditForm = ({ customer, workers, allCustomers = [], onSave, onClose }) => {
  const parseLoc = (loc) => {
    const parts = (loc || "").split(' | ');
    const area = LOCATIONS.includes(parts[0]) ? parts[0] : "";
    const desc = area ? parts.slice(1).join(' | ') : (loc || "");
    return { area, desc };
  };

  const parseResidenceLoc = (loc) => {
    const parts = (loc || "").split(' | ');
    const area = parts[0] || "";
    const desc = parts.slice(1).join(' | ');
    return { area, desc };
  };

  const initBiz = parseLoc(customer.businessLocation || customer.location || customer.businessLoc);
  const initRes = parseResidenceLoc(customer.residence);

  const [f, setF] = useState({
    name: customer.name || "",
    dob: customer.dob || "",
    gender: customer.gender || "Female",
    idNo: customer.idNo || "",
    phone: customer.phone || "",
    altPhone: customer.altPhone || "",
    residenceArea: initRes.area,
    residenceDirections: initRes.desc,
    residenceLandmark: "",
    residenceRoad: "",
    businessName: customer.businessName || customer.business || "",
    businessType: (customer.businessType && !["Butchery", "Carpentry", "Charcoal/firewood seller", "Clothes & Accessories", "Food kiosk", "Fruits & Vegetables", "General shop", "Juakali artisan", "Milk ATM", "Rentals/accommodation", "Agrovet", "Autospares", "Animal feeds", "Bakery", "Boutique", "Salon/Kinyozi", "Poultry", "Second hand items", "Photo studio", "DSTV/Video show", "Health centre", "Electrical shop", "Bags", "Bookshop", "Pharmacy", "Beauty & cosmetics", "Welding", "Wines & spirits", "Money agent", "Fish seller", "Shoeshiner/repair", "Cereals", "Malimali", "Movie shop", "Soaps & detergents", "Cyber cafe", "Events & entertainment", "Gas cylinders", "Poshio mill", "Murtura base", "Pond table", "School", "Baller & sand", "Glass", "Garage", "Computer college", "Dry cleaner", "Carpet seller", "Car wash", "Timberyard", "Sugarcane", "Tailor", "Bar & restaurant", "School uniforms", "Brick seller", "Bakery & weaving", "Egg seller", "Gas shop", "Gym", "Shoe seller", "Day care", "Security firm", "Curtains", "Ice cream", "Maize", "Massage spa", "Chemicals", "Curios", "Detergent supplier", "Electronics", "Loans on item", "Optician", "Packaging material", "Potato seller", "Other", "Add option"].includes(customer.businessType)) ? "Other" : (customer.businessType || "Retail"),
    customBusinessType: (customer.businessType && !["Butchery", "Carpentry", "Charcoal/firewood seller", "Clothes & Accessories", "Food kiosk", "Fruits & Vegetables", "General shop", "Juakali artisan", "Milk ATM", "Rentals/accommodation", "Agrovet", "Autospares", "Animal feeds", "Bakery", "Boutique", "Salon/Kinyozi", "Poultry", "Second hand items", "Photo studio", "DSTV/Video show", "Health centre", "Electrical shop", "Bags", "Bookshop", "Pharmacy", "Beauty & cosmetics", "Welding", "Wines & spirits", "Money agent", "Fish seller", "Shoeshiner/repair", "Cereals", "Malimali", "Movie shop", "Soaps & detergents", "Cyber cafe", "Events & entertainment", "Gas cylinders", "Poshio mill", "Murtura base", "Pond table", "School", "Baller & sand", "Glass", "Garage", "Computer college", "Dry cleaner", "Carpet seller", "Car wash", "Timberyard", "Sugarcane", "Tailor", "Bar & restaurant", "School uniforms", "Brick seller", "Bakery & weaving", "Egg seller", "Gas shop", "Gym", "Shoe seller", "Day care", "Security firm", "Curtains", "Ice cream", "Maize", "Massage spa", "Chemicals", "Curios", "Detergent supplier", "Electronics", "Loans on item", "Optician", "Packaging material", "Potato seller", "Other", "Add option"].includes(customer.businessType)) ? customer.businessType : "",
    businessArea: initBiz.area,
    businessLocation: initBiz.desc,
    businessMapRoad: "",
    businessMapLandmark: "",
    businessMapBuilding: "",
    businessMapFloor: "",
    officer: customer.officer || "",
    risk: customer.risk || "Low",
    n1n: customer.n1n || "",
    n1p: customer.n1p || "",
    n1r: customer.n1r || "",
    n2n: customer.n2n || "",
    n2p: customer.n2p || "",
    n2r: customer.n2r || "",
    n3n: customer.n3n || "",
    n3p: customer.n3p || "",
    n3r: customer.n3r || "",
    // Interest rate discount — optional, admin-only, 0 means standard 30%
    interestDiscount: Number(customer.interestDiscount || 0),
    creditLimit: customer.creditLimit || "",
  });

  const duplicateCheck = useMemo(() => {
    if (!allCustomers?.length) return null;
    const phoneMatch = allCustomers.find(c => c.id !== customer.id && c.phone === f.phone);
    if (phoneMatch) return { type: 'Phone', name: phoneMatch.name };
    const idMatch = allCustomers.find(c => c.id !== customer.id && c.idNo === f.idNo);
    if (idMatch) return { type: 'ID Number', name: idMatch.name };
    return null;
  }, [f.phone, f.idNo, allCustomers, customer.id]);

  const [docs, setDocs] = useState(customer.docs || []);
  const [tab, setTab] = useState("personal");
  const [err, setErr] = useState([]);
  const s = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const validate = () => {
    const m = [];
    if (!f.name) m.push("Full Name");
    if (!f.idNo) m.push("National ID");
    
    if (f.dob) {
        const age = getAge(f.dob);
        if (age < 18) m.push("Customer must be at least 18 years old");
        if (age > 100) m.push("Customer age cannot exceed 100 years");
    }

    if (!f.phone) m.push("Primary Phone");
    else if (!isPhoneValid(f.phone)) m.push("Primary Phone (must be 10 digits starting with 0)");
    
    if (f.altPhone && !isPhoneValid(f.altPhone)) {
      m.push("Alternative Phone (must be 10 digits starting with 0)");
    }
    
    if (!f.residenceArea) m.push("Home Estate/Area");
    if (!f.residenceDirections) m.push("Home Description/Directions");
    if (!f.businessName) m.push("Business Name");
    if (f.businessType === "Other" && !f.customBusinessType) m.push("Please specify the Business Type");
    if (!f.businessArea) m.push("Business Town/Area");
    if (!f.businessLocation) m.push("Business Directions/Description");
    if (!f.officer) m.push("Assigned Officer");
    if (!f.n1n || !f.n1p || !f.n1r)
      m.push("Next of Kin 1 (Name, Phone & Relationship)");
    else if (!isPhoneValid(f.n1p)) m.push("Next of Kin 1 Phone (must be 10 digits)");
    
    if (!f.n2n || !f.n2p || !f.n2r)
      m.push("Next of Kin 2 (Name, Phone & Relationship)");
    else if (!isPhoneValid(f.n2p)) m.push("Next of Kin 2 Phone (must be 10 digits)");
    
    if (!f.n3n || !f.n3p || !f.n3r)
      m.push("Next of Kin 3 (Name, Phone & Relationship)");
    else if (!isPhoneValid(f.n3p)) m.push("Next of Kin 3 Phone (must be 10 digits)");
    
    return m;
  };

  const save = () => {
    const m = validate();
    if (m.length > 0) {
      setErr(m);
      
      // Auto-switch to the tab that has the first error
      if (!f.name || !f.idNo || !f.phone || !f.residenceArea || !f.residenceDirections || (f.dob && (getAge(f.dob) < 18 || getAge(f.dob) > 100)) || (f.altPhone && !isPhoneValid(f.altPhone))) {
        setTab("personal");
      } else if (!f.businessName || !f.businessArea || !f.businessLocation || (f.businessType === "Other" && !f.customBusinessType) || !f.officer) {
        setTab("business");
      } else if (!f.n1n || !f.n1p || !f.n1r || !f.n2n || !f.n2p || !f.n2r || !f.n3n || !f.n3p || !f.n3r || !isPhoneValid(f.n1p) || !isPhoneValid(f.n2p) || !isPhoneValid(f.n3p)) {
        setTab("nok");
      }

      // Scroll to top so user sees the validation errors
      const dialogEl = document.querySelector('.modal-content') || document.querySelector('.dialog-container') || document.querySelector('[role="dialog"]') || document.getElementById('edit-dialog-scroll');
      if (dialogEl) dialogEl.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const finalData = { ...f };
    if (finalData.businessType === "Other" && finalData.customBusinessType) {
      finalData.businessType = finalData.customBusinessType;
    }
    delete finalData.customBusinessType;

    // Build compound location strings
    const bizParts = [];
    if (finalData.businessMapRoad) bizParts.push(`Road: ${finalData.businessMapRoad}`);
    if (finalData.businessMapLandmark) bizParts.push(`Landmark: ${finalData.businessMapLandmark}`);
    if (finalData.businessMapBuilding) bizParts.push(`Bldg: ${finalData.businessMapBuilding}`);
    if (finalData.businessMapFloor) bizParts.push(`Floor: ${finalData.businessMapFloor}`);
    
    // Only append finalData.businessLocation if it's not already in bizParts
    // This handles the case where users just edit the raw description
    if (finalData.businessLocation) {
       bizParts.push(finalData.businessLocation);
    }
    
    finalData.businessLocation = finalData.businessArea 
      ? `${finalData.businessArea} | ${bizParts.join(', ')}`
      : bizParts.join(', ');

    const resParts = [];
    if (finalData.residenceLandmark) resParts.push(`Landmark: ${finalData.residenceLandmark}`);
    if (finalData.residenceRoad) resParts.push(`Road: ${finalData.residenceRoad}`);
    if (finalData.residenceDirections) resParts.push(finalData.residenceDirections);
    
    finalData.residence = finalData.residenceArea
      ? `${finalData.residenceArea} | ${resParts.join(', ')}`
      : resParts.join(', ');
    
    finalData.creditLimit = finalData.creditLimit ? Number(finalData.creditLimit) : null;
    
    onSave({ ...customer, ...finalData, docs });
  };

  const TABS = [
    { k: "personal", l: "Personal" },
    { k: "business", l: "Business" },
    { k: "nok", l: "Next of Kin" },
    { k: "documents", l: "Documents" },
  ];

  return (
    <Dialog title={`Edit — ${customer.name}`} onClose={onClose} width={580} minHeight="80vh">
      <div id="edit-dialog-scroll" style={{ scrollBehavior: 'smooth' }}>
      {err.length > 0 && (
        <div
          style={{
            background: T.dLo,
            border: `1px solid ${T.danger}38`,
            borderRadius: 9,
            padding: "10px 14px",
            marginBottom: 12,
          }}
        >
          {err.map((e) => (
            <div
              key={e}
              style={{ color: T.danger, fontSize: 12, padding: "2px 0" }}
            >
              ★ {e}
            </div>
          ))}
        </div>
      )}
      {duplicateCheck && (
        <div
          style={{
            background: T.wLo,
            border: `1px solid ${T.warn}38`,
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 24 }}>⚠</div>
          <div>
            <div style={{ color: T.warn, fontWeight: 800, fontSize: 13 }}>
              DUPLICATE {duplicateCheck.type.toUpperCase()} DETECTED
            </div>
            <div style={{ color: T.txt, fontSize: 12, marginTop: 2 }}>
              This {duplicateCheck.type} is already registered to <b>{duplicateCheck.name}</b>.
            </div>
          </div>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 5,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              background: tab === t.k ? T.accent : T.surface,
              color: tab === t.k ? "#060A10" : T.muted,
              border: `1px solid ${tab === t.k ? T.accent : T.border}`,
              borderRadius: 99,
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "personal" && (
        <div
          className="mob-grid1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 14px",
          }}
        >
          <FI
            label="Full Name"
            value={f.name}
            onChange={s("name")}
            required
            half
          />
          <FI
            label="Date of Birth"
            value={f.dob}
            onChange={s("dob")}
            type="date"
            max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
            min={new Date(new Date().setFullYear(new Date().getFullYear() - 100)).toISOString().split("T")[0]}
            half
          />
          <FI
            label="Gender"
            value={f.gender}
            onChange={s("gender")}
            type="select"
            options={["Female", "Male", "Other"]}
            half
          />
          <NumericInput
            label="National ID"
            value={f.idNo}
            onChange={s("idNo")}
            required
            half
          />
          <PhoneInput
            label="Primary Phone"
            value={f.phone}
            onChange={s("phone")}
            required
            half
          />
          <PhoneInput
            label="Alt Phone"
            value={f.altPhone}
            onChange={s("altPhone")}
            half
          />
          <div style={{ gridColumn: 'span 2', background: `${T.accent}08`, border: `1px dashed ${T.accent}30`, borderRadius: 16, padding: '16px 20px', marginBottom: 12 }}>
            <div style={{ color: T.accent, fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Home size={16} /> Home Location Mapping Guide
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
              <FI
                label="Estate/Area Name"
                value={f.residenceArea}
                onChange={s("residenceArea")}
                required
                placeholder="e.g. South B"
              />
              <FI
                label="Nearest Landmark"
                value={f.residenceLandmark}
                onChange={s("residenceLandmark")}
                placeholder="e.g. School, Petrol Station"
              />
              <FI
                label="Nearby Road"
                value={f.residenceRoad}
                onChange={s("residenceRoad")}
                placeholder="e.g. Mombasa Road"
              />
              <FI
                label="General Description"
                value={f.residenceDirections}
                onChange={s("residenceDirections")}
                required
                placeholder="Behind landmark, near shop..."
              />
            </div>
          </div>

        </div>
      )}
      {tab === "business" && (
        <div
          className="mob-grid1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 14px",
          }}
        >
          <FI
            label="Business Name"
            value={f.businessName}
            onChange={s("businessName")}
            required
            half
          />
          <FI
            label="Business Type"
            value={f.businessType}
            onChange={s("businessType")}
            type="select"
            options={[
              "Butchery", "Carpentry", "Charcoal/firewood seller", "Clothes & Accessories", 
              "Food kiosk", "Fruits & Vegetables", "General shop", "Juakali artisan", 
              "Milk ATM", "Rentals/accommodation", "Agrovet", "Autospares", 
              "Animal feeds", "Bakery", "Boutique", "Salon/Kinyozi", 
              "Poultry", "Second hand items", "Photo studio", "DSTV/Video show", 
              "Health centre", "Electrical shop", "Bags", "Bookshop", 
              "Pharmacy", "Beauty & cosmetics", "Welding", "Wines & spirits", 
              "Money agent", "Fish seller", "Shoeshiner/repair", "Cereals", 
              "Malimali", "Movie shop", "Soaps & detergents", "Cyber cafe", 
              "Events & entertainment", "Gas cylinders", "Poshio mill", "Murtura base", 
              "Pond table", "School", "Ballar & sand", "Glass", 
              "Garage", "Computer college", "Dry cleaner", "Carpet seller", 
              "Car wash", "Timberyard", "Sugarcane", "Tailor", 
              "Bar & restaurant", "School uniforms", "Brick seller", "Bakery & weaving", 
              "Egg seller", "Gas shop", "Gym", "Shoe seller", 
              "Day care", "Security firm", "Curtains", "Ice cream", 
              "Maize", "Massage spa", "Chemicals", "Curios", 
              "Detergent supplier", "Electronics", "Loans on item", "Optician", 
              "Packaging material", "Potato seller", "Other", "Add option"
            ]}
            half
          />
          {f.businessType === "Other" && (
            <FI
              label="Custom Business Type"
              value={f.customBusinessType}
              onChange={s("customBusinessType")}
              placeholder="Specify your business..."
              required
              half
            />
          )}
          <div style={{ gridColumn: 'span 2', background: `${T.accent}08`, border: `1px dashed ${T.accent}30`, borderRadius: 16, padding: '16px 20px', marginBottom: 12, marginTop: 4 }}>
            <div style={{ color: T.accent, fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={16} /> Business Location Mapping Guide
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
              <FI
                label="Town/Area"
                type="select"
                options={["", ...LOCATIONS]}
                value={f.businessArea}
                onChange={s("businessArea")}
                required
              />
              <FI
                label="Nearest Main Road"
                value={f.businessMapRoad}
                onChange={s("businessMapRoad")}
                placeholder="e.g. Namanga Rd"
              />
              <FI
                label="Landmark"
                value={f.businessMapLandmark}
                onChange={s("businessMapLandmark")}
                placeholder="e.g. School, Petrol station"
              />
              <FI
                label="Building Name/Description"
                value={f.businessMapBuilding}
                onChange={s("businessMapBuilding")}
              />
              <FI
                label="Floor/Room"
                value={f.businessMapFloor}
                onChange={s("businessMapFloor")}
                placeholder="if applicable"
              />
              <FI
                label="Directions / Raw Description"
                value={f.businessLocation}
                onChange={s("businessLocation")}
                required
                placeholder="Opposite landmark, next to..."
              />
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: T.warn, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} /> ⚠️ Ensure directions are simple, clear, and easy to follow.
            </div>
          </div>
          <FI
            label="Assigned Officer"
            value={f.officer}
            onChange={s("officer")}
            type="select"
            options={(workers || [])
              .filter((w) => w.status === "Active")
              .map((w) => w.name)}
            required
            half
          />
          <FI
            label="Credit Limit (KES)"
            type="number"
            value={f.creditLimit}
            onChange={s("creditLimit")}
            placeholder="e.g. 5000"
            half
          />
          {/* ── Interest Rate Discount (Admin-only) ─────────────────── */}
          <div style={{ gridColumn: 'span 2', background: `${T.accent}08`, border: `1px dashed ${T.accent}30`, borderRadius: 16, padding: '16px 20px', marginBottom: 12 }}>
            <div style={{ color: T.accent, fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              🏷️ Interest Rate Override (Admin Only)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', alignItems: 'end' }}>
              <FI
                label="Interest Discount (%)"
                type="number"
                value={f.interestDiscount}
                onChange={(v) => {
                  const n = Math.min(100, Math.max(0, Number(v) || 0));
                  s('interestDiscount')(n);
                }}
                placeholder="0"
              />
              <div style={{ paddingBottom: 14 }}>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>Effective Rate Preview</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>
                  {(30 * (1 - (Number(f.interestDiscount) || 0) / 100)).toFixed(1)}%
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                  {Number(f.interestDiscount) > 0
                    ? `Standard 30% − ${Number(f.interestDiscount)}% discount`
                    : 'Standard rate — no discount applied'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: T.warn, fontStyle: 'italic', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠️ This discount applies only to new loans created after this change is saved. Existing loans are not affected.
            </div>
          </div>
        </div>
      )}
      {tab === "nok" && (
        <div
          className="mob-grid1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 14px",
          }}
        >
          {[
            [1, "n1n", "n1p", "n1r"],
            [2, "n2n", "n2p", "n2r"],
            [3, "n3n", "n3p", "n3r"],
          ].map(([n, nk, pk, rk]) => [
            <FI
              key={nk}
              label={`NOK ${n} Name`}
              value={f[nk]}
              onChange={s(nk)}
              required
              half
            />,
            <PhoneInput
              key={pk}
              label={`NOK ${n} Phone`}
              value={f[pk]}
              onChange={s(pk)}
              required
              half
            />,
            <FI
              key={rk}
              label={`NOK ${n} Relationship`}
              value={f[rk]}
              onChange={s(rk)}
              type="select"
              options={[
                "",
                "Spouse",
                "Parent",
                "Sibling",
                "Child",
                "Friend",
                "Colleague",
              ]}
              required
              half
            />,
            <div
              key={`sep${n}`}
              style={{
                gridColumn: "span 2",
                height: 1,
                background: T.border,
                margin: "4px 0",
              }}
            />,
          ])}
        </div>
      )}
      {tab === "documents" && (
        <div>
          <Alert type="info" style={{ marginBottom: 12 }}>
            Replace or add documents. Existing uploads are preserved unless
            removed.
          </Alert>
          <StructuredDocUpload
            docs={docs}
            onAdd={(d) =>
              setDocs((p) => [...p.filter((x) => x.key !== d.key), d])
            }
            onRemove={(id) => setDocs((p) => p.filter((x) => x.id !== id))}
          />
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 9,
          marginTop: 16,
          paddingTop: 12,
          borderTop: `1px solid ${T.border}`,
        }}
      >
        <Btn onClick={save} full disabled={!!duplicateCheck}>
          {duplicateCheck ? 'Duplicate Detected' : '✓ Save Changes'}
        </Btn>
        <Btn v="secondary" onClick={onClose}>
          Cancel
        </Btn>
      </div>
      </div>
    </Dialog>
  );
};

// ═══════════════════════════════════════════
//  CUSTOMER DETAIL — full profile on click
// ═══════════════════════════════════════════

// ── Docs tab as proper component (no hook-in-render) ──────────
export const CustDocsTab = ({ customer }) => {
  const [viewDoc, setViewDoc] = useState(null);
  const slots = DOC_SLOTS.map((sl) => ({
    ...sl,
    doc: (customer.docs || []).find((d) => d.key === sl.key),
  }));
  const loose = (customer.docs || []).filter(
    (d) => !DOC_SLOTS.some((sl) => sl.key === d.key),
  );
  return (
    <div>
      {viewDoc && <DocViewer doc={viewDoc} onClose={() => setViewDoc(null)} />}
      {(!customer.docs || customer.docs.length === 0) && (
        <div
          style={{
            color: T.muted,
            textAlign: "center",
            padding: 20,
            background: T.surface,
            borderRadius: 10,
          }}
        >
          No documents on file
        </div>
      )}
      {slots.some((s) => s.doc) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {slots
            .filter((s) => s.doc)
            .map((sl) => (
              <div
                key={sl.key}
                style={{
                  background: T.surface,
                  border: `1px solid ${T.ok}38`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 18 }}>{sl.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.txt, fontSize: 13, fontWeight: 700 }}>
                    {sl.label}
                  </div>
                  <div style={{ color: T.ok, fontSize: 11 }}>
                    On file · {sl.doc.uploaded}
                  </div>
                </div>
                {sl.doc.type?.startsWith("image/") ? (
                  <img
                    src={sl.doc.dataUrl}
                    alt={sl.label}
                    onClick={() => setViewDoc(sl.doc)}
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "cover",
                      borderRadius: 6,
                      cursor: "pointer",
                      border: `2px solid ${T.ok}`,
                    }}
                  />
                ) : (
                  <div
                    onClick={() => setViewDoc(sl.doc)}
                    style={{
                      width: 48,
                      height: 48,
                      background: T.card,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      cursor: "pointer",
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    📄
                  </div>
                )}
                <button
                  onClick={() => setViewDoc(sl.doc)}
                  style={{
                    background: T.aLo,
                    border: `1px solid ${T.accent}30`,
                    color: T.accent,
                    borderRadius: 7,
                    padding: "5px 10px",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  View
                </button>
              </div>
            ))}
        </div>
      )}
      {loose.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
            gap: 8,
          }}
        >
          {loose.map((doc) => (
            <div
              key={doc.id}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 9,
                padding: 8,
                textAlign: "center",
                cursor: "pointer",
              }}
              onClick={() => setViewDoc(doc)}
            >
              {doc.type?.startsWith("image/") ? (
                <img
                  src={doc.dataUrl}
                  alt={doc.name}
                  style={{
                    width: "100%",
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                />
              ) : (
                <div
                  style={{
                    height: 80,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    marginBottom: 6,
                  }}
                >
                  📄
                </div>
              )}
              <div style={{ color: T.txt, fontSize: 11, fontWeight: 600 }}>
                {doc.name}
              </div>
              <div style={{ color: T.accent, fontSize: 10, marginTop: 3 }}>
                Tap to view
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Loan Detail Modal ──────────────────────────────────────────

// ═══════════════════════════════════════════════════════════
//  PAYMENT TIMELINE — missed vs paid, unified visual
// ═══════════════════════════════════════════════════════════

// Build a chronological timeline of expected vs actual payments for a loan.
// Late payments are matched back into the earliest unresolved missed slot.
const buildPaymentTimeline = (loan, payments) => {
  if (!loan.disbursed) return { timeline: [], latePayments: [] };

  const disbDate = new Date(loan.disbursed);
  const today = new Date();
  const todayStr = now();
  const rt = loan.repaymentType;
  const principal = loan.amount || 0;
  const discount = Number(loan.interestDiscount || 0);
  const effectiveRate = 0.3 * (1 - discount / 100);
  const total = principal + Math.round(principal * effectiveRate);

  const intervalDays =
    rt === "Daily"
      ? 1
      : rt === "Weekly"
        ? 7
        : rt === "Biweekly"
          ? 14
          : rt === "Monthly"
            ? 30
            : null;
  const installAmt = intervalDays
    ? rt === "Daily"
      ? Math.ceil(total / 30)
      : rt === "Weekly"
        ? Math.ceil(total / 4)
        : rt === "Biweekly"
          ? Math.ceil(total / 2)
          : /* Monthly */ total
    : total;

  // Build ALL expected slots (past + future up to loan end)
  // Business Rule: A loan is strictly DUE only on the 30th day from disbursement.
  // Repayment frequency (Daily, Weekly, etc.) does NOT influence due status.
  const slots = [];
  const dueD = new Date(disbDate);
  dueD.setDate(dueD.getDate() + 30);
  slots.push({
    dueDate: dueD.toISOString().split("T")[0],
    expectedAmt: total,
  });

  // Sort actual payments chronologically
  const sortedPays = [...payments].sort((a, b) => a.date.localeCompare(b.date));

  // PASS 1: match each payment to slots whose window it falls in (on-time)
  const usedPayIds = new Set();
  const timeline = slots.map((slot, slotIdx) => {
    // For the first (and only) slot, use a far-past sentinel so that
    // pre-disbursement payments (advances, demo data, out-of-order entries)
    // are caught here as on-time rather than falling to PASS 2 as "Late".
    const prevDue = slotIdx > 0 ? slots[slotIdx - 1].dueDate : '2000-01-01';
    const onTimePays = sortedPays.filter(
      (p) =>
        p.date >= prevDue && p.date <= slot.dueDate && !usedPayIds.has(p.id),
    );
    const windowAmt = onTimePays.reduce((s, p) => s + p.amount, 0);
    onTimePays.forEach((p) => usedPayIds.add(p.id));

    let status = "missed";
    if (windowAmt > 0) {
      // Only mark as "paid" when the full expected amount is covered
      status = windowAmt >= slot.expectedAmt ? "paid" : "partial";
    } else if (slot.dueDate > todayStr) {
      status = "upcoming";
    }
    return {
      ...slot,
      payments: onTimePays,
      windowAmt,
      status,
      latePayments: [],
    };
  });

  // PASS 2: remaining payments are late — slot them into the earliest still-missed slot
  const remainingPays = sortedPays.filter((p) => !usedPayIds.has(p.id));
  let carryover = 0;
  for (const pay of remainingPays) {
    let remaining = pay.amount;
    // Find missed/partial slots in order and fill them
    for (const slot of timeline) {
      if (remaining <= 0) break;
      if (slot.status === "paid") continue;
      const shortfall = slot.expectedAmt - slot.windowAmt;
      if (shortfall <= 0) continue;
      const applying = Math.min(remaining, shortfall);
      slot.latePayments.push({
        ...pay,
        appliedAmt: applying,
        lateApplied: true,
      });
      slot.windowAmt += applying;
      remaining -= applying;
      // Only promote to paid/paid-late when the FULL amount is covered
      if (slot.windowAmt >= slot.expectedAmt) {
        slot.status = pay.date <= slot.dueDate ? "paid" : "paid-late";
      } else {
        slot.status = "partial";
      }
    }
    // Any residual is surplus (overpayment)
    if (remaining > 0) carryover += remaining;
  }

  return { timeline, latePayments: [] }; // latePayments is now always empty — all matched into slots
};

const PaymentTimeline = ({ loan, payments, compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [drillFilter, setDrillFilter] = useState(null); // 'paid'|'paid-late'|'missed'|'partial'|'upcoming'|null
  const pays = payments.filter((p) => p.loanId === loan.id);
  const result = buildPaymentTimeline(loan, pays);
  if (!result || !result.timeline) return null;
  const { timeline } = result;
  if (!timeline.length)
    return (
      <div
        style={{
          color: T.muted,
          fontSize: 12,
          textAlign: "center",
          padding: 16,
        }}
      >
        No payment schedule available
      </div>
    );

  const totalExpected = timeline.reduce((s, t) => s + t.expectedAmt, 0);
  const totalPaid = timeline.reduce(
    (s, t) =>
      s +
      t.windowAmt +
      t.latePayments.reduce((a, p) => a + (p.appliedAmt || 0), 0),
    0,
  );
  const onTime = timeline.filter((t) => t.status === "paid").length;
  const late = timeline.filter((t) => t.status === "paid-late").length;
  const missed = timeline.filter((t) => t.status === "missed").length;
  const partial = timeline.filter((t) => t.status === "partial").length;
  const upcoming = timeline.filter((t) => t.status === "upcoming").length;
  const pct =
    totalExpected > 0
      ? Math.round((totalPaid / totalExpected) * 100)
      : 0;
  
  // Track surplus/overpayment explicitly for transparency
  const rawTotalPaid = pays.reduce((s, p) => s + p.amount, 0);
  const overpaidAmt = Math.max(0, rawTotalPaid - totalExpected);

  // Count actual payment RECEIPTS (not slots)
  const totalPayCount = pays.length;
  // Count receipts that sit in partial-status slots
  const partialPayCount = timeline
    .filter(t => t.status === 'partial')
    .reduce((s, t) => s + t.payments.length + t.latePayments.length, 0);

  const statusColor = (s) =>
    s === "paid"
      ? T.ok
      : s === "paid-late"
        ? T.gold
        : s === "partial"
          ? T.gold
          : s === "upcoming"
            ? T.muted
            : T.danger;
  const statusIcon = (s) =>
    s === "paid"
      ? "✓"
      : s === "paid-late"
        ? "✓"
        : s === "partial"
          ? "~"
          : s === "upcoming"
            ? "·"
            : "✕";
  const statusLabel = (s) =>
    s === "paid"
      ? "On Time"
      : s === "paid-late"
        ? "Late"
        : s === "partial"
          ? "Partial"
          : s === "upcoming"
            ? "Upcoming"
            : "Missed";

  // Which slots to show based on drill filter + expand
  const PREVIEW = compact ? 4 : 6;
  const filtered = drillFilter
    ? timeline.filter((t) => t.status === drillFilter)
    : timeline;
  const shown = expanded || drillFilter ? filtered : filtered.slice(0, PREVIEW);

  const statBox = (label, value, color, filter) => (
    <div
      key={label}
      onClick={() => {
        setDrillFilter(drillFilter === filter ? null : filter);
        setExpanded(true);
      }}
      style={{
        background: drillFilter === filter ? color + "22" : T.surface,
        border: `1px solid ${drillFilter === filter ? color : T.border}`,
        borderRadius: 9,
        padding: "8px 10px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      <div style={{ color, fontFamily: T.mono, fontWeight: 900, fontSize: 16 }}>
        {value}
      </div>
      <div
        style={{
          color: T.muted,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: T.body }}>
      {/* ── Summary stat boxes — all clickable ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 6,
          marginBottom: 6,
        }}
      >
        {statBox("On Time", onTime, T.ok, "paid")}
        {statBox("Late", late, T.gold, "paid-late")}
        {statBox("Missed", missed, T.danger, "missed")}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 6,
          marginBottom: 12,
        }}
      >
        {statBox("Partial", partial, T.gold, "partial")}
        {statBox("Upcoming", upcoming, T.muted, "upcoming")}
        {statBox("Payments", totalPayCount, T.accent, null)}
      </div>

      {/* ── Active filter banner ── */}
      {drillFilter && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: statusColor(drillFilter) + "18",
            border: `1px solid ${statusColor(drillFilter)}30`,
            borderRadius: 8,
            padding: "6px 12px",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              color: statusColor(drillFilter),
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Showing: {statusLabel(drillFilter)} installments ({filtered.length})
          </span>
          <button
            onClick={() => {
              setDrillFilter(null);
              setExpanded(false);
            }}
            style={{
              background: "none",
              border: "none",
              color: T.muted,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 5,
          }}
        >
          <span style={{ color: T.muted, fontSize: 11 }}>
            Collection progress
          </span>
          <span
            style={{
              color: pct >= 80 ? T.ok : pct >= 50 ? T.gold : T.danger,
              fontFamily: T.mono,
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {pct}%
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: T.border,
            borderRadius: 99,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, pct)}%`,
              background:
                pct >= 80
                  ? `linear-gradient(90deg,${T.ok},#00FF7F)`
                  : pct >= 50
                    ? `linear-gradient(90deg,${T.gold},#FFD700)`
                    : `linear-gradient(90deg,${T.danger},#FF6B6B)`,
              borderRadius: 99,
              transition: "width .5s",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 3,
          }}
        >
          <span style={{ color: T.dim, fontSize: 10 }}>
            Paid: {fmt(totalPaid)}
          </span>
          <span style={{ color: T.dim, fontSize: 10 }}>
            Expected: {fmt(totalExpected)}
          </span>
        </div>
      </div>

      {/* ── Timeline rows ── */}
      <div
        style={{
          maxHeight: "40vh",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {shown.map((slot, idx) => {
          const col = statusColor(slot.status);
          const allPays = [...slot.payments, ...slot.latePayments];
          const hasLate = slot.latePayments.length > 0;
          return (
            <div
              key={idx}
              style={{
                borderRadius: 10,
                overflow: "hidden",
                border: `1px solid ${col}${slot.status === "missed" && !hasLate ? "50" : "30"}`,
                background:
                  slot.status === "paid"
                    ? T.surface
                    : slot.status === "paid-late"
                      ? T.gLo
                      : slot.status === "partial"
                        ? T.gLo
                        : slot.status === "upcoming"
                          ? "transparent"
                          : hasLate
                            ? T.gLo // missed but later paid
                            : T.dLo,
              }}
            >
              <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                {/* Left accent strip */}
                <div style={{ width: 4, background: col, flexShrink: 0 }} />
                {/* Main content */}
                <div style={{ flex: 1, padding: "8px 10px", minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        background: col + "20",
                        color: col,
                        borderRadius: 99,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      {statusIcon(slot.status)} {statusLabel(slot.status)}
                    </span>
                    <span
                      style={{ color: T.muted, fontSize: 11, flexShrink: 0 }}
                    >
                      Due {slot.dueDate}
                    </span>
                    {hasLate && (
                      <span
                        style={{
                          background: T.gold + "20",
                          color: T.gold,
                          borderRadius: 99,
                          padding: "2px 6px",
                          fontSize: 9,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        💡 Recovered
                      </span>
                    )}
                    <span
                      style={{
                        color: T.dim,
                        fontSize: 10,
                        marginLeft: "auto",
                        flexShrink: 0,
                      }}
                    >
                      #{timeline.indexOf(slot) + 1}
                    </span>
                  </div>

                  {/* Amounts row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: T.muted,
                          fontSize: 9,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Expected
                      </div>
                      <div
                        style={{
                          color: T.txt,
                          fontFamily: T.mono,
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        {fmt(slot.expectedAmt)}
                      </div>
                    </div>
                    <div
                      style={{
                        color: T.border,
                        fontSize: 14,
                        alignSelf: "center",
                      }}
                    >
                      →
                    </div>
                    <div>
                      <div
                        style={{
                          color: T.muted,
                          fontSize: 9,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Received
                      </div>
                      <div
                        style={{
                          color: col,
                          fontFamily: T.mono,
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      >
                        {fmt(slot.windowAmt)}
                      </div>
                    </div>
                    {slot.status !== "paid" &&
                      slot.status !== "paid-late" &&
                      slot.expectedAmt > slot.windowAmt && (
                        <>
                          <div
                            style={{
                              color: T.border,
                              fontSize: 14,
                              alignSelf: "center",
                            }}
                          >
                            →
                          </div>
                          <div>
                            <div
                              style={{
                                color: T.muted,
                                fontSize: 9,
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                              }}
                            >
                              Shortfall
                            </div>
                            <div
                              style={{
                                color: T.danger,
                                fontFamily: T.mono,
                                fontWeight: 800,
                                fontSize: 13,
                              }}
                            >
                              {fmt(slot.expectedAmt - slot.windowAmt)}
                            </div>
                          </div>
                        </>
                      )}
                  </div>

                  {/* Payment receipts — on-time + late, all embedded here */}
                  {allPays.length > 0 && (
                    <div
                      style={{
                        marginTop: 7,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      {allPays.map((p, pi) => (
                        <div
                          key={p.id || pi}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: p.lateApplied
                              ? T.gold + "12"
                              : T.ok + "10",
                            border: `1px solid ${p.lateApplied ? T.gold : T.ok}25`,
                            borderRadius: 7,
                            padding: "5px 9px",
                          }}
                        >
                          <div>
                            <span
                              style={{
                                color: p.lateApplied ? T.gold : T.ok,
                                fontFamily: T.mono,
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              {fmt(p.lateApplied ? p.appliedAmt : p.amount)}
                            </span>
                            <span
                              style={{
                                color: T.muted,
                                fontSize: 10,
                                marginLeft: 8,
                              }}
                            >
                              {p.date}
                            </span>
                            {p.mpesa && (
                              <span
                                style={{
                                  color: T.dim,
                                  fontSize: 9,
                                  marginLeft: 6,
                                  fontFamily: T.mono,
                                }}
                              >
                                {p.mpesa}
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              background: p.lateApplied
                                ? T.gold + "20"
                                : T.ok + "15",
                              color: p.lateApplied ? T.gold : T.ok,
                              borderRadius: 5,
                              padding: "2px 6px",
                              fontSize: 9,
                              fontWeight: 700,
                            }}
                          >
                            {p.lateApplied ? "Late Payment" : "On Time"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more/less */}
      {!drillFilter && filtered.length > PREVIEW && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
            background: T.surface,
            border: `1px solid ${T.border}`,
            color: T.muted,
            borderRadius: 8,
            padding: "8px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {expanded
            ? "▲ Show less"
            : `▼ Show ${filtered.length - PREVIEW} more installments`}
        </button>
      )}
    </div>
  );
};

// ── Confirmation dialog for destructive actions ───────────────
export const ConfirmDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}) => (
  <Dialog title={title} onClose={onCancel} width={400}>
    <p
      style={{ color: T.txt, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}
    >
      {message}
    </p>
    <div style={{ display: "flex", gap: 8 }}>
      <Btn v={confirmVariant} onClick={onConfirm} full>
        {confirmLabel}
      </Btn>
      <Btn v="secondary" onClick={onCancel} full>
        Cancel
      </Btn>
    </div>
  </Dialog>
);

export const LoanModal = ({
  loan,
  customers,
  payments,
  interactions,
  onClose,
  onViewCustomer,
  actions,
  workers = [],
  setLoans,
  addAudit,
}) => {
  useModalLock();
  const [tab, setTab] = useState("details");
  const scrollRef = useRef(null);

  // Reset scroll to top whenever a new loan is selected
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [loan.id]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const loanDerived = useMemo(() => {
    const cust = customers.find(
      (c) => c.id === (loan.customerId || loan.customer_id),
    ) || { name: loan.customer };
    const pays = payments.filter((p) => p.loanId === loan.id && p.status === 'Allocated');
    const ints = (interactions || []).filter((i) =>
      i.loanId === loan.id ||
      i.customerId === loan.customerId ||
      i.customer_id === loan.customerId
    );
    const lastPay = [...pays].sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const paid = pays.reduce((s, p) => s + p.amount, 0);
    const engine = calculateLoanStatus(loan, null, paid);
    const penalty = engine.penalty;
    const loanDiscount = Number(loan.interestDiscount || 0);
    const effectiveRate = 0.3 * (1 - loanDiscount / 100);
    const baseInterest = Math.round((loan.amount || 0) * effectiveRate);
    const totalDue = engine.totalPayable;
    const remaining = engine.totalAmountDue;
    return { cust, pays, ints, lastPay, paid, penalty, engine, totalDue, remaining, baseInterest, loanDiscount, effectiveRate };
  }, [loan, customers, payments, interactions]);
  const { cust, pays, ints, lastPay, paid, penalty, engine, totalDue, remaining, baseInterest, loanDiscount, effectiveRate } = loanDerived;
  const { open: openSMS, Dialog: SMSDialog } = useSMS();
  const { open: openContact, Popup: ContactPopup } = useContactPopup();

  const schedule = () => {
    const bal = loan.balance;
    const rt = loan.repaymentType;
    if (!bal || bal <= 0) return [];

    const principal = loan.amount || 0;
    const discount = Number(loan.interestDiscount || 0);
    const effectiveRate = 0.3 * (1 - discount / 100);
    const expectedTotal = principal ? (principal + Math.round(principal * effectiveRate)) : bal;

    if (rt === "Daily")
      return [
        { p: "Per Day", a: Math.ceil(expectedTotal / 30) },
        { p: "Per Week", a: Math.ceil(expectedTotal / 30) * 7 },
      ];
    if (rt === "Weekly")
      return [
        { p: "Per Week", a: Math.ceil(expectedTotal / 4) },
        { p: "Per Month", a: expectedTotal },
      ];
    if (rt === "Biweekly")
      return [
        { p: "Per 2 Weeks", a: Math.ceil(expectedTotal / 2) },
        { p: "Per Month", a: expectedTotal },
      ];
    if (rt === "Monthly") return [{ p: "Per Month", a: expectedTotal }];
    return [{ p: "Lump Sum", a: expectedTotal }];
  };

  const TABS = [
    { k: "details", l: "Details" },
    { k: "timeline", l: "📅 Payment Timeline" },
    { k: "schedule", l: "Schedule" },
    { k: "interactions", l: `Interactions (${ints.length})` },
  ];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Loan ${loan.id} — ${loan.customer}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9900,
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        background: "rgba(4,8,16,0.55)",
      }}
    >
      {/* Panel pinned directly to the viewport via position:absolute relative to fixed portal backdrop so it is
          never clipped by ancestor overflow:hidden or transform contexts */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 520,
          background: T.card,
          borderLeft: `1px solid ${T.hi}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-20px 0 60px #00000080",
          overflow: "hidden",
          zIndex: 9901,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          padding: "calc(18px + env(safe-area-inset-top, 0px)) 20px 14px",
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
          background: T.card,
          zIndex: 10,
        }}
        >
          <div>
            <div
              style={{
                color: T.txt,
                fontSize: 15,
                fontWeight: 800,
                fontFamily: T.head,
              }}
            >
              {loan.id}
            </div>
            <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>
              {cust.name} · {loan.status} {cust.phone ? `· ${cust.phone}` : ''}{cust.altPhone ? ` / ${cust.altPhone}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: T.card2,
              border: `1px solid ${T.border}`,
              color: T.muted,
              borderRadius: 99,
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginLeft: 12,
            }}
          >
            ✕
          </button>
        </div>
        <div 
          ref={scrollRef}
          style={{ 
          flex: 1, 
          padding: "18px 20px calc(120px + env(safe-area-inset-bottom, 0px))", 
          overflowY: "auto", 
          minHeight: 0, 
          WebkitOverflowScrolling: 'touch' 
        }}>
          {/* Status + customer link */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge color={SC[loan.status] || T.muted}>{loan.status}</Badge>
              {cust.id && onViewCustomer && (
                <button
                  onClick={() => {
                    onClose();
                    onViewCustomer(cust);
                  }}
                  style={{
                    background: T.aLo,
                    border: `1px solid ${T.aMid}`,
                    color: T.accent,
                    borderRadius: 7,
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  View Customer Profile →
                </button>
              )}
              {cust.phone && (
                <button
                  onClick={(e) => openContact(cust.name, cust.phone, e, cust.altPhone, cust.id)}
                  style={{
                    background: T.surface, border: `1px solid ${T.border}`,
                    color: T.accent, borderRadius: 7, height: 28, padding: '0 10px',
                    display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
                    fontSize: 12, fontWeight: 700, cursor: "pointer"
                  }}
                >
                  📞 Contact
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, fontSize: 11, background: T.surface, border: `1px solid ${T.border}`, padding: '4px 10px', borderRadius: 7 }}>
              <div><span style={{ color: T.dim }}>Disbursed:</span> <span style={{ color: T.txt, fontWeight: 700 }}>{loan.disbursed || "—"}</span></div>
              <div style={{ width: 1, background: T.border }} />
              <div><span style={{ color: T.dim }}>Due:</span> <span style={{ color: loan.daysOverdue > 0 ? T.danger : T.txt, fontWeight: 700 }}>{(() => {
                if (!loan.disbursed) return "—";
                const d = new Date(loan.disbursed);
                d.setDate(d.getDate() + 30);
                return d.toISOString().split("T")[0];
              })()}</span></div>
            </div>
          </div>

          {/* Key figures — driven entirely by calculateLoanStatus engine */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 7,
              marginBottom: 12,
            }}
          >
            {[
              ["Principal", fmt(loan.amount), T.txt],
              ["Rate", `${(effectiveRate * 100).toFixed(1)}%`, loanDiscount > 0 ? T.accent : T.txt, loanDiscount > 0 ? `Was 30% · ${loanDiscount}% off` : null],
              ["Base Int.", fmt(baseInterest), T.txt],
              ["Paid", fmt(paid), paid > 0 ? T.ok : T.txt],
              ["Remaining", fmt(remaining), remaining > 0 ? T.warn : T.ok],
              ["Overdue", loan.daysOverdue > 0 ? `${loan.daysOverdue}d` : "None", loan.daysOverdue > 0 ? T.danger : T.ok],
              ["Penalty", fmt(penalty), penalty > 0 ? T.danger : T.muted],
              ["Total Due", fmt(totalDue), totalDue > 0 ? T.accent : T.ok],
            ].map(([k, v, col, hint]) => (
              <div
                key={k}
                style={{
                  background: T.surface,
                  borderRadius: 8,
                  padding: "8px 10px",
                  border: hint ? `1px solid ${T.accent}30` : `1px solid transparent`,
                }}
              >
                <div
                  style={{
                    color: T.muted,
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 2,
                  }}
                >
                  {k}
                </div>
                <div
                  style={{
                    color: col,
                    fontWeight: 800,
                    fontSize: 13,
                    fontFamily: "monospace",
                  }}
                >
                  {v}
                </div>
                {hint && (
                  <div style={{ fontSize: 8, color: T.accent, fontWeight: 700, marginTop: 2, letterSpacing: 0.3 }}>
                    🏷️ {hint}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Phase banner — shows only when overdue and not settled, driven by engine */}
          {engine.phase !== "none" && loan.daysOverdue > 0 && !engine.isSettled && (
            <div
              style={{
                background: engine.isFrozen
                  ? T.card2
                  : engine.phase === "penalty"
                    ? T.dLo
                    : T.wLo,
                border: `1px solid ${engine.isFrozen ? T.border : engine.phase === "penalty" ? T.danger + "40" : T.warn + "40"}`,
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    color: engine.isFrozen
                      ? T.muted
                      : engine.phase === "penalty"
                        ? T.danger
                        : T.warn,
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {engine.isFrozen ? "❄ Frozen" : "⚠ " + engine.status}
                </div>
                <div style={{ color: T.muted, fontSize: 11, marginTop: 2 }}>
                  {engine.isFrozen
                    ? "No further penalty — total is locked at " +
                      fmt(engine.totalAmountDue)
                    : `Penalty: 1.2% per day of Outstanding Balance · Capped at 60 days`}
                </div>
              </div>
              <div
                style={{
                  color: engine.isFrozen ? T.muted : T.danger,
                  fontFamily: "monospace",
                  fontWeight: 900,
                  fontSize: 14,
                  flexShrink: 0,
                  marginLeft: 8,
                }}
              >
                {loan.daysOverdue}d
              </div>
            </div>
          )}

          {/* Last payment banner */}
          {lastPay && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: T.oLo,
                border: `1px solid ${T.ok}30`,
                borderRadius: 8,
                padding: "9px 13px",
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ color: T.ok, fontWeight: 700, fontSize: 12 }}>
                  Last Payment
                </div>
                <div style={{ color: T.muted, fontSize: 11 }}>
                  {ts(lastPay.date)} · {lastPay.mpesa || "Manual"}
                </div>
              </div>
              <div
                style={{
                  color: T.ok,
                  fontFamily: "monospace",
                  fontWeight: 900,
                  fontSize: 15,
                }}
              >
                {fmt(lastPay.amount)}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: 5,
              marginBottom: 12,
              overflowX: "auto",
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                style={{
                  background: tab === t.k ? T.accent : T.surface,
                  color: tab === t.k ? "#060A10" : T.muted,
                  border: `1px solid ${tab === t.k ? T.accent : T.border}`,
                  borderRadius: 99,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t.l}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 7,
              }}
            >
              {[
                ["Disbursed", loan.disbursed || "Not yet"],
                ["Due / Repayment", loan.repaymentType],
                ["M-Pesa Code", loan.mpesa || "—"],
                ["Officer", loan.officer || "—"],

                ["Customer ID", loan.customerId || "—"],
                ["Phase", engine.status],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    background: T.surface,
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <div
                    style={{
                      color: T.muted,
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 2,
                    }}
                  >
                    {k}
                  </div>
                  <div style={{ color: T.txt, fontSize: 13, fontWeight: 600 }}>
                    {v}
                  </div>
                </div>
              ))}
              
              {/* Allocation Section */}
              <div style={{ gridColumn: 'span 2', marginTop: 8, background: `${T.accent}08`, border: `1px dashed ${T.accent}30`, borderRadius: 12, padding: 12 }}>
                 <div style={{ color: T.accent, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Loan Allocation</div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                       <FI 
                        label="Collections Officer" 
                        type="select" 
                        value={loan.collectionsOfficer || ''} 
                        onChange={(val) => {
                          if (!setLoans) return;
                          const upd = { ...loan, collectionsOfficer: val };
                          setLoans(ls => ls.map(l => l.id === loan.id ? upd : l));
                          sbWrite('loans', toSupabaseLoan(upd));
                          if (addAudit) addAudit('Loan Allocated', loan.id, `Assignee: ${val || 'Unassigned'}`);
                        }}
                        options={[
                          { l: '— Unassigned —', v: '' },
                          ...workers.filter(w => w.role === 'Collections Officer').map(w => ({ l: w.name, v: w.name }))
                        ]}
                       />
                    </div>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: loan.collectionsOfficer ? T.oLo : T.hi, display: 'flex', alignItems: 'center', justifyContent: 'center', color: loan.collectionsOfficer ? T.ok : T.dim }}>
                       {loan.collectionsOfficer ? '✅' : '⏳'}
                    </div>
                 </div>
                 <div style={{ color: T.muted, fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
                    Officer only earns commission from payments made on loans allocated to them.
                 </div>
              </div>
            </div>
          )}

          {tab === "timeline" && (
            <div>
              <PaymentTimeline loan={loan} payments={payments} />
            </div>
          )}

          {tab === "schedule" && (
            <div>
              {loan.balance <= 0 ? (
                <Alert type="ok">
                  Loan fully settled — no further payments due.
                </Alert>
              ) : (
                <div>
                  {schedule().map(({ p, a }) => (
                    <div
                      key={p}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        background: T.surface,
                        borderRadius: 8,
                        marginBottom: 6,
                        border: `1px solid ${T.border}`,
                      }}
                    >
                      <span style={{ color: T.muted, fontSize: 13 }}>{p}</span>
                      <span
                        style={{
                          color: T.accent,
                          fontFamily: "monospace",
                          fontWeight: 800,
                        }}
                      >
                        {fmt(a)}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 7,
                      marginTop: 8,
                    }}
                  >
                    {[
                      ["Remaining Balance", fmt(engine.baseBalance)],
                      ["Penalty", fmt(engine.penalty)],
                      ["Total Due", fmt(remaining)],
                      ["Phase", engine.status],
                      [
                        "Progress",
                        engine.isSettled ? "100%" : `${loan.amount > 0 ? Math.min(100, Math.round((paid / (loan.amount * 1.3)) * 100)) : 0}%`,
                      ],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          background: T.surface,
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        <div
                          style={{
                            color: T.muted,
                            fontSize: 9,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            marginBottom: 2,
                          }}
                        >
                          {k}
                        </div>
                        <div
                          style={{
                            color: T.txt,
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: "monospace",
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "interactions" && (
            <div>
              {ints.length === 0 && (
                <div
                  style={{
                    color: T.muted,
                    textAlign: "center",
                    padding: 20,
                    background: T.surface,
                    borderRadius: 9,
                  }}
                >
                  No interactions recorded for this customer.
                </div>
              )}
              {[...ints]
                .sort((a, b) => {
                  const da = a.created_at || a.createdAt || a.date || '';
                  const db = b.created_at || b.createdAt || b.date || '';
                  return db.localeCompare(da);
                })
                .map((i) => {
                  const isLoanLevel = i.loanId === loan.id;
                  return (
                    <div
                      key={i.id}
                      style={{
                        background: T.surface,
                        border: `1px solid ${isLoanLevel ? T.accent + '50' : T.border}`,
                        borderRadius: 9,
                        padding: "10px 12px",
                        marginBottom: 7,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Badge color={T.accent}>{i.type}</Badge>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: isLoanLevel ? T.accent : T.muted,
                            background: isLoanLevel ? T.aLo : T.surface,
                            border: `1px solid ${isLoanLevel ? T.aMid : T.border}`,
                            borderRadius: 4, padding: '1px 6px',
                          }}>
                            {isLoanLevel ? '📎 Loan' : '👤 Customer'}
                          </span>
                        </div>
                        <span style={{ color: T.muted, fontSize: 11, flexShrink: 0, marginLeft: 6 }}>
                          {ts(i.created_at || i.createdAt || i.date || '')}
                        </span>
                      </div>
                      <div style={{ color: T.txt, fontSize: 13, lineHeight: 1.5 }}>{i.notes}</div>
                      {i.officer && (
                        <div style={{ color: T.muted, fontSize: 11, marginTop: 5 }}>By: {i.officer}</div>
                      )}
                      {i.promiseAmount && (
                        <div
                          style={{ color: T.gold, fontSize: 12, marginTop: 4 }}
                        >
                          Promise: {fmt(i.promiseAmount)} by {i.promiseDate}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          {actions && (
            <div
              style={{
                paddingTop: 16,
                borderTop: `1px solid ${T.border}`,
                marginTop: 4,
              }}
            >
              {actions}
            </div>
          )}
        </div>
        {SMSDialog}
        {ContactPopup}
      </div>
    </div>,
    document.body
  );
};

export const QueuedSmsTab = ({ customer, showToast, setSmsLogs }) => {
  const [queued, setQueued] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editSendAt, setEditSendAt] = useState("");
  const [cancelingId, setCancelingId] = useState(null);

  // Form states for manual additions
  const [showAddForm, setShowAddForm] = useState(false);
  const [addText, setAddText] = useState("");
  const [addSendAt, setAddSendAt] = useState(() => toLocalDatetimeString(new Date()));
  const [sendingDirect, setSendingDirect] = useState(false);

  const localToast = useToast();
  const activeShowToast = showToast || localToast.show;

  // Local helper to format datetime-local string (YYYY-MM-DDTHH:mm) in local timezone
  function toLocalDatetimeString(date) {
    if (!date) return "";
    const d = new Date(date);
    const tzoffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
  }

  const fetchQueued = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("queued_sms")
      .select("*")
      .eq("customer_id", customer.id)
      .order("send_at", { ascending: true });
    if (error) {
      console.error("fetchQueued error:", error);
    }
    if (!error && data) {
      setQueued(data);
    }
    setLoading(false);
  }, [customer.id]);

  useEffect(() => {
    fetchQueued();
  }, [fetchQueued]);

  const handleCancel = async (id) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("queued_sms")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (!error) {
      SFX.play("click");
      fetchQueued();
    } else {
      alert("Failed to cancel message: " + error.message);
    }
  };

  const handleRequeue = async (item) => {
    if (!supabase) return;
    const now = new Date();
    const originalSendAt = new Date(item.send_at);
    // If original send time is in the past, update scheduled time to current time
    const newSendAt = originalSendAt < now ? now.toISOString() : item.send_at;

    const { error } = await supabase
      .from("queued_sms")
      .update({ status: "queued", send_at: newSendAt })
      .eq("id", item.id);

    if (!error) {
      SFX.play("ok");
      activeShowToast("Message re-queued successfully", "ok");
      fetchQueued();
    } else {
      alert("Failed to re-queue message: " + error.message);
    }
  };

  const handleEditStart = (item) => {
    setEditingId(item.id);
    setEditText(item.message);
    setEditSendAt(toLocalDatetimeString(item.send_at));
  };

  const handleEditSave = async (id) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("queued_sms")
      .update({
        message: editText,
        send_at: new Date(editSendAt).toISOString()
      })
      .eq("id", id);
    if (!error) {
      SFX.play("ok");
      activeShowToast("Message saved successfully", "ok");
      setEditingId(null);
      fetchQueued();
    } else {
      alert("Failed to save changes: " + error.message);
    }
  };

  const handleAddQueue = async () => {
    if (!supabase || !addText.trim()) return;
    const { error } = await supabase
      .from("queued_sms")
      .insert([{
        customer_id: customer.id,
        message: addText.trim(),
        send_at: new Date(addSendAt).toISOString(),
        status: "queued"
      }]);
    if (!error) {
      SFX.play("ok");
      activeShowToast("Message successfully scheduled", "ok");
      setAddText("");
      setShowAddForm(false);
      fetchQueued();
    } else {
      activeShowToast("Failed to schedule: " + error.message, "danger");
    }
  };

  const handleSendDirect = async () => {
    if (!supabase || !addText.trim()) return;
    setSendingDirect(true);
    try {
      let recipient = (customer.phone || "").replace(/\s+/g, "");
      if (recipient.startsWith("0")) {
        recipient = "254" + recipient.substring(1);
      }
      if (!recipient.startsWith("254")) {
        recipient = "254" + recipient;
      }

      const { data, error: invokeError } = await supabase.functions.invoke("send-sms", {
        body: { msisdn: recipient, message: addText.trim() }
      });
      if (invokeError) throw invokeError;
      if (!data?.success) throw new Error(data?.response?.message || "Failed to send SMS via gateway");

      // Insert record into queued_sms with status 'sent'
      const { error: queueError } = await supabase
        .from("queued_sms")
        .insert([{
          customer_id: customer.id,
          message: addText.trim(),
          send_at: new Date().toISOString(),
          status: "sent"
        }]);
      if (queueError) throw queueError;

      // Insert into sms_logs so it is permanently logged in customer profile
      const newSmsLog = {
        phone: recipient,
        message: addText.trim(),
        customer_id: customer.id,
        source: "Admin Portal",
        status_code: 200,
        response_body: data,
        sender_id: "Admin"
      };
      const { data: insertedLogs, error: logError } = await supabase
        .from("sms_logs")
        .insert([newSmsLog])
        .select();

      if (logError) throw logError;

      // Instant live sync: add log to in-memory state of customer interactions
      if (setSmsLogs && insertedLogs && insertedLogs[0]) {
        setSmsLogs(prev => [insertedLogs[0], ...prev]);
      }

      SFX.play("ok");
      activeShowToast("Message sent and logged successfully", "ok");
      setAddText("");
      setShowAddForm(false);
      fetchQueued();
    } catch (err) {
      activeShowToast("Failed to send directly: " + err.message, "danger");
    } finally {
      setSendingDirect(false);
    }
  };

  const queuedItems = queued.filter((item) => item.status === "queued");
  const nextQueued = queuedItems.length > 0 ? [queuedItems[0]] : [];
  const otherItems = queued.filter((item) => item.status !== "queued");
  const displayedItems = [...nextQueued, ...otherItems];

  if (loading) {
    return <div style={{ color: T.muted, textAlign: 'center', padding: 20 }}>Loading queue...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tab Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h4 style={{ margin: 0, color: T.accent, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
          Scheduled SMS Queue
        </h4>
        <Btn sm onClick={() => {
          setShowAddForm(!showAddForm);
          setAddSendAt(toLocalDatetimeString(new Date()));
        }}>
          {showAddForm ? "✕ Close Form" : "➕ Create Message"}
        </Btn>
      </div>

      {/* Manual Message Input Form */}
      {showAddForm && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${T.accent}`, background: 'var(--surface)', borderRadius: 12 }}>
          <h5 style={{ margin: 0, fontSize: 13, color: T.txt, fontWeight: 700 }}>New Customer Message</h5>
          <FI
            label="Message Content"
            type="textarea"
            placeholder="Type custom SMS message to send..."
            value={addText}
            onChange={setAddText}
            style={{ marginBottom: 0 }}
          />
          <FI
            label="Scheduled Send Time (Skip for Direct Send)"
            type="datetime-local"
            value={addSendAt}
            onChange={setAddSendAt}
            style={{ marginBottom: 0 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Btn
              v="secondary"
              onClick={handleSendDirect}
              disabled={sendingDirect || !addText.trim()}
            >
              {sendingDirect ? "Sending..." : "⚡ Send Directly"}
            </Btn>
            <Btn
              onClick={handleAddQueue}
              disabled={sendingDirect || !addText.trim()}
            >
              📅 Queue Message
            </Btn>
          </div>
        </div>
      )}

      {/* Queued Messages Queue List */}
      {displayedItems.length === 0 ? (
        <div
          style={{
            color: T.muted,
            textAlign: "center",
            padding: 30,
            background: T.surface,
            borderRadius: 9,
            border: `1px dashed ${T.border}`
          }}
        >
          No scheduled or sent messages for this customer.
        </div>
      ) : (
        displayedItems.map((item) => (
          <div
            key={item.id}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 9,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: T.muted }}>
                Send At: {new Date(item.send_at).toLocaleString("en-KE")}
              </span>
              <Badge
                color={
                  item.status === 'queued' ? T.accent :
                  item.status === 'sent' ? T.ok :
                  item.status === 'cancelled' ? T.muted :
                  T.danger
                }
              >
                {item.status.toUpperCase()}
              </Badge>
            </div>

            {editingId === item.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <FI
                  label="Message Content"
                  type="textarea"
                  value={editText}
                  onChange={setEditText}
                  style={{ marginBottom: 0 }}
                />
                <FI
                  label="Scheduled Send Time"
                  type="datetime-local"
                  value={editSendAt}
                  onChange={setEditSendAt}
                  style={{ marginBottom: 0 }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                  <Btn sm onClick={() => setEditingId(null)} v="muted">Cancel</Btn>
                  <Btn sm onClick={() => handleEditSave(item.id)}>Save Changes</Btn>
                </div>
              </div>
            ) : (
              <>
                <div style={{ color: T.txt, fontSize: 13, lineHeight: 1.4 }}>
                  {item.message.replace(/\s*\[Ref:[^\]]*\]/g, '').trim()}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                  {item.status === 'queued' && (
                    <>
                      <Btn sm onClick={() => handleEditStart(item)}>✏ Edit</Btn>
                      <Btn sm onClick={() => setCancelingId(item.id)} v="danger">✕ Cancel</Btn>
                    </>
                  )}
                  {item.status === 'cancelled' && (
                    <Btn sm onClick={() => handleRequeue(item)}>↩ Re-queue</Btn>
                  )}
                </div>
              </>
            )}
          </div>
        ))
      )}

      {cancelingId && (
        <ConfirmDialog
          title="Cancel Scheduled SMS"
          message="Are you sure you want to cancel this scheduled payment reminder? Once cancelled, it will not be sent automatically."
          confirmLabel="Yes, Cancel"
          confirmVariant="danger"
          onConfirm={async () => {
            const idToCancel = cancelingId;
            setCancelingId(null);
            await handleCancel(idToCancel);
          }}
          onCancel={() => setCancelingId(null)}
        />
      )}
      {!showToast && <ToastContainer toasts={localToast.toasts} />}
    </div>
  );
};

export const CustomerDetail = ({
  customer,
  loans,
  payments,
  interactions,
  workers,
  onClose,
  onSave,
  onSelectLoan,
  onBlacklist,
}) => {
  useModalLock();
  const [tab, setTab] = useState("info");
  const scrollRef = useRef(null);

  // Reset scroll to top whenever a new customer is selected
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [customer.id]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const [editing, setEditing] = useState(false);
  const custDerived = useMemo(() => {
    const myLoans = loans.filter((l) => l.customerId === customer.id);
    const myPays = payments.filter((p) => p.customerId === customer.id);
    const myInts = interactions.filter((i) => i.customerId === customer.id);
    const overdueLoans = myLoans.filter((l) => l.status === "Overdue");
    const activeLoans = myLoans.filter((l) => l.status === "Active");
    const settledLoans = myLoans.filter((l) => l.status === "Settled");
    const totalOwed = overdueLoans.reduce((s, l) => {
      const lPays = myPays.filter(p => p.loanId === l.id);
      const paid = lPays.reduce((acc, p) => acc + p.amount, 0);
      const engine = calculateLoanStatus(l, null, paid);
      return s + engine.totalAmountDue;
    }, 0);
    const totalPaid = myPays.reduce((s, p) => s + p.amount, 0);
    const totalPrincipal = myLoans.reduce((s, l) => s + l.amount, 0);
    const lastPay =
      [...myPays].sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    return {
      myLoans,
      myPays,
      myInts,
      overdueLoans,
      activeLoans,
      settledLoans,
      totalOwed,
      totalPaid,
      totalPrincipal,
      lastPay,
    };
  }, [loans, payments, interactions, customer]);
  const {
    myLoans,
    myPays,
    myInts,
    overdueLoans,
    activeLoans,
    settledLoans,
    totalOwed,
    totalPaid,
    totalPrincipal,
    lastPay,
  } = custDerived;
  const hasDefault = overdueLoans.length > 0;
  const phone = (customer.phone || "").replace(/\s/g, "");
  const waPhone = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
  const _acctRef = customer.idNo || customer.idNumber || customer.accountNumber || (overdueLoans[0] || activeLoans[0] || myLoans[0])?.id || customer.id;
  const smsText = encodeURIComponent(
    `Dear ${customer.name.split(" ")[0]}, your loan balance of KES ${totalOwed.toLocaleString("en-KE")} is overdue. Please pay via Paybill 4166191, Account: ${_acctRef}. Contact us for assistance.`,
  );
  const waText = encodeURIComponent(
    `Hello ${customer.name.split(" ")[0]}, this is a reminder that your loan balance of *KES ${totalOwed.toLocaleString("en-KE")}* is overdue.\n\nPlease pay via:\n• Paybill: *4166191*\n• Account No: *${_acctRef}*\n\nContact us if you need assistance.`,
  );
  const { open: openSMS, Dialog: SMSDialog } = useSMS();
  const tabs = [
    { v: "info", l: "Profile" },
    { v: "loans", l: `Loans (${myLoans.length})` },
    { v: "payments", l: `📅 Payment Track (${myPays.length})` },
    { v: "interactions", l: `Timeline (${myInts.length})` },
    { v: "queue", l: "✉ Queue" },
    { v: "docs", l: `Documents (${(customer.docs || []).length})` },
  ];
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Customer profile — ${customer.name}`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9900,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        background: "rgba(4,8,16,0.55)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: T.card,
          borderLeft: `1px solid ${T.hi}`,
          width: "100%",
          maxWidth: 520,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-20px 0 60px #00000080",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "calc(18px + env(safe-area-inset-top, 0px)) 20px 14px",
            borderBottom: `1px solid ${T.border}`,
            position: "sticky",
            top: 0,
            background: T.card,
            zIndex: 10,
          }}
        >
          <div>
            <div
              style={{
                color: T.txt,
                fontSize: 15,
                fontWeight: 800,
                fontFamily: T.head,
              }}
            >
              {customer.name}
            </div>
            <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>
              {escHtml(customer.id)} · {escHtml(customer.business) || "—"} ·{" "}
              {escHtml(customer.location) || "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close customer profile"
            style={{
              background: T.card2,
              border: `1px solid ${T.border}`,
              color: T.muted,
              borderRadius: 99,
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginLeft: 12,
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            padding: "18px 20px calc(120px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {editing && onSave && (
            <CustomerEditForm
              customer={customer}
              workers={workers || []}
              onSave={(updated) => {
                onSave(updated);
                setEditing(false);
              }}
              onClose={() => setEditing(false)}
            />
          )}
          {!editing && (
            <>
              {customer.blacklisted && (
                <Alert type="danger">⛔ This customer is blacklisted</Alert>
              )}

              {/* Edit button */}
              {(onSave || onBlacklist) && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 6,
                    marginBottom: 12,
                  }}
                >
                  {onBlacklist && !customer.blacklisted && (
                    <Btn sm v="danger" onClick={() => onBlacklist(customer)}>
                      ⛔ Blacklist
                    </Btn>
                  )}
                  {onSave && (
                    <Btn sm onClick={() => setEditing(true)}>
                      ✏ Edit Customer
                    </Btn>
                  )}
                </div>
              )}

              {/* Quick contact bar — only shown when defaulted */}
              {hasDefault && (
                <div
                  style={{
                    background: T.dLo,
                    border: `1px solid ${T.danger}30`,
                    borderRadius: 12,
                    padding: "14px 16px",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: T.danger,
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      >
                        ⚠ {overdueLoans.length} Overdue Loan
                        {overdueLoans.length > 1 ? "s" : ""}
                      </div>
                      <div
                        style={{ color: T.muted, fontSize: 12, marginTop: 2 }}
                      >
                        Total owed:{" "}
                        <span
                          style={{
                            color: T.danger,
                            fontWeight: 700,
                            fontFamily: T.mono,
                          }}
                        >
                          {fmt(totalOwed)}
                        </span>{" "}
                        · Max overdue:{" "}
                        <span style={{ color: T.danger, fontWeight: 700 }}>
                          {Math.max(...overdueLoans.map((l) => l.daysOverdue))}d
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a
                      href={`tel:${phone}`}
                      style={{
                        flex: 1,
                        minWidth: 90,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                        background: T.ok,
                        color: "#fff",
                        borderRadius: 9,
                        padding: "10px 14px",
                        fontWeight: 800,
                        fontSize: 13,
                        textDecoration: "none",
                        fontFamily: T.body,
                      }}
                    >
                      📞 Call
                    </a>
                    <button
                      onClick={() => openSMS(phone, smsText, loan.customerId)}
                      style={{
                        flex: 1,
                        minWidth: 90,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                        background: T.bLo,
                        color: T.blue,
                        border: `1px solid ${T.blue}38`,
                        borderRadius: 9,
                        padding: "10px 14px",
                        fontWeight: 800,
                        fontSize: 13,
                        textDecoration: "none",
                        fontFamily: T.body,
                        cursor: "pointer",
                      }}
                    >
                      💬 SMS
                    </button>
                    <a
                      href={`https://wa.me/${waPhone}?text=${waText}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        flex: 1,
                        minWidth: 90,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                        background: "#25D36618",
                        color: "#25D366",
                        border: "1px solid #25D36638",
                        borderRadius: 9,
                        padding: "10px 14px",
                        fontWeight: 800,
                        fontSize: 13,
                        textDecoration: "none",
                        fontFamily: T.body,
                      }}
                    >
                      WhatsApp
                    </a>
                  </div>
                  {/* NOK quick-dial if available */}
                  {(customer.n1n || customer.n2n) && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: `1px solid ${T.danger}20`,
                      }}
                    >
                      <div
                        style={{
                          color: T.muted,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.7,
                          marginBottom: 7,
                        }}
                      >
                        Next of Kin — Quick Dial
                      </div>
                      <div
                        style={{ display: "flex", gap: 7, flexWrap: "wrap" }}
                      >
                        {[
                          [customer.n1n, customer.n1p, customer.n1r],
                          [customer.n2n, customer.n2p, customer.n2r],
                          [customer.n3n, customer.n3p, customer.n3r],
                        ]
                          .filter(([n]) => n)
                          .map(([name, ph, rel]) => (
                            <a
                              key={ph}
                              href={`tel:${(ph || "").replace(/\s/g, "")}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                background: T.surface,
                                border: `1px solid ${T.border}`,
                                borderRadius: 8,
                                padding: "7px 11px",
                                textDecoration: "none",
                                fontSize: 12,
                                color: T.txt,
                                fontWeight: 600,
                              }}
                            >
                              <span style={{ fontSize: 14 }}>📞</span>
                              <span>
                                {name} {rel ? `(${rel})` : ""}
                              </span>
                            </a>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tabs */}
              <div style={{ marginBottom: 16 }}>
                <Pills opts={tabs} val={tab} onChange={setTab} />
              </div>

              {tab === "info" && (
                <div>
                  {/* Account summary */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3,1fr)",
                      gap: 7,
                      marginBottom: 12,
                    }}
                  >
                    {[
                      ["Borrowed", fmt(totalPrincipal), T.accent],
                      ["Paid", fmt(totalPaid), T.ok],
                      [
                        "Active",
                        activeLoans.length,
                        activeLoans.length > 0 ? T.ok : T.muted,
                      ],
                      [
                        "Overdue",
                        overdueLoans.length,
                        overdueLoans.length > 0 ? T.danger : T.ok,
                      ],
                      ["Settled", settledLoans.length, T.accent],
                      ["Joined", customer.joined, T.txt],
                    ].map(([k, v, col]) => (
                      <div
                        key={k}
                        style={{
                          background: T.surface,
                          borderRadius: 8,
                          padding: "9px 10px",
                          border: `1px solid ${T.border}`,
                        }}
                      >
                        <div
                          style={{
                            color: T.muted,
                            fontSize: 9,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            marginBottom: 2,
                          }}
                        >
                          {k}
                        </div>
                        <div
                          style={{
                            color: col,
                            fontWeight: 800,
                            fontSize: 13,
                            fontFamily: "monospace",
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Last payment */}
                  {lastPay && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: T.oLo,
                        border: `1px solid ${T.ok}30`,
                        borderRadius: 8,
                        padding: "9px 13px",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{ color: T.ok, fontWeight: 700, fontSize: 12 }}
                        >
                          Last Payment
                        </div>
                        <div style={{ color: T.muted, fontSize: 11 }}>
                          {ts(lastPay.date)} · {lastPay.mpesa || "Manual"} ·{" "}
                          {lastPay.loanId || "—"}
                        </div>
                      </div>
                      <div
                        style={{
                          color: T.ok,
                          fontFamily: "monospace",
                          fontWeight: 900,
                          fontSize: 15,
                        }}
                      >
                        {fmt(lastPay.amount)}
                      </div>
                    </div>
                  )}
                  {/* Personal + business fields */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 7,
                      marginBottom: 12,
                    }}
                  >
                    {[
                      ["Customer ID", customer.id],
                      ["Phone", <span onClick={(e) => openContact(customer.name, customer.phone, e, customer.altPhone, customer.id)} style={{ cursor: 'pointer', color: T.accent }}>{customer.phone}</span>],
                      ["Alt Phone", customer.altPhone ? <span onClick={(e) => openContact(customer.name, customer.altPhone, e, customer.phone, customer.id)} style={{ cursor: 'pointer', color: T.accent }}>{customer.altPhone}</span> : "—"],
                      ["National ID", customer.idNo],
                      ["Date of Birth", customer.dob || "—"],
                      ["Gender", customer.gender || "—"],
                      ["Residence", customer.residence || "—"],
                      ["Business", customer.business || "—"],
                      ["Location", customer.location || "—"],
                      ["Officer", customer.officer || "—"],

                      [
                        "Status",
                        customer.blacklisted ? (
                          <Badge color={T.danger}>Blacklisted</Badge>
                        ) : (
                          <Badge color={T.ok}>Active</Badge>
                        ),
                      ],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          background: T.surface,
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        <div
                          style={{
                            color: T.muted,
                            fontSize: 9,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            marginBottom: 2,
                          }}
                        >
                          {k}
                        </div>
                        <div
                          style={{
                            color: T.txt,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Next of kin */}
                  <div
                    style={{
                      background: T.surface,
                      borderRadius: 10,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        color: T.accent,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      Next of Kin
                    </div>
                    {[
                      ["1", customer.n1n, customer.n1p, customer.n1r],
                      ["2", customer.n2n, customer.n2p, customer.n2r],
                      ["3", customer.n3n, customer.n3p, customer.n3r],
                    ].map(([n, name, ph, rel]) => (
                      <div
                        key={n}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "7px 0",
                          borderBottom: `1px solid ${T.border}30`,
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: T.muted }}>
                          NOK {n}:{" "}
                          <span style={{ color: T.txt, fontWeight: 600 }}>
                            {name || "—"}
                          </span>{" "}
                          {rel ? (
                            <span style={{ color: T.muted }}> · {rel}</span>
                          ) : (
                            ""
                          )}
                        </span>
                        {ph && (
                          <a
                            href={`tel:${ph.replace(/\s/g, "")}`}
                            style={{
                              color: T.accent,
                              textDecoration: "none",
                              fontSize: 12,
                              fontWeight: 700,
                              background: T.aLo,
                              padding: "3px 9px",
                              borderRadius: 99,
                              border: `1px solid ${T.aMid}`,
                            }}
                          >
                            📞 {ph}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tab === "queue" && (
                <QueuedSmsTab customer={customer} />
              )}
              {tab === "loans" && (
                <div>
                  {myLoans.length === 0 && (
                    <div
                      style={{
                        color: T.muted,
                        textAlign: "center",
                        padding: 20,
                        background: T.surface,
                        borderRadius: 9,
                      }}
                    >
                      No loans on record
                    </div>
                  )}
                  <div
                    style={{
                      maxHeight: "40vh",
                      overflowY: "auto",
                      overflowX: "hidden",
                    }}
                  >
                    {myLoans.map((loan) => {
                      const lPays = myPays.filter((p) => p.loanId === loan.id);
                      const lLast =
                        [...lPays].sort((a, b) =>
                          b.date.localeCompare(a.date),
                        )[0] || null;
                      const lPaid = lPays.reduce((s, p) => s + p.amount, 0);
                      const eng = calculateLoanStatus(loan, null, lPaid);
                      return (
                        <div
                          key={loan.id}
                          style={{
                            background: T.surface,
                            border: `1.5px solid ${loan.status === "Overdue" ? T.danger + "40" : loan.status === "Settled" ? T.accent + "30" : T.border}`,
                            borderRadius: 11,
                            padding: "13px 14px",
                            marginBottom: 10,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              marginBottom: 9,
                              flexWrap: "wrap",
                              gap: 5,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                              }}
                            >
                              <span
                                onClick={() =>
                                  onSelectLoan && onSelectLoan(loan)
                                }
                                style={{
                                  color: T.accent,
                                  fontFamily: "monospace",
                                  fontWeight: 800,
                                  fontSize: 13,
                                  cursor: onSelectLoan ? "pointer" : "default",
                                  borderBottom: onSelectLoan
                                    ? `1px dashed ${T.accent}50`
                                    : "none",
                                }}
                              >
                                {loan.id}
                              </span>
                              <Badge color={SC[loan.status] || T.muted}>
                                {loan.status}
                              </Badge>
                              {eng.isFrozen && (
                                <Badge color={T.muted}>❄ Frozen</Badge>
                              )}
                            </div>
                            <span
                              style={{
                                color: T.txt,
                                fontFamily: "monospace",
                                fontWeight: 800,
                              }}
                            >
                              {fmt(loan.amount)}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(3,1fr)",
                              gap: 5,
                              marginBottom: 8,
                            }}
                          >
                            {[
                              [
                                "Remaining",
                                fmt(eng.baseBalance),
                                loan.status === "Overdue" ? T.danger : T.txt,
                              ],
                              [
                                "Penalty",
                                fmt(eng.penalty),
                                eng.penalty > 0 ? T.danger : T.muted,
                              ],
                              [
                                "Total Due", 
                                fmt(eng.totalAmountDue), 
                                T.accent
                              ],
                              [
                                "Overdue",
                                loan.daysOverdue > 0
                                  ? `${loan.daysOverdue}d`
                                  : "None",
                                loan.daysOverdue > 0 ? T.danger : T.ok,
                              ],
                              ["Officer", loan.officer || "—", T.txt],
                            ].map(([k, v, col]) => (
                              <div
                                key={k}
                                style={{
                                  background: T.card,
                                  borderRadius: 6,
                                  padding: "6px 8px",
                                }}
                              >
                                <div
                                  style={{
                                    color: T.muted,
                                    fontSize: 9,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                    marginBottom: 1,
                                  }}
                                >
                                  {k}
                                </div>
                                <div
                                  style={{
                                    color: col,
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {v}
                                </div>
                              </div>
                            ))}
                          </div>
                          {lLast && (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                background: T.oLo,
                                border: `1px solid ${T.ok}20`,
                                borderRadius: 6,
                                padding: "6px 9px",
                                fontSize: 12,
                              }}
                            >
                              <span style={{ color: T.muted }}>
                                Last payment{" "}
                                <b style={{ color: T.txt }}>{lLast.date}</b> ·{" "}
                                {lLast.mpesa || "manual"}
                              </span>
                              <span
                                style={{
                                  color: T.ok,
                                  fontFamily: "monospace",
                                  fontWeight: 800,
                                }}
                              >
                                {fmt(lLast.amount)}
                              </span>
                            </div>
                          )}
                          {lPaid > 0 && (
                            <div
                              style={{
                                color: T.muted,
                                fontSize: 11,
                                marginTop: 5,
                              }}
                            >
                              {lPays.length} payment
                              {lPays.length !== 1 ? "s" : ""} · total paid{" "}
                              <b style={{ color: T.ok }}>{fmt(lPaid)}</b>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {tab === "payments" && (
                <div>
                  {/* Per-loan payment timelines */}
                  {myLoans.filter((l) => l.disbursed).length === 0 && (
                    <div
                      style={{
                        color: T.muted,
                        textAlign: "center",
                        padding: 24,
                        background: T.surface,
                        borderRadius: 10,
                      }}
                    >
                      No loan history with payments
                    </div>
                  )}
                  <div
                    style={{
                      maxHeight: "40vh",
                      overflowY: "auto",
                      overflowX: "hidden",
                    }}
                  >
                    {myLoans
                      .filter((l) => l.disbursed)
                      .map((l) => (
                        <div key={l.id} style={{ marginBottom: 20 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 8,
                              flexWrap: "wrap",
                              padding: "8px 10px",
                              background: T.surface,
                              borderRadius: 9,
                              border: `1px solid ${T.border}`,
                            }}
                          >
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectLoan) onSelectLoan(l);
                              }}
                              style={{
                                color: T.accent,
                                fontFamily: "monospace",
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: onSelectLoan ? "pointer" : "default",
                                borderBottom: onSelectLoan
                                  ? `1px dashed ${T.accent}50`
                                  : "none",
                              }}
                            >
                              {l.id}
                            </span>
                            <Badge color={SC[l.status] || T.muted}>
                              {l.status}
                            </Badge>
                            <span style={{ color: T.muted, fontSize: 11 }}>
                              {l.repaymentType} · {fmt(l.amount)}
                            </span>
                            <span
                              style={{
                                color: T.muted,
                                fontSize: 11,
                                marginLeft: "auto",
                              }}
                            >
                              Disbursed {l.disbursed}
                            </span>
                          </div>
                          <PaymentTimeline
                            loan={l}
                            payments={payments}
                            compact={true}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {tab === "interactions" &&
                (myInts.length === 0 ? (
                  <div
                    style={{ color: T.muted, textAlign: "center", padding: 20 }}
                  >
                    No interactions recorded
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: "40vh",
                      overflowY: "auto",
                      overflowX: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {myInts.map((i) => (
                      <div
                        key={i.id}
                        style={{
                          background: T.surface,
                          border: `1px solid ${T.border}`,
                          borderRadius: 10,
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 6,
                          }}
                        >
                          <Badge color={T.accent}>{i.type}</Badge>
                          <span style={{ color: T.muted, fontSize: 12 }}>
                            {ts(i.date)} · {i.officer}
                          </span>
                        </div>
                        <div style={{ color: T.txt, fontSize: 13 }}>
                          {i.notes}
                        </div>
                        {i.promiseAmount && (
                          <div
                            style={{
                              color: T.gold,
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            Promise: {fmt(i.promiseAmount)} by {i.promiseDate} ·{" "}
                            <Badge
                              color={
                                i.promiseStatus === "Pending"
                                  ? T.warn
                                  : i.promiseStatus === "Kept"
                                    ? T.ok
                                    : T.danger
                              }
                            >
                              {i.promiseStatus}
                            </Badge>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              {tab === "docs" && <CustDocsTab customer={customer} />}
            </>
          )}
        </div>
        {SMSDialog}
        {ContactPopup}
      </div>
    </div>,
    document.body
  );
};

// ═══════════════════════════════════════════
//  LOANS PAGE
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  PDF GENERATORS — Loan Agreement + Asset Declaration
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════
//  PDF DOCUMENT GENERATORS
// ═══════════════════════════════════════════

const safeStr = (v) =>
  String(v || "").replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
  );

export const generateLoanAgreementHTML = (loan, customer, officer, format = 'html') => {
  const today = new Date().toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const disbDate = safeStr(
    loan.disbursed || loan.disbursed_at || loan.disbursedAt
      ? new Date(loan.disbursed || loan.disbursed_at || loan.disbursedAt).toLocaleDateString("en-KE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : today,
  );
  const loanEffRate = 0.3 * (1 - Number(loan.interestDiscount || 0) / 100);
  const totalRepay = loan.balance || Math.round((loan.amount || 0) * (1 + loanEffRate));
  const fmtAmt = (v) => "KES " + Number(v || 0).toLocaleString("en-KE");
  const n = safeStr; 

  const repSched = () => {
    const t = totalRepay, rt = loan.repaymentType;
    if (rt === "Daily") return fmtAmt(Math.ceil(t / 30)) + " per day for 30 days";
    if (rt === "Weekly") return fmtAmt(Math.ceil(t / 4)) + " per week";
    if (rt === "Biweekly") return fmtAmt(Math.ceil(t / 2)) + " every 2 weeks";
    if (rt === "Monthly") return fmtAmt(t) + " per month";
    return fmtAmt(t) + " lump sum";
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Loan Agreement - ${n(loan.id)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');
    
    @page { size: A4; margin: 20mm; }
    body { 
      font-family: 'Inter', sans-serif; 
      font-size: 10pt; 
      line-height: 1.5; 
      color: #0F172A; 
      margin: 0; 
      padding: 0;
      background: #fff;
      box-sizing: border-box;
    }
    *, *:before, *:after { box-sizing: inherit; }
    
    .page { width: 100%; margin: 0 auto; }
    
    /* Site-branded Header */
    .brand-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 3px solid #00D4AA;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }
    .logo-area h1 { 
      font-family: 'Outfit', sans-serif;
      font-size: 22pt; 
      font-weight: 800;
      color: #00D4AA;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: -0.5px;
    }
    .logo-area p { margin: 0; font-size: 9pt; color: #64748B; font-weight: 600; }
    .ref-area { text-align: right; font-size: 9pt; color: #64748B; }
    .ref-area b { color: #0F172A; }

    h2 { 
      font-family: 'Outfit', sans-serif;
      font-size: 14pt; 
      text-align: center; 
      font-weight: 700; 
      margin: 0 0 20px; 
      color: #1E293B;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Section Styling */
    .section-title { 
      font-family: 'Outfit', sans-serif;
      font-size: 11pt; 
      font-weight: 700; 
      text-transform: uppercase; 
      color: #00D4AA;
      background: #F8FAFC;
      padding: 6px 12px; 
      margin: 20px 0 10px; 
      border-left: 4px solid #00D4AA;
      display: flex;
      justify-content: space-between;
    }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    td { padding: 6px 10px; border: 1px solid #E2E8F0; font-size: 9.5pt; }
    .label { font-weight: 600; width: 35%; background: #F1F5F9; color: #475569; }
    
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

    /* Summary Box */
    .summary-box {
      background: #F8FAFC;
      border: 1px solid #00D4AA;
      border-radius: 12px;
      padding: 15px;
      display: flex;
      justify-content: space-around;
      text-align: center;
      margin-bottom: 20px;
    }
    .summary-item { display: flex; flexDirection: column; }
    .summary-lbl { font-size: 8pt; text-transform: uppercase; color: #64748B; font-weight: 700; margin-bottom: 2px; }
    .summary-val { font-size: 14pt; font-weight: 800; color: #0F172A; font-family: 'Outfit', sans-serif; }
    .summary-val.accent { color: #00D4AA; }

    .terms { text-align: justify; color: #334155; }
    .clause { margin-bottom: 8px; padding-left: 24px; position: relative; }
    .clause-num { position: absolute; left: 0; font-weight: 800; color: #00D4AA; }
    
    .sig-section { margin-top: 25px; page-break-inside: avoid; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .sig-box { 
      border-top: 2px solid #E2E8F0; 
      padding-top: 10px;
    }
    .sig-title { font-family: 'Outfit', sans-serif; font-size: 9pt; font-weight: 700; text-transform: uppercase; color: #64748B; margin-bottom: 15px; }
    .sig-line { height: 40px; border-bottom: 1px dashed #CBD5E1; margin-bottom: 10px; }
    
    .footer { 
      margin-top: 15px; 
      border-top: 1px solid #E2E8F0; 
      padding-top: 15px; 
      font-size: 8pt; 
      text-align: center; 
      color: #94A3B8; 
      font-weight: 500;
      page-break-inside: avoid;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand-header">
      <div class="logo-area">
        
        <p>Empowering Small Businesses through Micro-Finance</p>
      </div>
      <div class="ref-area" style="text-align: right;">
        <img src="${INTERVENTION_LOGO_BASE64}" alt="Intervention Capital" style="height: 80px; width: 144px; display: block; margin-left: auto; margin-bottom: 8px;" />
        Agreement Ref: <b>${n(loan.id)}</b><br>
        Date: <b>${disbDate}</b>
      </div>
    </div>

    <h2>Loan Facility Agreement</h2>

    <p style="font-size: 9.5pt; color: #475569;">This <b>Loan Facility Agreement</b> is entered into on <b>${disbDate}</b> between <b>Intervention Capital Ltd</b> (the "Lender") and the undersigned Borrower <b>${n(customer.name)}</b>. Both parties agree to the terms stipulated below.</p>

    <div class="section-title">1. Personal & Business Information</div>
    <div class="grid">
      <table>
        <tr><td class="label">Borrower Name</td><td>${n(customer.name)}</td></tr>
        <tr><td class="label">National ID</td><td>${n(customer.idNo)}</td></tr>
        <tr><td class="label">Phone Number</td><td>${n(customer.phone)}</td></tr>
        <tr><td class="label">Residence</td><td>${n(customer.residence || customer.location)}</td></tr>
      </table>
      <table>
        <tr><td class="label">Business Name</td><td>${n(customer.business)}</td></tr>
        <tr><td class="label">Business Type</td><td>${n(customer.businessType)}</td></tr>
        <tr><td class="label">Location</td><td>${n(customer.location)}</td></tr>
        <tr><td class="label">Customer ID</td><td>${n(customer.id)}</td></tr>
      </table>
    </div>

    <div class="section-title">2. Financial Terms Summary</div>
    <div class="summary-box">
      <div class="summary-item">
        <div class="summary-lbl">Principal Amount</div>
        <div class="summary-val">${fmtAmt(loan.amount)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-lbl">Interest (${Number(loan.interestDiscount || 0) > 0 ? (30 * (1 - Number(loan.interestDiscount || 0) / 100)).toFixed(1) + '% Discounted' : '30% Flat'})</div>
        <div class="summary-val">${fmtAmt(Math.round((loan.amount || 0) * (0.3 * (1 - Number(loan.interestDiscount || 0) / 100))))}</div>
      </div>
      <div class="summary-item">
        <div class="summary-lbl">Total Repayable</div>
        <div class="summary-val accent">${fmtAmt(totalRepay)}</div>
      </div>
    </div>

    <table>
      <tr>
        <td class="label">Repayment Frequency</td>
        <td>${n(loan.repaymentType)}</td>
        <td class="label">Installment Amount</td>
        <td><b>${repSched()}</b></td>
      </tr>
      <tr>
        <td class="label">Disbursement Reference</td>
        <td>${n(loan.mpesa)}</td>
        <td class="label">M-Pesa Paybill</td>
        <td><b>4166191</b></td>
      </tr>
    </table>

    <div style="page-break-inside: avoid;">
      <div class="section-title">3. Next of Kin & Referees</div>
      <table>
        <tr style="background:#F8FAFC; font-weight:700; color: #475569;">
          <td style="width: 10%;">#</td><td>Full Name</td><td>Contact Phone</td><td>Relationship</td>
        </tr>
        ${customer.n1n ? `<tr><td>1st</td><td>${n(customer.n1n)}</td><td>${n(customer.n1p)}</td><td>${n(customer.n1r)}</td></tr>` : ''}
        ${customer.n2n ? `<tr><td>2nd</td><td>${n(customer.n2n)}</td><td>${n(customer.n2p)}</td><td>${n(customer.n2r)}</td></tr>` : ''}
        ${customer.n3n ? `<tr><td>3rd</td><td>${n(customer.n3n)}</td><td>${n(customer.n3p)}</td><td>${n(customer.n3r)}</td></tr>` : ''}
      </table>
    </div>

    <div class="section-title">4. Standard Terms & Conditions</div>
    <div class="terms">
      <div class="clause">
        <span class="clause-num">4.1</span>
        <b>Repayment:</b> The Borrower acknowledges receipt of the Principal and agrees to repay the Total Repayable via the Lender's M-Pesa Paybill <b>4166191</b> as per the agreed schedule.
      </div>
    <div class="clause">
      <span class="clause-num">4.2</span>
      <b>Interest & Penalties:</b> A flat ${Number(loan.interestDiscount || 0) > 0 ? (30 * (1 - Number(loan.interestDiscount || 0) / 100)).toFixed(1) : '30'}% interest is included in the Total Repayable. In the event of default, a daily interest of 1.2% shall accrue on the outstanding balance until the loan is settled in full.
    </div>
      <div class="clause">
        <span class="clause-num">4.3</span>
        <b>Default:</b> Failure to meet installments triggers an immediate recall of the full outstanding balance. Upon default, the entire balance becomes due and payable.
      </div>
      <div class="clause">
        <span class="clause-num">4.4</span>
        <b>Recovery & Collateral:</b> The Borrower authorizes the Lender to recover the outstanding debt through the repossession and sale of assets listed in the associated Asset Declaration form, or any other properties owned by the Borrower. The Borrower shall bear all costs of recovery, including auctioneer fees and legal costs.
      </div>
      <div class="clause">
        <span class="clause-num">4.5</span>
        <b>Disclosure & CRB:</b> The Borrower expressly consents to the Lender sharing their credit information (including defaults) with authorized Credit Reference Bureaus (CRB) as per the Laws of Kenya. The Lender is also authorized to contact the listed Next of Kin/Referees for debt collection purposes.
      </div>
      <div class="clause">
        <span class="clause-num">4.6</span>
        <b>Governing Law:</b> This Agreement is governed by the Laws of the Republic of Kenya. Any disputes shall be subject to the exclusive jurisdiction of the Kenyan courts.
      </div>
    </div>

    <div class="sig-section">
      <div class="section-title">5. Acceptance & Execution</div>
      <p style="font-size: 9pt; color: #64748B; margin-bottom: 25px;">I, the Borrower, confirm that I have read and understood the terms of this facility and execute this agreement voluntarily.</p>
      
      <div class="sig-grid">
        <div class="sig-box">
          <div class="sig-title">Borrower Signature</div>
          <div class="sig-line">
            ${loan.borrower_signature ? `<img src="${loan.borrower_signature}" style="max-height: 100%; max-width: 100%; object-fit: contain;" />` : ''}
          </div>
          <div style="font-weight: 700;">${n(customer.name)}</div>
          <div style="font-size: 8pt; color: #64748B;">ID: ${n(customer.idNo)}</div>
        </div>
        <div class="sig-box" style="position: relative;">
          <div class="sig-title">For Intervention Capital Ltd</div>
          ${format !== 'doc' ? `
          <div style="position: absolute; top: -10px; left: 10%; width: 187px; height: 163px; transform: rotate(-8deg); pointer-events: none;">
            <img src="${INTERVENTION_STAMP_BASE64}" alt="Stamp" style="width: 100%; height: 100%; display: block;" />
            <div style="position: absolute; top: 53%; left: 50%; transform: translate(-50%, -50%); color: #DC2626; font-family: Arial, sans-serif; font-weight: bold; font-size: 10pt; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;">
              ${disbDate.toUpperCase()}
            </div>
          </div>
          ` : ''}
          <div class="sig-line">
            ${loan.officer_signature ? `<img src="${loan.officer_signature}" style="max-height: 100%; max-width: 100%; object-fit: contain;" />` : ''}
          </div>
          <div style="font-weight: 700;">${n(loan.officer || officer || "Authorized Signatory")}</div>

        </div>
      </div>
    </div>

    <div class="footer">
      Intervention Capital Ltd &middot; Micro-Finance &middot; Paybill: 4166191<br>
      T: 0727 625 470 &middot; 0714 256 816
    </div>
  </div>
</body>
</html>
  `;
};

export const generateAssetListHTML = (loan, customer, officer, format = 'html') => {
  const today = new Date().toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const fmtAmt = (v) => "KES " + Number(v || 0).toLocaleString("en-KE");
  const n = safeStr;
  const rowsHtml = [
    "<tr><td style='padding:6px 10px;border:1px solid #E2E8F0'>1</td>" +
    "<td style='padding:6px 10px;border:1px solid #E2E8F0'><b>All business assets and home items to be used to recover company money in case of default.</b></td>" +
    "<td style='padding:6px 10px;border:1px solid #E2E8F0'></td>" +
    "<td style='padding:6px 10px;border:1px solid #E2E8F0'></td>" +
    "<td style='padding:6px 10px;border:1px solid #E2E8F0'></td></tr>"
  ].concat(Array.from(
    { length: 4 },
    (_, i) =>
      "<tr><td style='padding:6px 10px;border:1px solid #E2E8F0'>" +
      (i + 2) +
      "</td>" +
      "<td style='padding:6px 10px;border:1px solid #E2E8F0'></td>" +
      "<td style='padding:6px 10px;border:1px solid #E2E8F0'></td>" +
      "<td style='padding:6px 10px;border:1px solid #E2E8F0'></td>" +
      "<td style='padding:6px 10px;border:1px solid #E2E8F0'></td></tr>"
  )).join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Asset Declaration - ${n(loan.id)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');
    @page { size: A4; margin: 5mm; }
    @media print { 
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
      .sig-section { margin-top: 10px !important; }
      h2 { margin: 0 0 10px !important; }
      .brand-header { margin-bottom: 10px !important; padding-bottom: 10px !important; }
      .section-title { margin: 10px 0 5px !important; }
      td, th { padding: 4px 8px !important; font-size: 9pt !important; }
    }
    body { 
      font-family: 'Inter', sans-serif; 
      font-size: 10pt; 
      line-height: 1.5; 
      color: #0F172A; 
      margin: 0; 
      padding: 0;
      background: #fff;
      box-sizing: border-box;
    }
    *, *:before, *:after { box-sizing: inherit; }
    
    .brand-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 3px solid #00D4AA;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }
    .logo-area h1 { 
      font-family: 'Outfit', sans-serif;
      font-size: 22pt; 
      font-weight: 800;
      color: #00D4AA;
      margin: 0;
      text-transform: uppercase;
    }
    .logo-area p { margin: 0; font-size: 9pt; color: #64748B; font-weight: 600; }
    .ref-area { text-align: right; font-size: 9pt; color: #64748B; }

    h2 { 
      font-family: 'Outfit', sans-serif;
      font-size: 14pt; 
      text-align: center; 
      font-weight: 700; 
      margin: 0 0 20px; 
      color: #1E293B;
      text-transform: uppercase;
    }

    .section-title { 
      font-family: 'Outfit', sans-serif;
      font-size: 11pt; 
      font-weight: 700; 
      text-transform: uppercase; 
      color: #00D4AA;
      background: #F8FAFC;
      padding: 6px 12px; 
      margin: 20px 0 10px; 
      border-left: 4px solid #00D4AA;
    }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .row { display: flex; gap: 8px; font-size: 9.5pt; margin-bottom: 4px; }
    .lbl { font-weight: 700; color: #475569; min-width: 120px; }
    
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #F1F5F9; color: #475569; padding: 8px 10px; font-size: 9pt; text-align: left; border: 1px solid #E2E8F0; }
    
    .note-box { background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 10px 15px; min-height: 50px; margin: 10px 0; font-size: 9pt; color: #94A3B8; }
    
    .sig-section { margin-top: 25px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; page-break-inside: avoid; }
    .sig-box { border-top: 2px solid #E2E8F0; padding-top: 10px; }
    .sig-title { font-family: 'Outfit', sans-serif; font-size: 9pt; font-weight: 700; text-transform: uppercase; color: #64748B; margin-bottom: 15px; }
    
    .footer { 
      margin-top: 15px; 
      border-top: 1px solid #E2E8F0; 
      padding-top: 15px; 
      font-size: 8pt; 
      text-align: center; 
      color: #94A3B8; 
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="brand-header">
    <div class="logo-area">
      
      <p>Empowering Small Businesses through Micro-Finance</p>
    </div>
    <div class="ref-area" style="text-align: right;">
      <img src="${INTERVENTION_LOGO_BASE64}" alt="Intervention Capital" style="height: 80px; width: 144px; display: block; margin-left: auto; margin-bottom: 8px;" />
      Loan Ref: <b>${n(loan.id)}</b><br>
      Date: <b>${today}</b>
    </div>
  </div>

  <h2>Asset Declaration & Collateral List</h2>

  <div class="section-title">Borrower Details</div>
  <div class="grid">
    <div>
      <div class="row"><span class="lbl">Full Name:</span><span>${n(customer.name)}</span></div>
      <div class="row"><span class="lbl">National ID:</span><span>${n(customer.idNo)}</span></div>
      <div class="row"><span class="lbl">Phone:</span><span>${n(customer.phone)}</span></div>
    </div>
    <div>
      <div class="row"><span class="lbl">Business:</span><span>${n(customer.business)}</span></div>
      <div class="row"><span class="lbl">Location:</span><span>${n(customer.location)}</span></div>
      <div class="row"><span class="lbl">Loan Amount:</span><span><b>${fmtAmt(loan.amount)}</b></span></div>
    </div>
  </div>

  <div class="section-title">Asset List</div>
  <p style="font-size: 9pt; color: #64748B; margin-bottom: 10px;">Please list all assets including household items, business stock, electronics, or vehicles to be used as collateral.</p>
  
  <table>
    <thead>
      <tr>
        <th style="width:5%">#</th>
        <th style="width:35%">Description</th>
        <th style="width:20%">Location</th>
        <th style="width:20%">Est. Value (KES)</th>
        <th style="width:20%">Ownership Proof</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="section-title">Additional Notes / Assets</div>
  <div class="note-box">Write any additional items or comments here...</div>
  
  <p style="font-size: 10pt; font-weight: 500; margin: 20px 0;">I, <strong>${n(customer.name)}</strong>, acknowledge that I have signed this asset list that will be used by Intervention Capital to recover their monies in the event of default.</p>

  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-title">Borrower Acceptance</div>
      <div style="height: 40px; border-bottom: 1px dashed #CBD5E1; margin-bottom: 10px; display: flex; align-items: flex-end;">
        ${loan.borrower_signature ? `<img src="${loan.borrower_signature}" style="max-height: 60px; max-width: 100%; object-fit: contain; margin-bottom: -10px;" />` : ''}
      </div>
      <div style="font-weight: 700;">${n(customer.name)}</div>
      <div style="font-size: 8pt; color: #64748B;">ID: ${n(customer.idNo)}</div>
    </div>
    <div class="sig-box" style="position: relative;">
      <div class="sig-title">For Intervention Capital Ltd</div>
      ${format !== 'doc' ? `
      <div style="position: absolute; top: -10px; left: 10%; width: 140px; height: 122px; transform: rotate(-8deg); pointer-events: none;">
        <img src="${INTERVENTION_STAMP_BASE64}" alt="Stamp" style="width: 100%; height: 100%; display: block;" />
        <div style="position: absolute; top: 53%; left: 50%; transform: translate(-50%, -50%); color: #DC2626; font-family: Arial, sans-serif; font-weight: bold; font-size: 8pt; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;">
          ${today.toUpperCase()}
        </div>
      </div>
      ` : ''}
      <div style="height: 40px; border-bottom: 1px dashed #CBD5E1; margin-bottom: 10px; display: flex; align-items: flex-end;">
        ${loan.officer_signature ? `<img src="${loan.officer_signature}" style="max-height: 60px; max-width: 100%; object-fit: contain; margin-bottom: -10px;" />` : ''}
      </div>
      <div style="font-weight: 700;">${n(loan.officer || officer || "Authorized Signatory")}</div>
    </div>
  </div>

  <div class="footer">
    Intervention Capital Ltd &middot; Micro-Finance &middot; Paybill: 4166191<br>
    T: 0727 625 470 &middot; 0714 256 816
  </div>
</body>
</html>
  `;
};

export const downloadLoanDoc = (html, filename, format = 'html') => {
  try {
    if (format === 'html' || format === 'pdf') {
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.setTimeout(() => {
          win.document.title = filename.replace('.html', '.pdf');
          win.print();
        }, 500);
      } else {
        alert("Please allow popups to generate the PDF document.");
      }
      try { SFX.download(); } catch (e) {}
      return;
    }

    let blob;
    if (format === 'doc') {
      // Use Word-specific blob type for Word export
      blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    } else {
      blob = new Blob([html], { type: "text/html;charset=utf-8" });
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: filename,
    });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 500);
    try {
      SFX.download();
    } catch (e) {}
  } catch (e) {
    console.error("Download failed", e);
  }
};

// -- Supabase mapping helpers -----------------------------------------
export const toSupabaseLoan = (l) => ({
  id: l.id,
  customer_id: l.customerId,
  customer_name: l.customer,
  amount: l.amount,
  balance: l.balance,
  penalties: l.penalties || 0,
  penalty_accrued: l.penaltyAccrued ?? null,
  status: l.status,
  repayment_type: l.repaymentType,
  officer: l.officer,
  collections_officer: l.collectionsOfficer,
  risk: l.risk,
  disbursed: l.disbursed || null,
  mpesa: l.mpesa || null,
  phone: l.phone || null,
  days_overdue: l.daysOverdue || 0,
  // Frozen discount — set once at loan creation; never changed afterwards.
  interest_discount: Number(l.interestDiscount || 0),
  penalty_waived: Number(l.penaltyWaived || 0),
});
export const fromSupabaseLoan = (r) => ({
  id: r.id,
  customerId: r.customer_id,
  customer: r.customer_name,
  amount: Number(r.amount),
  balance: Number(r.balance),
  penalties: Number(r.penalties || 0),
  // penaltyAccrued: DB-managed compounding penalty (set nightly by apply_daily_penalties cron).
  // null means cron hasn't run yet for this loan — calculateLoanStatus will use fallback math.
  penaltyAccrued: r.penalty_accrued != null ? Number(r.penalty_accrued) : null,
  status: r.status,
  repaymentType: r.repayment_type,
  officer: r.officer,
  collectionsOfficer: r.collections_officer,
  risk: r.risk,
  disbursed: r.disbursed_at || r.disbursed,
  // createdAt is the Supabase auto-column — used as a fallback date when
  // disbursed_at is NULL, so calculateLoanStatus can still age the loan correctly.
  createdAt: r.created_at || null,
  mpesa: r.mpesa,
  phone: r.phone,
  daysOverdue: r.days_overdue || 0,
  settledAt: r.settled_at || null,
  updatedAt: r.updated_at || null,
  payments: [],
  // Frozen discount — read from DB. Defaults to 0 for all pre-existing loans.
  interestDiscount: Number(r.interest_discount || 0),
  penaltyWaived: Number(r.penalty_waived || 0),
});
export const getCustomerActiveLimit = (cu, loansList = []) => {
  if (!cu) return 0;
  if (cu.limitSuspended) return 0;
  
  // Calculate baseline limit (respecting startingLimit fallback of first loan)
  let baseline = cu.creditLimit || 0;
  if (!baseline || baseline === 5000) {
    const customerLoans = loansList.filter(l => l.customerId === cu.id);
    const sorted = [...customerLoans].filter(l => l.disbursed || l.createdAt).sort((a, b) => {
      return new Date(a.disbursed || a.createdAt) - new Date(b.disbursed || b.createdAt);
    });
    baseline = sorted[0]?.amount || 5000;
  }

  const customerLoans = loansList.filter(l => l.customerId === cu.id);
  const overdueLoans = customerLoans.filter(l => (l.status || '').toLowerCase() === 'overdue' && Number(l.balance || 0) > 0);
  if (overdueLoans.length > 0) {
    const maxOverdueDays = Math.max(...overdueLoans.map(l => l.daysOverdue || 0), 0);
    if (maxOverdueDays >= 1 && maxOverdueDays <= 5) return Math.round(baseline * 0.95);
    if (maxOverdueDays >= 6 && maxOverdueDays <= 10) return Math.round(baseline * 0.90);
    if (maxOverdueDays >= 11 && maxOverdueDays <= 15) return Math.round(baseline * 0.85);
    if (maxOverdueDays >= 16 && maxOverdueDays <= 20) return Math.round(baseline * 0.80);
    if (maxOverdueDays >= 21 && maxOverdueDays <= 25) return Math.round(baseline * 0.75);
    if (maxOverdueDays >= 26 && maxOverdueDays <= 30) return Math.round(baseline * 0.70);
    return 0;
  }
  return baseline;
};

export const toSupabaseCustomer = (c) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  alt_phone: c.altPhone || null,
  id_no: c.idNo,
  business_name: c.businessName || c.business || null,
  business: c.businessName || c.business || null,
  business_type: c.businessType || null,
  business_location: c.businessLocation || c.location || null,
  location: c.businessLocation || c.location || null,
  gps_coordinates: c.gps || null,
  residence: c.residence || null,
  officer: c.officerName || c.officer || null,
  assigned_officer: [c.assignedOfficer, c.officerId].find(id => id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) || null,
  loans: c.loans || 0,
  risk: c.risk || "Medium",
  gender: c.gender || null,
  dob: c.dob || null,
  blacklisted: c.blacklisted || false,
  bl_reason: c.blReason || null,
  from_lead: c.fromLead || null,
  n1_name: c.n1n || null,
  n1_phone: c.n1p || null,
  n1_relation: c.n1r || null,
  n2_name: c.n2n || null,
  n2_phone: c.n2p || null,
  n2_relation: c.n2r || null,
  n3_name: c.n3n || null,
  n3_phone: c.n3p || null,
  n3_relation: c.n3r || null,
  documents: c.docs || [],
  joined: c.joined || c.createdAt || null,
  mpesa_registered: c.mpesaRegistered || false,
  account_number: c.idNo || c.idNumber || null,
  id_number: c.idNo || c.idNumber || null,
  uses_id_as_account: true,
  credit_limit: c.creditLimit || 0,
  limit_suspended: c.limitSuspended || false,
  suspended_baseline_limit: c.suspendedBaselineLimit || null,
  last_overdue_clear_date: c.lastOverdueClearDate || null,
  // Optional admin-configurable discount on the 30% standard rate (0 = no discount).
  interest_discount: Number(c.interestDiscount || 0),
});
export const fromSupabaseCustomer = (r) => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  altPhone: r.alt_phone,
  idNo: r.id_no,
  businessName: r.business_name || r.business,
  business: r.business_name || r.business,
  businessType: r.business_type,
  businessLocation: r.business_location || r.location,
  location: r.business_location || r.location,
  gps: r.gps_coordinates,
  residence: r.residence || r.address,
  officer: r.assigned_officer_worker?.name || r.officer,
  assignedOfficer: r.assigned_officer,
  loans: r.loans || 0,
  risk: r.risk || 'Medium',
  gender: r.gender,
  dob: r.dob,
  blacklisted: r.blacklisted || r.status === 'Blacklisted',
  blReason: r.bl_reason,
  fromLead: r.from_lead,
  status: r.status,
  // ── Registration Fee — SINGLE SOURCE OF TRUTH ──
  mpesaRegistered: r.mpesa_registered === true,
  // ── M-PESA C2B ADDITIONS ──
  accountNumber: r.account_number,
  idNumber: r.id_number,
  usesIdAsAccount: r.uses_id_as_account,
  // ── Next of Kin ──
  n1n: r.n1_name,
  n1p: r.n1_phone,
  n1r: r.n1_relation,
  n2n: r.n2_name,
  n2p: r.n2_phone,
  n2r: r.n2_relation,
  n3n: r.n3_name,
  n3p: r.n3_phone,
  n3r: r.n3_relation,
  // Read `joined` first (the canonical manual field), fall back to `created_at`
  // only for records that predate the dedicated column.
  joined: r.joined || r.created_at,
  createdAt: r.created_at,
  docs: r.documents || [],
  creditLimit: Number(r.credit_limit || 0),
  limitSuspended: r.limit_suspended === true,
  suspendedBaselineLimit: r.suspended_baseline_limit ? Number(r.suspended_baseline_limit) : null,
  lastOverdueClearDate: r.last_overdue_clear_date || null,
  // Optional admin-configured interest rate discount (0-100). 0 = standard 30%.
  interestDiscount: Number(r.interest_discount || 0),
  // Tracks the settled_loans count at the time of the last credit limit increase.
  // Used to throttle: next increase only after 3 more settled loans.
  settledLoansAtLimitIncrease: Number(r.settled_loans_at_limit_increase || 0),
  // ── Customer Tag (Red / Amber) ──
  customerTag: r.customer_tag || null,
  customerTagReason: r.customer_tag_reason || null,
});
export const toSupabasePayment = (p) => ({
  id: p.id,
  loan_id: p.loanId || null,
  customer_id: p.customerId || null,
  customer_name: p.customer || null,
  amount: p.amount,
  mpesa: p.mpesa || null,
  date: p.date || null,
  status: p.status || "Unallocated",
  allocated_by: p.allocatedBy || null,
  is_reg_fee: p.isRegFee || false,
  notes: p.notes || p.note || null,
});
export const fromSupabasePayment = (r) => ({
  id: r.id,
  loanId: r.loan_id,
  customerId: r.customer_id,
  customer: r.customer_name,
  amount: Number(r.amount),
  mpesa: r.mpesa_code || r.mpesa,
  date: r.date,
  status: r.status,
  allocatedBy: r.allocated_by,
  isRegFee: r.is_reg_fee || false,
  notes: r.notes || null,
  created_at: r.created_at,
});
export const toSupabaseLead = (l) => ({
  id: l.id,
  name: l.name,
  phone: l.phone,
  alt_phone: l.altPhone || null,
  business: l.business || null,
  location: l.location || null,
  source: l.source || "Referral",
  officer: l.officer || null,
  status: l.status || "New",
  notes: l.notes || null,
  date: l.date || null,
});
export const fromSupabaseLead = (r) => ({ ...r });
export const toSupabaseInteraction = (i) => ({
  id: i.id,
  customer_id: i.customerId || null,
  loan_id: i.loanId || null,
  type: i.type,
  date: i.date || null,
  officer: i.officer || null,
  notes: i.notes,
  promise_amount: i.promiseAmount || null,
});

export const fromSupabaseInteraction = (r) => ({
  id: r.id,
  customerId: r.customer_id,
  loanId: r.loan_id,
  type: r.type,
  date: r.date || r.created_at,
  officer: r.officer,
  notes: r.notes,
  promiseAmount: r.promise_amount,
  promiseDate: r.promise_date,
  promiseStatus: r.promise_status,
  createdAt: r.created_at,
});
export const toSupabaseWorker = (w) => ({
  id: w.id,
  name: w.name,
  email: w.email,
  phone: w.phone,
  role: w.role,
  status: w.status,
  avatar: w.avatar,
  id_no: w.idNo,
  mpesa_number: w.mpesaNumber || null,
  docs: [
    ...(w.docs || []).filter(d => d.type !== 'system_flag' && d.type !== 'staff_no'),
    ...(w.forcePasswordChange ? [{ type: 'system_flag', forcePasswordChange: true }] : []),
    ...(w.staffNo ? [{ type: 'staff_no', value: w.staffNo }] : []),
  ],
  base_salary: w.baseSalary,
  onboarding_target: w.onboardingTarget,
  collection_target: w.collectionTarget,
  auth_user_id: w.auth_user_id,
  helb_amount: w.helbAmount != null ? Number(w.helbAmount) : null,
});
export const fromSupabaseWorker = (r) => ({ 
  ...r, 
  docs: (r.docs || r.documents || []).filter(d => d.type !== 'system_flag' && d.type !== 'staff_no'),
  staffNo: (r.docs || r.documents || []).find(d => d.type === 'staff_no')?.value || '',
  baseSalary: Number(r.base_salary || 20000),
  onboardingTarget: Number(r.onboarding_target || 60),
  collectionTarget: Number(r.collection_target || 500000),
  mpesaNumber: r.mpesa_number || '',
  forcePasswordChange: (r.docs || r.documents || []).some(d => d.type === 'system_flag' && d.forcePasswordChange) || false,
  helbAmount: r.helb_amount != null ? Number(r.helb_amount) : null,
});

export const toSupabaseReminder = (r) => ({
  id: r.id,
  title: r.title,
  note: r.note || null,
  due_date: r.dueDate,
  due_time: r.dueTime,
  priority: r.priority || 'Medium',
  done: r.done || false,
  fired: r.fired || false,
});
export const fromSupabaseReminder = (r) => ({
  id: r.id,
  title: r.title,
  note: r.note,
  dueDate: r.due_date,
  dueTime: r.due_time,
  priority: r.priority,
  done: r.done,
  fired: r.fired,
  createdAt: r.created_at,
});

export const toSupabaseAsset = (a) => ({
  id: a.id,
  loan_id: a.loanId,
  customer_name: a.customer,
  asset_name: a.assetName,
  possession_date: a.possessionDate,
  status: a.status || "Possessed",
  valuation: a.valuation || 0,
  disposal_amount: a.disposalAmount || null,
  disposal_date: a.disposalDate || null,
  officer_name: a.officer || null,
  notes: a.notes || null,
});

export const fromSupabaseAsset = (r) => ({
  id: r.id,
  loanId: r.loan_id,
  customer: r.customer_name,
  assetName: r.asset_name,
  possessionDate: r.possession_date,
  status: r.status,
  valuation: Number(r.valuation || 0),
  disposalAmount: r.disposal_amount ? Number(r.disposal_amount) : null,
  disposalDate: r.disposal_date,
  officer: r.officer_name,
  notes: r.notes,
});

if (typeof window !== "undefined") window._sbErrors = window._sbErrors || [];
const _sbErr = (op, table, msg) => {
  const entry = `[${op}] ${table}: ${msg}`;
  console.error(entry);
  if (typeof window !== "undefined")
    window._sbErrors.push({ ts: new Date().toISOString(), entry });
};
export const sbWrite = (table, row) => {
  return import("@/config/supabaseClient")
    .then(({ supabase, DEMO_MODE }) => {
      if (DEMO_MODE || !supabase) return Promise.resolve({ data: row, error: null });
      return supabase
        .from(table)
        .upsert([row], { onConflict: "id" })
        .then(({ data, error }) => {
          if (error) {
            _sbErr("upsert", table, error.message);
            throw error;
          }
          return { data, error };
        });
    })
    .catch((e) => {
      _sbErr("import", "sbWrite", e.message);
      throw e;
    });
};
export const sbDelete = (table, id) => {
  return import("@/config/supabaseClient")
    .then(({ supabase, DEMO_MODE }) => {
      if (DEMO_MODE || !supabase) return Promise.resolve();
      return supabase
        .from(table)
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            _sbErr("delete", table, error.message);
            throw error;
          }
        });
    })
    .catch((e) => {
      _sbErr("import", "sbDelete", e.message);
      throw e;
    });
};
export const sbInsert = (table, row) => {
  return import("@/config/supabaseClient")
    .then(({ supabase, DEMO_MODE }) => {
      if (DEMO_MODE || !supabase) return Promise.resolve({ data: row, error: null });
      return supabase
        .from(table)
        .insert([row])
        .then(({ data, error }) => {
          if (error) {
            _sbErr("insert", table, error.message);
            throw error;
          }
          return { data, error };
        });
    })
    .catch((e) => {
      _sbErr("import", "sbInsert", e.message);
      throw e;
    });
};

export const sbAuditInsert = async (row) => {
  try {
    const { supabase, DEMO_MODE } = await import("@/config/supabaseClient");
    if (DEMO_MODE || !supabase) return;
    const meta = await buildAuditMeta();
    const mergedRow = { ts: new Date().toISOString(), ...row, ...meta };
    const { error } = await supabase.from("audit_log").insert([mergedRow]);

    if (error) {
       console.error("[Audit] Insert Error:", error.message);
       _sbErr("insert", "audit_log", error.message);
    } else {
       console.log(`[Audit] Logged: ${row.action} for ${row.target_id || 'System'}`);
    }
  } catch (e) {
    console.error("[Audit] Fatal Error:", e.message);
    _sbErr("import", "sbAuditInsert", e.message);
  }
};

// -- Security Configuration ------------------------------------------
export const getSecConfig = () => {
  const defaults = {
    passwordEnabled: true,
    // biometricEnabled: false,
    otpEnabled: false,
    adminEmail: "admin@interventioncapital.co.ke",
    adminPhone: "0711 222 333",
    adminRecoveryPhone: "0711 222 333",
    mpesaInitiator: "DONAPI",
  };
  try {
    if (typeof window === "undefined") return defaults;
    const saved = JSON.parse(localStorage.getItem("_acl_security") || "{}");
    return { ...defaults, ...saved };
  } catch (e) {
    return defaults;
  }
};

export const saveSecConfig = (cfg) => {
  try {
    localStorage.setItem("_acl_security", JSON.stringify(cfg));
  } catch (e) {}
};

// -- Navigation Constants ------------------------------------------
export const ADMIN_NAV = [
  { cat: "General", id: "dashboard", l: "Dashboard", i: LayoutDashboard, c: '#06AED4' },
  { cat: "General", id: "calendar", l: "Calendar", i: Calendar, c: '#FFB020' },
  
  { cat: "CRM", id: "customers", l: "Customers", i: Users, c: '#7C3AED' },
  { cat: "CRM", id: "leads", l: "Leads", i: UserPlus, c: '#F04438' },
  
  { cat: "Financials", id: "loans", l: "Loans", i: CreditCard, c: '#2E90FA' },
  { cat: "Financials", id: "collections", l: "Collections", i: Phone, c: '#F79009' },
  { cat: "Financials", id: "payments", l: "Payments", i: CheckCircle, c: '#12B76A' },
  { cat: "Financials", id: "paymentshub", l: "Payments Hub", i: ShieldCheck, c: '#6699FF' },
  { cat: "Financials", id: "salary_ledger", l: "Salary Ledger", i: Landmark, c: '#00D4AA' },
  
  { cat: "Organization", id: "workers", l: "Team", i: Users, c: '#FB6514' },
  { cat: "Organization", id: "reports", l: "Reports", i: BarChart3, c: '#EE46BC' },
  { cat: "Organization", id: "performance", l: "Performance", i: Activity, c: '#00D4AA' },
  
  { cat: "System", id: "securitysettings", l: "System Settings", i: Settings, c: '#667085' },
  { cat: "System", id: "database", l: "Platform Health", i: Database, c: '#D92D20' },
  { cat: "System", id: "audit", l: "Security Logs", i: FileText, c: '#98A2B3' },
];

export const WORKER_NAV = [
  { id: "overview", l: "Overview", i: LayoutDashboard, c: T.accent },
  { id: "loans", l: "Loans", i: CreditCard, c: T.blue },
  { id: "customers", l: "Users", i: Users, c: T.purple },
  { id: "leads", l: "Leads", i: UserPlus, c: T.accent },
  { id: "documents", l: "Documents", i: FileText, c: T.dim },
];

export const compressImage = (file, maxWidth = 1600, quality = 0.8) => {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return resolve(file); // Only compress images, skip PDFs/etc
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      // Calculate new dimensions while keeping aspect ratio
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const newFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          // Ensure we actually shrunk the file. If compression made it larger somehow, use original.
          resolve(newFile.size < file.size ? newFile : file);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
};

export const dataUrlToBlob = (dataUrl) => {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
};
export const sbUploadDoc = async (customerId, doc) => {
  const { supabase, DEMO_MODE } = await import("@/config/supabaseClient");
  if (DEMO_MODE || !supabase) return;
  try {
    const blob = doc.file ? doc.file : dataUrlToBlob(doc.dataUrl);
    let filename = (doc.key + "_" + (doc.name || "file")).replace(
      /[^\w.-]+/g,
      "_",
    );

    // Auto-append extension if missing
    if (!filename.includes(".")) {
      const mime = blob.type.split("/")[1] || "bin";
      const ext = mime === "jpeg" ? "jpg" : mime;
      filename += "." + ext;
    }

    const path = customerId + "/" + filename;
    const { error } = await supabase.storage
      .from("documents")
      .upload(path, blob, { upsert: true });
    if (error) throw error;
    return path;
  } catch (e) {
    console.error("[sbUploadDoc]", e.message);
    throw e;
  }
};

// ── Export Menu Dropdown ────────────────────────────────────
export const ExportMenu = ({ onExport }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items = [
    { id: "CSV", label: "Spreadsheet (CSV/Excel)", icon: Download, color: T.ok },
    { id: "PDF", label: "Document (PDF)", icon: FileText, color: T.danger },
    { id: "WORD", label: "Word Document (DOCX)", icon: FileText, color: T.blue },
  ];

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <Btn v="secondary" onClick={() => setOpen(!open)} icon={Upload} sm>
        Export
      </Btn>
      {open && (
        <div
          className="pop-in export-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            background: "var(--card)",
            backdropFilter: "blur(30px)",
            WebkitBackdropFilter: "blur(30px)",
            border: `1px solid var(--border)`,
            borderRadius: 16,
            boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            zIndex: 9999,
            minWidth: 220,
            overflow: "hidden",
            padding: "4px"
          }}
        >
          <div
            style={{
              padding: "10px 12px 6px",
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--muted)',
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Select Format
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                onExport(item.id);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                cursor: "pointer",
                transition: "all .2s",
                borderRadius: 12,
                margin: "2px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ display: "flex", alignItems: "center", color: item.color }}>
                <item.icon size={18} strokeWidth={2.5} />
              </span>
              <span style={{ color: "var(--txt)", fontSize: 13, fontWeight: 600 }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DateTrigger = ({ label, val, type, active, T, onClick }) => (
  <div 
    onClick={() => onClick(type)}
    style={{
      display: "flex", flexDirection: "column", cursor: 'pointer',
      padding: "6px 16px", borderRadius: 12,
      background: active === type ? T.aLo : 'transparent',
      transition: 'all .25s ease',
      minWidth: 100
    }}
  >
    <label style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase", marginBottom: 3, letterSpacing: '0.05em' }}>{label}</label>
    <div style={{ fontSize: 13, fontWeight: 700, color: T.txt, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span>{val || '—'}</span> <Calendar size={13} color={T.accent} style={{ opacity: active === type ? 1 : 0.6 }} />
    </div>
  </div>
);

// ── Date Range Picker ─────────────────────────────────────
export const DateRangePicker = ({
  start,
  end,
  onStartChange,
  onEndChange,
  onSearch,
}) => {
  const [active, setActive] = useState(null); // 'start' or 'end'
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return;
    const clickOut = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setActive(null);
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, [active]);

  const handleTriggerClick = (type) => setActive(active === type ? null : type);

  return (
    <div ref={ref} style={{ display: "flex", gap: 10, alignItems: "center", position: 'relative' }}>
      <div
        style={{
          display: "flex", gap: 6, alignItems: "center",
          background: T.card, padding: "4px", borderRadius: 14, border: `1px solid ${T.border}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}
      >
        <DateTrigger label="From" val={start} type="start" active={active} T={T} onClick={handleTriggerClick} />
        <div style={{ width: 1, height: 24, background: T.border }} />
        <DateTrigger label="To" val={end} type="end" active={active} T={T} onClick={handleTriggerClick} />
        
        {active && (
          <div style={{ 
            position: 'absolute', 
            top: 'calc(100% + 4px)', 
            left: 0, 
            zIndex: 20000 
          }}>
             <ModernDatePicker 
               value={active === 'start' ? start : end} 
               onChange={(val) => {
                 if (active === 'start') {
                   onStartChange?.(val);
                   if (end && val > end) onEndChange?.(val);
                 } else {
                   onEndChange?.(val);
                   if (start && val < start) onStartChange?.(val);
                 }
               }} 
               onClose={() => setActive(null)} 
               T={T} 
             />
          </div>
        )}
      </div>

      {onSearch && (
        <Btn onClick={onSearch} v="primary" sm style={{ height: 40, width: 40, borderRadius: 12, padding: 0 }}>
          <SearchIcon size={18} strokeWidth={2.5} />
        </Btn>
      )}
    </div>
  );
};

// ── Single Date Picker ───────────────────────────────────────
export const DatePicker = ({ label, value, onChange }) => {
  const [active, setActive] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return;
    const clickOut = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setActive(false);
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, [active]);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: "flex", gap: 6, alignItems: "center",
          background: T.card, padding: "4px", borderRadius: 14, border: `1px solid ${T.border}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          width: '100%'
        }}
      >
        <DateTrigger 
          label={label} 
          val={value} 
          type="date" 
          active={active ? 'date' : null} 
          T={T} 
          onClick={() => setActive(!active)} 
        />
        
        {active && (
          <div style={{ 
            position: 'absolute', 
            top: 'calc(100% + 4px)', 
            left: 0, 
            zIndex: 20000 
          }}>
             <ModernDatePicker 
               value={value} 
               onChange={(val) => {
                 onChange(val);
                 setActive(false);
               }} 
               onClose={() => setActive(false)} 
               T={T} 
             />
          </div>
        )}
      </div>
    </div>
  );
};

// ── Module Header (Combined Title + Search + Date + Export) ──
export const ModuleHeader = ({
  title,
  sub,
  stats,
  search,
  dateRange,
  exportProps,
  refreshProps,
  pillsProps,
  right,
}) => (
  <div className="fu" style={{ marginBottom: 20, position: "relative", zIndex: 1200 }}>
    <div
      className="mob-stack"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginBottom: 16,
        position: "relative",
        zIndex: 200,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: T.head,
            color: T.txt,
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '-0.02em'
          }}
        >
          {title}
        </div>
        {sub && (
          <div style={{ color: T.muted, fontSize: 13, marginTop: 4, lineHeight: 1.4, maxWidth: '90%' }}>{sub}</div>
        )}
        {stats && (
          <div style={{ color: T.accent, fontSize: 12, fontWeight: 600, marginTop: 8, opacity: 0.8 }}>
            {stats}
          </div>
        )}
      </div>
      <div className="topbar-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {right}
        {refreshProps && <RefreshBtn {...refreshProps} />}
        {exportProps && <ExportMenu {...exportProps} />}
      </div>
    </div>

    <div
      className="mob-stack"
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center",
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        padding: "16px",
        borderRadius: 24,
        border: `1px solid var(--glass-border)`,
        position: "relative",
        zIndex: 100,
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
      }}
    >
      {search && (
        <div style={{ flex: 1, minWidth: 240 }} className="mob-full">
          <Search {...search} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }} className="mob-stack">
        {dateRange && <DateRangePicker {...dateRange} />}
        {pillsProps && (
          <div className="mob-full" style={{ paddingLeft: 4 }}>
            <Pills {...pillsProps} />
          </div>
        )}
      </div>
    </div>
  </div>
);

/**
 * Generates official collection letters (Reminder, Demand, Final Notice)
 * with appropriate tones and customer details.
 */
export const generateCollectionLetterHTML = (type, loan, customer, officer, trueDue) => {
  const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
  const n = (v) => v || "—";
  const fmtAmt = (v) => "KES " + Number(v || 0).toLocaleString("en-KE");

  let title = "";
  let body = "";
  let deadline = "";

  if (type === "Reminder") {
    title = "LOAN REPAYMENT REMINDER";
    body = `<p>We are writing to bring to your attention that your loan account <b>${n(loan.id)}</b> is currently <b>${n(loan.daysOverdue)}</b> days overdue. As of today, the total outstanding amount is <b>${fmtAmt(trueDue)}</b>.</p>
            <p>At Intervention Capital Ltd, we value your business and understand that sometimes temporary challenges arise. We kindly request that you make arrangements to settle this balance as soon as possible to avoid further accrual of interest and potential impact on your credit rating.</p>
            <p>If you have already made this payment, please disregard this notice and provide us with the transaction details for reconciliation.</p>`;
  } else if (type === "Demand Letter") {
    title = "FORMAL DEMAND FOR PAYMENT";
    deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
    body = `<p>Despite our previous communications, our records indicate that your loan <b>${n(loan.id)}</b> remains unpaid. This is a <b>FORMAL DEMAND</b> for the immediate payment of the total outstanding sum of <b>${fmtAmt(trueDue)}</b>.</p>
            <p>Please note that your account is now <b>${n(loan.daysOverdue)}</b> days past due. You are hereby required to settle this amount in full by <b>${deadline}</b>.</p>
            <p>Failure to comply with this demand within the stipulated time will leave us with no choice but to escalate this matter to the next stage of recovery, which may include engaging debt collection agencies and listing your details with the Credit Reference Bureau (CRB).</p>`;
  } else if (type === "Final Notice") {
    title = "FINAL NOTICE BEFORE LEGAL ACTION";
    body = `<p>This is the <b>FINAL NOTICE</b> regarding your overdue loan <b>${n(loan.id)}</b>. Our records show an outstanding balance of <b>${fmtAmt(trueDue)}</b> which has remained unpaid for <b>${n(loan.daysOverdue)}</b> days.</p>
            <p>Take note that unless the full amount is received by close of business tomorrow, we will immediately initiate the following actions without further notice to you:</p>
            <ul>
              <li>Physical recovery of listed assets and collateral.</li>
              <li>Handing over the matter to our legal counsel for court proceedings.</li>
              <li>Permanent blacklisting on all Credit Reference Bureaus.</li>
            </ul>
            <p>This is your last opportunity to settle this matter amicably and avoid the additional costs and public embarrassment associated with legal recovery.</p>`;
  }

  const parts = [
    "<!DOCTYPE html><html><head><meta charset=UTF-8><title>" + title + "</title>",
    "<style>body{font-family:Arial,sans-serif;font-size:11pt;padding:28mm 22mm;color:#111;line-height:1.6}",
    "h1{font-size:16pt;text-align:left;color:#2a3a50;margin-bottom:2px}h2{font-size:12pt;font-weight:bold;margin-bottom:20px;border-bottom:2px solid #2a3a50;padding-bottom:10px}",
    ".letterhead{display:flex;justify-content:space-between;margin-bottom:40px;border-bottom:3px solid #2a3a50;padding-bottom:15px}",
    ".company-info{text-align:right;font-size:9.5pt;color:#555}",
    ".recipient{margin-bottom:30px}.recipient div{margin-bottom:2px}",
    ".subject{font-weight:bold;text-decoration:underline;margin-bottom:20px;text-transform:uppercase;color:#2a3a50}",
    ".closing{margin-top:40px}.sig-box{margin-top:50px;font-weight:bold}",
    "@media print{body{padding:20mm 18mm}}</style></head><body>",
    "<div class=letterhead><div><img src='" + INTERVENTION_LOGO_BASE64 + "' alt='Intervention Capital' style='height: 50px; width: 90px; display: block; margin-bottom: 8px;' /><p style='margin:0;font-size:10pt;color:#2a3a50;font-weight:bold'>Empowering Your Progress</p></div>",
    "<div class=company-info>P.O. Box 12345-00100<br>Nairobi, Kenya<br>Tel: +254 700 000 000<br>Email: info@interventioncapital.co.ke</div></div>",
    "<div style='margin-bottom:20px'>Date: <b>" + today + "</b></div>",
    "<div class=recipient><div>To: <b>" + n(customer.name) + "</b></div>",
    "<div>Phone: " + n(customer.phone) + "</div>",
    "<div>ID No: " + n(customer.idNo) + "</div>",
    "<div>Residence: " + n(customer.residence) + "</div></div>",
    "<div class=subject>REF: " + title + " — LOAN ID: " + n(loan.id) + "</div>",
    "<p>Dear " + n(customer.name) + ",</p>",
    body,
    "<p>Please make your payment via our <b>M-Pesa Paybill: 4166191</b> using your National ID or Loan ID as the account number.</p>",
    "<div class=closing><p>Yours Sincerely,</p><div class=sig-box><div style='border-bottom:1.5px solid #2a3a50;width:200px;margin-bottom:5px'></div>",
    "<div>" + n(officer || "Collections Manager") + "</div><div>Intervention Capital Ltd</div></div></div>",
    "</body></html>",
  ];
  return parts.join("\n");
};

/**
 * Generates an official Employee Payslip
 */
export const generatePayslipHTML = (worker, payment, month) => {
  const today = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
  const fmtKey = (v) => "KES " + Number(v || 0).toLocaleString("en-KE");
  
  return `
    <!DOCTYPE html><html><head><meta charset=UTF-8>
    <style>
      @page { size: A4; margin: 5mm; }
      @media print { 
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px !important; }
        .header { margin-bottom: 10px !important; padding-bottom: 5px !important; }
        .info-grid { margin-bottom: 10px !important; gap: 10px !important; }
        .table { margin-bottom: 10px !important; }
        .table th, .table td { padding: 4px 6px !important; font-size: 10px !important; }
        .total-box { padding: 8px 15px !important; margin-top: 10px !important; }
        .footer { margin-top: 10px !important; padding-top: 5px !important; font-size: 8px !important; }
      }
      body { font-family: 'Inter', sans-serif; padding: 0; color: #1e293b; line-height: 1.5; background: #fff; }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #00D4AA; padding-bottom: 20px; margin-bottom: 30px; }
      .logo { font-size: 24px; font-weight: 900; color: #00D4AA; }
      .title { font-size: 18px; font-weight: 800; text-align: right; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
      .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 800; margin-bottom: 4px; }
      .val { font-size: 14px; font-weight: 700; color: #1e293b; }
      .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      .table th { text-align: left; background: #f8fafc; padding: 12px; font-size: 12px; color: #475569; border-bottom: 1px solid #e2e8f0; }
      .table td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
      .total-box { background: #f8fafc; border-radius: 12px; padding: 20px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
      .net-pay { font-size: 24px; font-weight: 900; color: #00D4AA; }
      .footer { margin-top: 60px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; }
    </style>
    </head><body>
      <div class="header">
        <div>
          <img src="${INTERVENTION_LOGO_BASE64}" alt="Intervention Capital" style="height: 50px; width: 90px; display: block; margin-bottom: 8px;" />
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">Employee Earnings Statement</div>
        </div>
        <div class="title">OFFICIAL PAYSLIP<br><span style="font-size: 14px; color: #64748b;">Period: ${month}</span></div>
      </div>
      
      <div class="info-grid">
        <div>
          <div class="label">Employee Name</div><div class="val">${worker.name}</div>
          <div class="label" style="margin-top: 15px;">Employee ID</div><div class="val">${worker.idNo || worker.id}</div>
          <div class="label" style="margin-top: 15px;">Phone Number</div><div class="val">${worker.phone}</div>
        </div>
        <div>
          <div class="label">Designation</div><div class="val">${worker.role}</div>
          <div class="label" style="margin-top: 15px;">Pay Date</div><div class="val">${today}</div>
          <div class="label" style="margin-top: 15px;">Reference ID</div><div class="val">${payment.mpesa_receipt || payment.id}</div>
        </div>
      </div>

      <table class="table">
        <thead><tr><th>Description</th><th style="text-align: right;">Amount</th></tr></thead>
        <tbody>
          <tr><td>Basic Salary Distribution</td><td style="text-align: right;">${fmtKey(payment.amount)}</td></tr>
          <tr><td>Performance Commission</td><td style="text-align: right;">${fmtKey(0)}</td></tr>
          <tr><td style="color: #64748b;">Statutory Deductions (PAYE/NHIF/NSSF)</td><td style="text-align: right; color: #64748b;">${fmtKey(0)}</td></tr>
        </tbody>
      </table>

      <div class="total-box">
        <div style="font-weight: 800; font-size: 14px;">NET Payout Amount</div>
        <div class="net-pay">${fmtKey(payment.amount)}</div>
      </div>

      <div style="margin-top: 40px; font-size: 12px; line-height: 1.6; position: relative;">
        <p>This is a computer-generated document and does not require a physical signature. The funds have been disbursed to the registered phone number <b>${worker.phone}</b> via M-Pesa B2C.</p>
        <div style="position: absolute; right: 20px; top: -30px; width: 140px; height: 120px; transform: rotate(-8deg); pointer-events: none; opacity: 0.9;">
          <img src="${INTERVENTION_STAMP_BASE64}" alt="Stamp" style="width: 100%; height: 100%; display: block;" />
          <div style="position: absolute; top: 53%; left: 50%; transform: translate(-50%, -50%); color: #DC2626; font-family: Arial, sans-serif; font-weight: bold; font-size: 8pt; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;">
            ${today.toUpperCase()}
          </div>
        </div>
      </div>

      <div class="footer">
        Intervention Capital Ltd • Nairobi, Kenya • For inquiries: info@interventioncapital.co.ke
      </div>
    </body></html>
  `;
};

export const dlBlob = (content, filename, mime) => {
  try {
    const blob = new Blob([content], {type: mime});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  } catch(e) { console.error('Download failed', e); }
};

export const buildReportData = (type, data, filters = {}) => {
  const {loans, customers, payments, workers, auditLog, salaryPayments} = data;
  const lList = loans || [];
  const pList = payments || [];
  const { startDate, endDate } = filters;

  if(type==='loan-portfolio') {
    const hdr = ['Loan ID','Customer','Principal','Base Remaining','Status','Days Overdue','Penalty','Remaining','Total Due','Officer','Disbursed','Repay Type'];
    const rows = lList.map(l=>{const e=calculateLoanStatus(l);return [l.id,l.customer,l.amount,e.baseBalance,l.status,l.daysOverdue,e.penalty,e.totalAmountDue,e.totalPayable,l.officer,l.disbursed||'N/A',l.repaymentType];});
    return {name:'loan-portfolio', title:'Loan Portfolio Report', hdr, rows};
  }
  if(type==='financial') {
    const tb  = lList.reduce((s,l)=>s+l.amount,0);
    const out = lList.filter(l => !calculateLoanStatus(l).isSettled).reduce((s,l)=>s+l.balance,0);
    const col = pList.filter(p=>p.status==='Allocated').reduce((s,p)=>s+p.amount,0);
    const ov  = lList.filter(l => {
      const e = calculateLoanStatus(l);
      return e.overdueDays > 0 && !e.isSettled;
    }).reduce((s,l)=>s+l.balance,0);
    return {name:'financial-summary', title:'Financial Summary Report', hdr:['Metric','KES'],
      rows:[['Total Disbursed',tb],['Total Outstanding',out],['Total Collected',col],['Total Overdue',ov],
            ['Collection Rate %', tb>0?((col/tb)*100).toFixed(2):0]]};
  }
  if(type==='active-loans') {
    const act = lList.filter(l => l.status === 'Active');
    return {name:'active-loans', title:'Active Exposure Report', 
      hdr:['Loan ID','Customer','Principal','Balance','Arrears','Next Repayment','Officer'],
      rows: act.map(l => [l.id, l.customer, l.amount, l.balance, l.daysOverdue || 0, l.nextRepayment || 'N/A', l.officer])};
  }
  if(type==='due-today') {
    const filteredLoans = (startDate && endDate) 
        ? lList.filter(l => l.nextRepayment >= startDate && l.nextRepayment <= endDate)
        : lList.filter(l => l.nextRepayment === now());
    return {name:'due-today', title:'Repayment Schedule Report',
      hdr:['Loan ID','Customer','Phone','Amount Due','Status','Officer', 'Next Repayment'],
      rows: filteredLoans.map(l => [l.id, l.customer, l.phone, l.balance, l.status, l.officer, l.nextRepayment])};
  }
  if(type==='payments-today') {
    const filteredPayments = (startDate && endDate)
        ? pList.filter(p => p.date >= startDate && p.date <= endDate)
        : pList;
    return {name:'payments', title:'Transaction Ledger',
      hdr:['ID','Customer','Loan ID','Amount','M-Pesa Code','Date','Status','Allocated By'],
      rows:filteredPayments.map(p=>[p.id,p.customer,p.loanId||'N/A',p.amount,p.mpesa||'',p.date,p.status,p.allocatedBy||''])};
  }
  if(type==='customers') {
    return {name:'customers', title:'Customer Report',
      hdr:['ID','Name','Phone','Business','Location','Officer','Loans','Risk','Joined','Blacklisted'],
      rows:customers.map(c=>[c.id,c.name,c.phone,c.business||'',c.location||'',c.officer||'',c.loans,c.risk,c.joined,c.blacklisted?'Yes':'No'])};
  }
  if(type==='audit') {
    const aList = auditLog || [];
    const filteredAudit = (startDate && endDate) 
        ? aList.filter(a => a.ts.split('T')[0] >= startDate && a.ts.split('T')[0] <= endDate)
        : aList;
    return {name:'audit-log', title:'Audit Log Report',
      hdr:['Timestamp','User','Action','Target','Details'],
      rows:filteredAudit.map(e=>[e.ts,e.user,e.action,e.target,e.detail||''])};
  }
  if(type==='overdue') {
    const ov = lList.filter(l => {
      const e = calculateLoanStatus(l);
      return e.overdueDays > 0 && !e.isSettled;
    });
    return {name:'overdue-report', title:'Overdue Loans Report',
      hdr:['Loan ID','Customer','Base Remaining','Days Overdue','Penalty','Remaining','Total Due','Risk','Officer'],
      rows:ov.map(l=>{const e=calculateLoanStatus(l);return [l.id,l.customer,e.baseBalance,l.overdueDays,e.penalty,e.totalAmountDue,e.totalPayable,l.risk,l.officer];})};
  }
  if(type==='staff') {
    const wList = workers || [];
    return {name:'staff-performance', title:'Staff Performance Report',
      hdr:['ID','Name','Role','Status','Loans','Book KES','Overdue %'],
      rows:wList.map(w=>{
        const wl=lList.filter(l => l.officer===w.name);
        const bk=wl.reduce((s,l)=>s+l.balance,0);
        const od=wl.filter(l => {
          const e = calculateLoanStatus(l);
          return e.overdueDays > 0 && !e.isSettled;
        }).length;
        return [w.id,w.name,w.role,w.status,wl.length,bk,wl.length?((od/wl.length)*100).toFixed(1):0];
      })};
  }
  if(type==='salary-payouts') {
    const sList = salaryPayments || [];
    const filteredSalaries = (startDate && endDate)
        ? sList.filter(s => s.created_at && s.created_at.split('T')[0] >= startDate && s.created_at.split('T')[0] <= endDate)
        : sList;
    return {name:'salary-payouts', title:'Salary Disbursement Report',
      hdr:['Date','Id','Worker','Amount','Month','Phone','Receipt','Status'],
      rows: filteredSalaries.map(s => {
        const w = (workers || []).find(x => x.id === s.worker_id);
        return [ts(s.created_at), s.id.slice(0,8), w?.name || 'Unknown', s.amount, s.month, s.recipient_phone, s.mpesa_receipt, s.status];
      })};
  }
  return {name:'report', title:'Report', hdr:[], rows:[]};
};

export const dlReportCSV = ({name, hdr, rows}) => {
  dlBlob(toCSV(hdr, rows), `${name}-${now()}.csv`, 'text/csv;charset=utf-8;');
};

export const dlReportPDF = ({title, hdr = [], rows = []}) => {
  if (!hdr || !rows) return;
  const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}h1{font-size:15px;margin:0 0 4px}p{color:#666;font-size:10px;margin:0 0 14px}table{width:100%;border-collapse:collapse}th{background:#1a2740;color:#fff;padding:6px 10px;text-align:left;font-size:10px}td{padding:5px 10px;border-bottom:1px solid #e2e8f0;font-size:10px}tr:nth-child(even)td{background:#f8fafc}@media print{body{padding:8px}}</style>
</head><body>
<img src="${INTERVENTION_LOGO_BASE64}" alt="Intervention Capital" style="height: 40px; width: 72px; display: block; margin-bottom: 10px;" />
<h1>${esc(title)}</h1><p>Generated: ${new Date().toLocaleString('en-KE')} - Intervention Capital Ltd</p>
<table><thead><tr>${hdr.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r=>`<tr>${(Array.isArray(r)?r:[]).map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.setTimeout(() => {
      win.document.title = `${title.replace(/\s+/g,'-')}-${now()}.pdf`;
      win.print();
    }, 200);
  } else {
    alert("Please allow popups to generate the PDF report.");
  }
};

export const dlReportWord = ({title, hdr = [], rows = []}) => {
  if (!hdr || !rows) return;
  const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const headerRow = `<w:tr>${hdr.map(h=>`<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(h)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
  const tableRows = rows.map(r=>`<w:tr>${(Array.isArray(r)?r:[]).map(c=>`<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
<w:body>
<w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${esc(title)}</w:t></w:r></w:p>
<w:p><w:r><w:t>Generated: ${new Date().toLocaleString('en-KE')} - Intervention Capital Ltd</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${headerRow}${tableRows}</w:tbl>
</w:body></w:wordDocument>`;
  dlBlob(xml, `${title.replace(/\s+/g,'-')}-${now()}.doc`, 'application/msword');
};

export const INTERVENTION_LOGO_BASE64 = "data:image/png;base64,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MTLMqqWYiE7Vdp897bmvunf3A04brVv36R5sxidhzLvvvvt6lX7Sqc+5df9Dz+pAYtejT3rGqn2fcPboL69818vH99ziBS+5+vW777t69IlPffGov779I8fvvGTV77fZfp/Rjov2GR204tRf7nfImaP9l5/8tQ6gTjzlmd/eY59j/k/nwL/+9a+7NaGtjjj27H9cdvAp3d/27hTw4cesuWeL+fuN9tjnyEd22Omw0eLdjvj6TTfdudf//Pd/P3v/Q88eHXnsM/vU6L7LT/vuYaue1q2rbTbe37bsiFVPGu23bOVXu/t0IHL6Wee/f8ddDv/djrscPdplr+P+4dBjn33v7gecM/r0p7+yfH3V6Prx786/7MbsXe9bd86e+z/xh4/beulo+8UH/tf8BQeNtt7xCb9fffr57w41/aor3vTs3fc9YfSu967rinQed94VV/SR+LPOf9Vrtl648pHFux356M57rBrtsOuq3zzzOZd218w89NBD3brQ/nsfsOrni3ZZOrrrI5/v12cue/VbnrNg56WjQ498chf9bXnNNdd0BLbpC1581TVb7bh8tP2CfUdHHnXqVz756a8fu8cBZ47OOPPi140V/Wave9N7nrHH0tWja65938Wvv+b687bcbsVo+aF/3gmGbs9mL3K6f4/3VW5627qPnrfzkpNGRx7/tDePP9v8/Be/5owlB54yes3Vb++IsAP2ubd86BOnLd798F9ts/1+o512Wz7aa7/jf7bHstMeWXbY6f/Qfe+Qo866Z98DTx39+Mf/a/vxOtB2T1ix+huHH72mI8K9V59xwTvn73TEaOHOBzy63cJ9R/MXHfDry698e7+VZPUZ5397932f+PuxgOjGfvPDjj7zzm0WHDzada8Vj2y/8yGjJctO/NHbrrttVfesJ/35BRcffNQzRjfcsPaUiLRv/uCHzt5pz2NHr/6rd9wyjui2ePqzLvvkrkuOH/3sZz/rIqHHPvDDH65YevCpo+WHnvrB7nt7Lj3hX49YeU63jvb4Zz3vlXcu3P2Y0do7P31o7H9deeJ5X9h32cmj//3znz+hs/3nvejyCxbs+cSHt9/5yNGCXY/4/QmnXXDHptutHD3vwjd0VaPdYQqbjm1mk1PWXHBpVxm9xY5H/n6bhStGWy84+NGtdjxktPfSE/757dfdfHY3V9/97g/32f/QNT/YcsHRo133Omq02z7H/3z+LisfWnboGb/t0pvHrT7nL7dftGy0cKelj+64eOmjC3Y9/NFXXdlXP++759ITRic+6bldanOzo45/6j/svs/x3XcW/fKXvZDcbvd9jrn/6OPOfnhs88tWHnfGf99qhwNGuy9Z8ciOux47WrjklO+99R3vO/yhh36x6KDD13xuh11WjXba7bBH5u940Giv/U/6p9FodMTLLn/9RdsuWP5/dtx5+WjRrsv/a4fFK0bHnfLcSzt7+NrXvrPTHvuf+IUddjt2tNuSVY9sv3jFaL8Dn/SjT370s6fc993vHrr3/qu+sd3iA0e77H7wIzssPmK07/LTu/2200sOWvPxx2+7cvSXf/WO56zfctLvDeWyDd86w/qHKg3K6GhWQU6ZQlQ9B7e+9eSipaaJIhsFWCZCn2W8KXA/T/rRM7xeSVJkwEZ+y76zPwwf2ekqanKa0RGhz3vLRilfzXwt702GzmOMHOmpKiiPQbJ6CQIc/z9OV+/X/BD9NqkF5aQbZaTJomhI1TI+JWOTT33uywfdcOPa1d1eNBZZjEFiq3s++4XDbll7d1cd+dib7rxzyxtvWbv6S1/65sLxtZt+7Vv3L/3ABz9yxkMPPbRk/Qbx7y+55GWvv+Qll179io6M7vnM5497z3tu6Qpp5nzoQx9ZfsMNtx49Bt0uFbfwE/d+4fiPfexvO9XYba7uCGPr62+849RLXvb6y9/wpvecM06vbNSlUm+9/c4nf/Wr3+4qBbe9446PHX37urtWdu0dbwh+/Afv+ugT77rrE13aZvMP3/PVXX/+8193lTkLv/r1rx+7vuLx6TfvvO/po4d/9rOdIG76ecIRa1tff8MHz3jZq978mqtee91F3/rW/V2ad3Y8XnM+9eUvb//O629Z/fWv378g5u/BB/tU32bf/cE/L3vlFW9/yZVXX//i++//x726+61dv6G+m9NFH/rwPSfefPMd3V60TmTMfutb39/6nTfcsnrdursPxkb4zqm2veHGO069+nXXXfyut9289L77frz59TfctvrDH75n11CIDzzwwJ633LbunPvvf6Br3/bXvefWk7/znQeiX9ws3N1vs+9//8e7vO+v1/752rs/ucfYHjb51rf+Ybf333T76R3Yjb/T2/QPfvzve1/6qje/+KUvf2O312/JvZ/97Kr3v//2I/oS/Vvv2r/bSzlua29Xt3zwI8tvv/2jK8dztckXv/r1o176ymtefcVr3npZjEPXlrvuuuewm266o6tKiYMXuuu3eN9frzvpRRdddflrX//uWHfto9iPffazi25f95GTxuth3Thu/uCDD+118wfuOuOBH/1o+TgV/NgPf/Kze3/gA3f0675dPx5++OE/u/X2O0++9+N/29nKZh/44F1PXLfuI11V7MxHP3rvPu+/ee1x4z2D3T3nffjj96740IfuPW2c7tv2ltt7G1r2mc9/qauU3G/t3fc8c9Otlo9eecU7umrNLb75zR89Pvp/6x13LHrnO29Z/d4b1554y213r77ltrtP+ewXvtY9qyOqjdb+/d9H6mu7q95w/bNf8rI3XvHTB3+65+e+/Hf7v/uGW44Jf/zaN797yIsvu+rlF1585cu/+T9+0KelOwF129q7V3/qb7/SXbfVunUfXXnTB+44YWyvvd+/98ZbV9xxx8eOHPtU16fN33rdzWsuuuT1r/nLv3pnp2C36p4/PlrusW+7/gOnXvLyN732DW9+XydOlkRxV0e6r7j82he9/PI3v2Lt2o90IqE/sH08Rpu+6S03nvryy99+5bVvvfGMsf32WYXO9t72zpvOuvDi11155ev/UIBzxx0f2/lt77yl30bB1CDwOvAqU36K/JojE0We08L2JMX43Jm8gjfybNciQ5ekh5qUppAG2M6MINO7DJDIP0zHVrUfxOkqqJoOx2YkFA9uFmCVA3YaM3OzUhI98WgfVrK47knlUEaVKk6pFj+rED/W+ah2SMLe2M+0pwkxz8Mr8u39Pf++7WOeahFjOV7o5gtp/3DtY0YbjdMdsR616RgccKhz/3vflzhAGDnyuY/+/NHOcftDpTtn/Ld/+7dNo7gj/uucEYdh91HE6H/3KbHmdJExUcW9Hn/8E8/7+LYLDho95byXXP6lr3z7+eeed9k7H7/ditHBR53TFa9s070pQAJmujs15Cc/6bchNCfojE/hSTvDc2NO5o23L/BA6zilpW/f+KQOFkFxDaGr4s015/ERX4zmeYpOfK+v+g3yiWfKaXMNxW0bR9F9ChXKtD/lpKvyxLX9oQLdPXikm8g2D7IeH5HWnNcZdqHvbNyd4jImpGxbd+3n1tsVrycI5X6yOEGHz8IY9eq8symcWJMZHhzizgzNzCWXXX3ZVvOXjQ5e8eR193z2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";

export const INTERVENTION_STAMP_BASE64 = "data:image/png;base64,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";
