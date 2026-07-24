import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, Percent, Gavel, X, Delete, Divide, Minus, Plus, Equal, Hash, RefreshCcw, Info } from 'lucide-react';
import { T, Card, Btn, FI, fmt, Dialog } from '@/lms-common';

export default function MultiCalculator({ onClose }) {
  const [activeTab, setActiveTab] = useState('loan'); // 'arithmetic' or 'loan'

  return (
    <Dialog 
      title="" 
      onClose={onClose} 
      width={400} 
      noPadding
      style={{ overflow: 'hidden', borderRadius: 28 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: 580 }}>
        {/* Header Toggle */}
        <div style={{ 
          display: 'flex', 
          background: T.surface, 
          padding: 6, 
          margin: 16, 
          borderRadius: 16, 
          border: `1px solid ${T.border}` 
        }}>
          <button 
            onClick={() => setActiveTab('loan')}
            style={{ 
              flex: 1, 
              padding: '10px 0', 
              borderRadius: 12, 
              border: 'none', 
              background: activeTab === 'loan' ? T.card : 'none',
              color: activeTab === 'loan' ? T.accent : T.dim,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: activeTab === 'loan' ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Percent size={14} /> Loan Math
          </button>
          <button 
            onClick={() => setActiveTab('scientific')}
            style={{ 
              flex: 1, 
              padding: '10px 0', 
              borderRadius: 12, 
              border: 'none', 
              background: activeTab === 'scientific' ? T.card : 'none',
              color: activeTab === 'scientific' ? T.accent : T.dim,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: activeTab === 'scientific' ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Calculator size={14} /> Scientific
          </button>
        </div>

        <div style={{ flex: 1, padding: '0 20px 20px', overflowY: 'auto' }}>
          {activeTab === 'loan' ? <LoanCalculatorView /> : <ScientificCalculatorView />}
        </div>
      </div>
    </Dialog>
  );
}

function LoanCalculatorView() {
  const [amt, setAmt] = useState(10000);
  const [balance, setBalance] = useState(13000);
  const [odDays, setOdDays] = useState(0);

  const interest = Math.round(amt * 0.3);
  const baseTotal = amt + interest;
  const dailyRate = 0.012;
  const cappedOd = Math.min(Number(odDays), 60);
  
  // Penalty is now charged on the ORIGINAL PRINCIPAL AMOUNT to match engine logic
  const penalty = Math.round(Number(amt) * dailyRate * cappedOd);
  
  // Total due for inquiry = Outstanding Base Balance + Penalty
  const totalDue = Number(balance) + penalty;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FI 
          label="Principal Amount (KES)" 
          type="number" 
          value={amt} 
          onChange={v => { setAmt(Number(v)); setBalance(Math.round(Number(v) * 1.3)); }} 
          placeholder="5,000"
          sub="Original disbursed amount — penalty is charged on this"
        />
        <FI 
          label="Outstanding Base Balance (KES)" 
          type="number" 
          value={balance} 
          onChange={v => setBalance(Number(v))} 
          placeholder="10,000"
          sub="Amount of base payable still owed (excluding penalty)"
        />
        <FI 
          label="Days Overdue" 
          type="number" 
          value={odDays} 
          onChange={v => setOdDays(Number(v))} 
          placeholder="0"
          sub="Max penalty caps at 60 days"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <ResultRow label="Principal" value={amt} />
        <ResultRow label="Interest (30%)" value={interest} color={T.accent} />
        <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
        <ResultRow label="Total Base Payable" value={baseTotal} bold />
        <ResultRow 
          label={`Penalty on principal (${odDays}d @ 1.2%/day)`} 
          value={penalty} 
          color={penalty > 0 ? T.danger : T.muted} 
        />
        
        <div style={{ marginTop: 15, padding: 20, background: `linear-gradient(135deg, ${T.surface}, ${T.card})`, borderRadius: 20, border: `1px solid ${T.accent}30`, boxShadow: `0 8px 24px ${T.accent}10` }}>
          <div style={{ color: T.dim, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>TOTAL DUE FOR INQUIRY</div>
          <div style={{ color: T.txt, fontSize: 32, fontWeight: 900, fontFamily: T.head }}>{fmt(totalDue)}</div>
          {odDays >= 60 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.danger, fontSize: 11, fontWeight: 700, marginTop: 8 }}>
              <Gavel size={12} /> Account is FROZEN (Max Penalty)
            </div>
          )}
          {/* Partial payment options */}
          <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
            <div style={{ color: T.dim, fontSize: 12, marginBottom: 4 }}>Partial Payment Options</div>
            <ResultRow label="Daily" value={Math.round(totalDue / 30)} />
            <ResultRow label="Weekly" value={Math.round(totalDue / 4)} />
            <ResultRow label="Bi-Weekly" value={Math.round(totalDue / 2)} />
          </div>
        </div>
      </div>

      <div style={{ 
        background: T.blue + '10', 
        padding: 14, 
        borderRadius: 16, 
        border: `1px solid ${T.blue}20`,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start'
      }}>
        <Info size={16} color={T.blue} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.5 }}>
          <b>Note:</b> Standard flat interest is 30%. Late penalties of 1.2% per day are charged on the <b>original principal amount</b>.
        </div>
      </div>
    </div>
  );
}

