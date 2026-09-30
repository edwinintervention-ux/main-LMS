import React, { useState, useMemo } from 'react';
import { Card, T, DT, fmt, fmtM, now, Btn, Badge, Alert, getProductBaseRate } from '@/lms-common';
import { Users, PieChart, Activity, TrendingUp, Calendar, Filter } from 'lucide-react';

const StatCard = ({ title, value, sub, icon: Icon, color = T.accent }) => (
  <Card style={{ padding: 20, flex: '1 1 200px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: 12, color: T.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.txt, fontFamily: T.head }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{sub}</div>}
      </div>
      <div style={{ background: `${color}15`, padding: 10, borderRadius: 12, color: color }}>
        <Icon size={20} />
      </div>
    </div>
  </Card>
);

const BarRow = ({ label, count, total, color = T.accent, prefix = '' }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
        <span style={{ color: T.txt }}>{label}</span>
        <span style={{ color: T.txt }}>{prefix}{Number(count).toLocaleString()} ({pct}%)</span>
      </div>
      <div style={{ width: '100%', height: 6, background: T.border, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
};

export default function PortfolioAnalytics({ loans, customers, payments }) {
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'active'

  const {
    genderData,
    ageData,
    retentionData,
    parData,
    monthlyTrends
  } = useMemo(() => {
    // 1. Demographics
    const cTotal = customers.length;
    let male = 0; let female = 0; let other = 0;
    
    let ageBands = { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '55+': 0, 'Unknown': 0 };
    
    const currYear = new Date().getFullYear();

    customers.forEach(c => {
      // Gender
      const g = (c.gender || '').toLowerCase();
      if (g.startsWith('m')) male++;
      else if (g.startsWith('f')) female++;
      else other++;

      // Age
      if (c.dob) {
        const y = new Date(c.dob).getFullYear();
        if (y > 1900 && y <= currYear) {
          const age = currYear - y;
          if (age < 18) ageBands['Unknown']++; // Unlikely, but fallback
          else if (age <= 25) ageBands['18-25']++;
          else if (age <= 35) ageBands['26-35']++;
          else if (age <= 45) ageBands['36-45']++;
          else if (age <= 55) ageBands['46-55']++;
          else ageBands['55+']++;
        } else {
          ageBands['Unknown']++;
        }
      } else {
        ageBands['Unknown']++;
      }
    });

    // 2. Retention (First-time vs Repeat)
    const loansByCustomer = {};
    loans.forEach(l => {
      if (!['Cancelled', 'Reversed', 'Rejected'].includes(l.status)) {
        const cid = l.customerId || l.customer_id;
        loansByCustomer[cid] = (loansByCustomer[cid] || 0) + 1;
      }
    });
    let zeroLoans = 0;
    let oneLoan = 0;
    let repeatLoans = 0;
    
    customers.forEach(c => {
      const count = loansByCustomer[c.id] || 0;
      if (count === 0) zeroLoans++;
      else if (count === 1) oneLoan++;
      else repeatLoans++;
    });

    // 3. PAR & Risk
    const activeLoans = loans.filter(l => l.disbursed && !['Settled', 'Written off', 'Cancelled', 'Reversed'].includes(l.status));
    let onTime = 0; let par1 = 0; let par30 = 0; let par90 = 0;
    
    activeLoans.forEach(l => {
      const d = l.daysOverdue || 0;
      if (d <= 0) onTime++;
      else if (d <= 30) par1++;
      else if (d <= 90) par30++;
      else par90++;
    });

    // 4. Monthly Trends (Disbursements, Cash Collections & Cohort Recovery %)
    const monthly = {}; // { '2026-08': { disb: 0, coll: 0, cohortColl: 0 } }

    // Build loan ID -> disbursement month map for cohort tracking
    const loanDisbMonth = {};
    loans.forEach(l => {
      // Exclude pre-disbursement or cancelled statuses exactly like Cohort Analysis
      if (l.disbursed && !['Rejected', 'Declined', 'Cancelled', 'Reversed', 'Approved', 'Application submitted', 'worker-pending'].includes(l.status)) {
        const m = l.disbursed.substring(0, 7);
        loanDisbMonth[l.id] = m;
        if (!monthly[m]) monthly[m] = { disb: 0, coll: 0, cohortColl: 0, totalDue: 0 };
        const principal = Number(l.amount || 0);
        const rate = getProductBaseRate(l.product) * (1 - (Number(l.interestDiscount) || 0) / 100);
        const regFee = Number(l.regFee || 0);
        monthly[m].disb += principal;
        monthly[m].totalDue += principal * (1 + rate) + regFee; // Must include regFee since customer payments include it
      }
    });

    payments.forEach(p => {
      if (p.status === 'Allocated' && p.date) {
        // Cash flow: bucket by payment date
        const payMonth = p.date.substring(0, 7);
        if (!monthly[payMonth]) monthly[payMonth] = { disb: 0, coll: 0, cohortColl: 0 };
        monthly[payMonth].coll += Number(p.amount || 0);

        // Cohort: bucket by the loan's disbursement month
        const disbM = loanDisbMonth[p.loanId];
        if (disbM && monthly[disbM]) {
          monthly[disbM].cohortColl += Number(p.amount || 0);
        }
      }
    });

    const trendLabels = Object.keys(monthly).sort().slice(-6); // Last 6 active months
    const trends = trendLabels.map(k => ({
      month: k,
      ...monthly[k],
      recoveryPct: monthly[k].totalDue > 0
        ? Math.min(Math.round((monthly[k].cohortColl / monthly[k].totalDue) * 100), 100)
        : null
    }));

    return {
      genderData: { male, female, other, total: cTotal },
      ageData: { bands: ageBands, total: cTotal },
      retentionData: { zeroLoans, oneLoan, repeatLoans, total: cTotal },
      parData: { onTime, par1, par30, par90, total: activeLoans.length },
      monthlyTrends: trends
    };
  }, [loans, customers, payments, filterMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.txt, fontFamily: T.head }}>Portfolio Analytics V1</div>
          <div style={{ fontSize: 14, color: T.dim }}>Ultimate dashboard for NPL, Retention & Demographics</div>
        </div>
      </div>

      {/* Top KPIs */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard title="Total Customers" value={Number(customers.length).toLocaleString()} sub="Registered Accounts" icon={Users} color={T.primary} />
        <StatCard title="Repeat Borrowers" value={`${Math.round((retentionData.repeatLoans / (customers.length||1))*100)}%`} sub={`${Number(retentionData.repeatLoans).toLocaleString()} customers`} icon={Activity} color={T.success} />
        <StatCard title="Portfolio at Risk >30" value={`${Math.round(((parData.par30 + parData.par90) / (parData.total||1))*100)}%`} sub={`${Number(parData.par30 + parData.par90).toLocaleString()} active loans`} icon={TrendingUp} color={T.warn} />
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        
        {/* Column 1: Demographics */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, color: T.txt, marginBottom: 20, display: 'flex', gap: 8 }}><PieChart size={18}/> Demographics (Gender)</div>
            <BarRow label="Male" count={genderData.male} total={genderData.total} color={T.blue} />
            <BarRow label="Female" count={genderData.female} total={genderData.total} color={T.pink} />
            {(genderData.other > 0 || genderData.unknown > 0) && <BarRow label="Other / Unspecified" count={genderData.other} total={genderData.total} color={T.border} />}
          </Card>

          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, color: T.txt, marginBottom: 20, display: 'flex', gap: 8 }}><Users size={18}/> Demographics (Age Bands)</div>
            <BarRow label="18-25 Years" count={ageData.bands['18-25']} total={ageData.total} color={T.cyan} />
            <BarRow label="26-35 Years" count={ageData.bands['26-35']} total={ageData.total} color={T.primary} />
            <BarRow label="36-45 Years" count={ageData.bands['36-45']} total={ageData.total} color={T.accent} />
            <BarRow label="46-55 Years" count={ageData.bands['46-55']} total={ageData.total} color={T.warn} />
            <BarRow label="55+ Years" count={ageData.bands['55+']} total={ageData.total} color={T.muted} />
          </Card>
        </div>

        {/* Column 2: Retention & Risk */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, color: T.txt, marginBottom: 20, display: 'flex', gap: 8 }}><Activity size={18}/> Customer Retention</div>
            <BarRow label="Repeat Borrowers (>1 loan)" count={retentionData.repeatLoans} total={retentionData.total} color={T.success} />
            <BarRow label="First-time Borrowers (1 loan)" count={retentionData.oneLoan} total={retentionData.total} color={T.primary} />
            <BarRow label="Dormant / No Loans Yet" count={retentionData.zeroLoans} total={retentionData.total} color={T.muted} />
          </Card>

          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, color: T.txt, marginBottom: 20, display: 'flex', gap: 8 }}><Alert size={18} color={T.danger}/> Portfolio Health (Active Loans)</div>
            <BarRow label="Healthy (On Time)" count={parData.onTime} total={parData.total} color={T.success} />
            <BarRow label="PAR 1 - 30 (Slightly Late)" count={parData.par1} total={parData.total} color={T.warn} />
            <BarRow label="PAR 31 - 90 (NPL Risk)" count={parData.par30} total={parData.total} color={T.danger} />
            <BarRow label="PAR > 90 (Severe Default)" count={parData.par90} total={parData.total} color="#aa0000" />
          </Card>
        </div>
      </div>

      {/* Monthly Trends - SVG Bar Chart */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 600, color: T.txt, marginBottom: 4, display: 'flex', gap: 8 }}><Calendar size={18}/> 6-Month Trend (Disbursements vs Collections)</div>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>Monthly loan disbursements vs cash collected. <b style={{ color: T.txt }}>% Repaid</b> = cohort recovery — how much of that month's total loans has been repaid to date.</div>
        
        {monthlyTrends.length === 0 ? (
          <div style={{ color: T.dim, fontSize: 13 }}>No recent transaction data found.</div>
        ) : (() => {
          const svgH = 180;
          const svgPadT = 10;
          const chartH = svgH - svgPadT;
          const n = monthlyTrends.length;
          const maxVal = Math.max(...monthlyTrends.map(m => Math.max(m.disb, m.coll)), 1);
          const groupW = 100 / n;
          const barW = groupW * 0.28;
          const gap = groupW * 0.04;
          const shortFmt = (v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v/1000)}K` : String(v);

          return (
            <div>
              <div style={{ display: 'flex', gap: 4 }}>
                {/* Y-axis */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: svgPadT, paddingBottom: 2, minWidth: 36 }}>
                  {[1, 0.75, 0.5, 0.25, 0].map(f => (
                    <div key={f} style={{ fontSize: 9, color: T.dim, textAlign: 'right', lineHeight: 1 }}>
                      {shortFmt(Math.round(maxVal * f))}
                    </div>
                  ))}
                </div>

                {/* Chart area */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <svg width="100%" height={svgH} viewBox={`0 0 100 ${svgH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                    {[0.25, 0.5, 0.75, 1].map(f => {
                      const y = svgPadT + chartH * (1 - f);
                      return <line key={f} x1="0" y1={y} x2="100" y2={y} style={{ stroke: T.border }} strokeWidth="0.3" strokeDasharray="1,1" />;
                    })}
                    {monthlyTrends.map((m, i) => {
                      const cx = i * groupW + groupW / 2;
                      const disbH = (m.disb / maxVal) * chartH;
                      const collH = (m.coll / maxVal) * chartH;
                      const disbX = cx - barW - gap / 2;
                      const collX = cx + gap / 2;
                      const baseY = svgPadT + chartH;
                      return (
                        <g key={i}>
                          <rect x={disbX} y={baseY - disbH} width={barW} height={Math.max(disbH, 0.5)} style={{ fill: T.accent }} rx="0.5">
                            <title>Disbursed: {fmt(m.disb)}</title>
                          </rect>
                          <rect x={collX} y={baseY - collH} width={barW} height={Math.max(collH, 0.5)} style={{ fill: T.gold }} rx="0.5">
                            <title>Collected: {fmt(m.coll)}</title>
                          </rect>
                        </g>
                      );
                    })}
                    <line x1="0" y1={svgPadT + chartH} x2="100" y2={svgPadT + chartH} style={{ stroke: T.border }} strokeWidth="0.4" />
                  </svg>

                  {/* KES value labels above each bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: svgH, pointerEvents: 'none', display: 'flex' }}>
                    {monthlyTrends.map((m, i) => {
                      const disbPct = m.disb / maxVal;
                      const collPct = m.coll / maxVal;
                      return (
                        <div key={i} style={{ flex: 1, position: 'relative' }}>
                          <div style={{ position: 'absolute', bottom: `${disbPct * 100}%`, left: '5%', width: '42%', textAlign: 'center', fontSize: 8, fontWeight: 700, color: T.accent, whiteSpace: 'nowrap', transform: 'translateY(-2px)' }}>
                            {shortFmt(m.disb)}
                          </div>
                          <div style={{ position: 'absolute', bottom: `${collPct * 100}%`, left: '52%', width: '43%', textAlign: 'center', fontSize: 8, fontWeight: 700, color: T.gold, whiteSpace: 'nowrap', transform: 'translateY(-2px)' }}>
                            {shortFmt(m.coll)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Month labels + % repaid */}
              <div style={{ display: 'flex', marginTop: 6, paddingLeft: 40 }}>
                {monthlyTrends.map((m, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: T.dim, fontWeight: 500 }}>{m.month}</div>
                    {m.recoveryPct !== null && (
                      <div style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: m.recoveryPct >= 80 ? T.ok : m.recoveryPct >= 50 ? T.gold : T.danger,
                        marginTop: 2
                      }}>{m.recoveryPct}% repaid</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.dim }}>
            <div style={{ width: 12, height: 12, background: T.accent, borderRadius: 2 }}/>
            <span><b style={{ color: T.txt }}>Disbursements</b> — total loaned out that month</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.dim }}>
            <div style={{ width: 12, height: 12, background: T.gold, borderRadius: 2 }}/>
            <span><b style={{ color: T.txt }}>Collections</b> — total cash received that month</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.dim }}>
            <div style={{ width: 28, height: 12, background: `${T.ok}30`, borderRadius: 2, border: `1px solid ${T.ok}` }}/>
            <span><b style={{ color: T.txt }}>% Repaid</b> — cohort recovery of that month's loans</span>
          </div>
        </div>
      </Card>
      
    </div>
  );
}
