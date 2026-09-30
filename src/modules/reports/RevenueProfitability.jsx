import React, { useState, useMemo } from 'react';
import { Card, T, fmt, ts, Btn } from '@/lms-common';
import { deriveDashboardMetrics } from '@/lms-common';

export default function RevenueProfitability({ loans, payments, customers }) {
  const getPreset = (preset) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const toLocalDate = (d) => {
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };
    if (preset === 'month') {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return { startDate: toLocalDate(first), endDate: toLocalDate(last) };
    }
    if (preset === 'lastmonth') {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { startDate: toLocalDate(first), endDate: toLocalDate(last) };
    }
    if (preset === 'year') {
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    }
    return { startDate: null, endDate: null };
  };

  const [profitPreset, setProfitPreset] = useState('month');
  const [profitDates, setProfitDates] = useState(() => getPreset('month'));
  
  const applyPreset = (preset) => { 
    setProfitPreset(preset); 
    if (preset !== 'custom') setProfitDates(getPreset(preset)); 
  };

  const profitDerived = useMemo(() =>
    deriveDashboardMetrics(loans, payments, customers, profitDates),
  [loans, payments, customers, profitDates]);

  const { projectedProfit, realizedCashProfit, totalDisb: profitTotalDisb } = profitDerived;

  // Income-side metrics
  const cohortTotalCollected = (realizedCashProfit || 0) + (profitTotalDisb || 0);
  const cohortExpectedTotal = (profitTotalDisb || 0) + (projectedProfit || 0);
  const cohortRatio = cohortExpectedTotal > 0 ? Math.min(1, Math.max(0, cohortTotalCollected / cohortExpectedTotal)) : 0;
  
  const incomeCollected  = (projectedProfit || 0) * cohortRatio;
  const unrealizedIncome = Math.max(0, (projectedProfit || 0) - incomeCollected);

  const portfolioYield = useMemo(() => {
    if (!profitTotalDisb || profitTotalDisb <= 0) return null;
    const projMonthly = ((projectedProfit || 0) / profitTotalDisb) * 100;
    const realMonthly = (incomeCollected / profitTotalDisb) * 100;
    return {
      projectedMonthly: projMonthly.toFixed(1),
      projectedRaw:     projMonthly,
      realizedMonthly:  realMonthly.toFixed(1),
      realizedRaw:      realMonthly,
    };
  }, [projectedProfit, incomeCollected, profitTotalDisb]);

  const hasYield = portfolioYield !== null;
  const yieldColor = hasYield ? (portfolioYield.realizedRaw >= portfolioYield.projectedRaw * 0.8 ? T.ok : T.warn) : T.muted;
  const netCash = realizedCashProfit;
  const netIsNeg = netCash < 0;

  const cardBorder = (color) => ({
    border: `1px solid ${color}40`,
    background: `${color}06`,
  });

  const cards = [
    {
      label: 'Income Collected',
      value: fmt(incomeCollected),
      valueColor: incomeCollected > 0 ? T.ok : T.muted,
      sub: 'Actual interest, fees & penalties received in this period',
      statusColor: incomeCollected > 0 ? T.ok : T.muted,
      extra: null,
    },
    {
      label: 'Unrealized Income',
      value: fmt(unrealizedIncome),
      valueColor: T.txt,
      sub: `Projected income not yet collected · ${fmt(projectedProfit)} projected − ${fmt(incomeCollected)} collected`,
      statusColor: unrealizedIncome > (projectedProfit * 0.6) ? T.warn : T.border,
      extra: null,
    },
    {
      label: 'Net Cash Flow',
      value: fmt(netCash),
      valueColor: netIsNeg ? T.muted : T.ok,
      sub: 'Total collections minus total disbursements in this period',
      statusColor: netIsNeg ? T.accent : T.ok,
      extra: netIsNeg ? (
        <div style={{ marginTop: 8, fontSize: 10, padding: '3px 8px', borderRadius: 6, background: `${T.accent}12`, border: `1px solid ${T.accent}25`, color: T.accent, fontWeight: 700, display: 'inline-block' }}>
          Active growth phase
        </div>
      ) : null,
    },
    {
      label: 'Portfolio Yield',
      value: hasYield ? `${portfolioYield.realizedMonthly}%` : '—',
      valueColor: yieldColor,
      sub: 'Income collected ÷ capital deployed · per month',
      statusColor: yieldColor,
      extra: hasYield ? (
        <div style={{ marginTop: 8, fontSize: 10, color: T.muted }}>
          Projected: <span style={{ color: T.txt, fontWeight: 800 }}>{portfolioYield.projectedMonthly}%</span> / month
          &nbsp;·&nbsp; on <span style={{ color: T.txt, fontWeight: 800 }}>{fmt(profitTotalDisb)}</span> deployed
        </div>
      ) : null,
    },
  ];

  return (
    <div style={{ padding: '0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: T.txt }}>Revenue & Profitability</div>
        
        <div style={{ display: 'flex', gap: 6, background: T.card2, padding: 4, borderRadius: 12, border: `1px solid ${T.border}` }}>
          {[
            { id: 'month', label: 'This Month' },
            { id: 'lastmonth', label: 'Last Month' },
            { id: 'year', label: 'This Year' },
            { id: 'custom', label: 'Custom' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: profitPreset === p.id ? T.bg : 'transparent',
                color: profitPreset === p.id ? T.txt : T.dim,
                fontWeight: profitPreset === p.id ? 800 : 600,
                fontSize: 12,
                cursor: 'pointer',
                border: `1px solid ${profitPreset === p.id ? T.border : 'transparent'}`,
                boxShadow: profitPreset === p.id ? `0 2px 8px rgba(0,0,0,0.4)` : 'none'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      
      {profitPreset === 'custom' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase' }}>Start Date</label>
            <input type='date' value={profitDates.startDate || ''} onChange={e=>setProfitDates(p=>({...p, startDate: e.target.value}))} onClick={e => e.target.showPicker && e.target.showPicker()}
                style={{ cursor: 'pointer', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', color: T.txt, fontSize: 12, fontWeight: 600, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase' }}>End Date</label>
            <input type='date' value={profitDates.endDate || ''} onChange={e=>setProfitDates(p=>({...p, endDate: e.target.value}))} onClick={e => e.target.showPicker && e.target.showPicker()}
                style={{ cursor: 'pointer', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', color: T.txt, fontSize: 12, fontWeight: 600, outline: 'none' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 14, padding: '15px 18px', ...cardBorder(c.statusColor) }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 950, color: c.valueColor, fontFamily: T.head, letterSpacing: '-0.02em', lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>{c.sub}</div>
            {c.extra}
          </div>
        ))}
      </div>
    </div>
  );
}