function ResultRow({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: T.dim, fontSize: 13, fontWeight: 500 }}>{label}</span>
      <span style={{ 
        color: color || T.txt, 
        fontSize: 14, 
        fontWeight: bold ? 900 : 700, 
        fontFamily: T.mono 
      }}>
        {fmt(value)}
      </span>
    </div>
  );
}

function ScientificCalculatorView() {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [isDone, setIsDone] = useState(false);

  const handleChar = (char) => {
    if (isDone) {
      if (['+', '-', '*', '/', '^'].includes(char)) {
        setEquation(display + char);
        setIsDone(false);
      } else {
        setDisplay(char);
        setEquation('');
        setIsDone(false);
      }
      return;
    }

    if (display === '0' && !['+', '-', '*', '/', '.', '^'].includes(char)) {
      setDisplay(char);
    } else {
      setDisplay(prev => prev + char);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
    setIsDone(false);
  };

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const calc = () => {
    try {
      let expr = display
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/√\(/g, 'Math.sqrt(')
        .replace(/π/g, 'Math.PI')
        .replace(/e/g, 'Math.E')
        .replace(/\^/g, '**');

      // eslint-disable-next-line no-eval
      let res = eval(expr);
      
      if (Math.abs(res) < 1e-10) res = 0;

      setEquation(display + ' =');
      setDisplay(String(Number(res.toFixed(10))));
      setIsDone(true);
    } catch (e) {
      setDisplay('Error');
    }
  };

  const buttons = [
    { l: 'sin', c: T.dim, v: 'sin(' }, { l: 'cos', c: T.dim, v: 'cos(' }, { l: 'tan', c: T.dim, v: 'tan(' }, { l: 'C', c: T.danger, fn: handleClear }, { l: '⌫', c: T.dim, fn: handleBackspace },
    { l: 'ln', c: T.dim, v: 'ln(' }, { l: 'log', c: T.dim, v: 'log(' }, { l: '√', c: T.dim, v: '√(' }, { l: '(', c: T.dim, v: '(' }, { l: ')', c: T.dim, v: ')' },
    { l: 'π', c: T.dim, v: 'π' }, { l: '7', c: T.txt, v: '7' }, { l: '8', c: T.txt, v: '8' }, { l: '9', c: T.txt, v: '9' }, { l: '÷', c: T.accent, v: '/' },
    { l: 'e', c: T.dim, v: 'e' }, { l: '4', c: T.txt, v: '4' }, { l: '5', c: T.txt, v: '5' }, { l: '6', c: T.txt, v: '6' }, { l: '×', c: T.accent, v: '*' },
    { l: '^', c: T.dim, v: '^' }, { l: '1', c: T.txt, v: '1' }, { l: '2', c: T.txt, v: '2' }, { l: '3', c: T.txt, v: '3' }, { l: '-', c: T.accent, v: '-' },
    { l: ',', c: T.txt, v: ',' }, { l: '0', c: T.txt, v: '0' }, { l: '.', c: T.txt, v: '.' }, { l: '=', c: '#fff', bg: T.accent, fn: calc }, { l: '+', c: T.accent, v: '+' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @keyframes calc-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
      <div style={{ 
        background: T.surface, 
        padding: '24px 20px', 
        borderRadius: 24, 
        textAlign: 'right',
        border: `1px solid ${T.border}`,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ 
          position: 'absolute', top: 8, right: 20, 
          fontSize: 12, fontWeight: 700, color: T.muted,
          fontFamily: T.mono, minHeight: 18
        }}>
          {equation}
        </div>
        <div style={{ 
          fontSize: 32, fontWeight: 900, color: T.txt,
          fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis',
          animation: (display === '0' && !equation) ? 'calc-blink 1.2s step-end infinite' : 'none'
        }}>
          {display}
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(5, 1fr)', 
        gridAutoRows: 48,
        gap: 8 
      }}>
        {buttons.map((b, i) => (
          <button
            key={i}
            onClick={() => b.fn ? b.fn() : handleChar(b.v)}
            style={{
              background: b.bg || T.card,
              color: b.c,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              boxShadow: b.bg ? `0 8px 16px ${b.bg}30` : 'none'
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = T.accent; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = T.border; }}
          >
            {b.l}
          </button>
        ))}
      </div>
    </div>
  );
}
