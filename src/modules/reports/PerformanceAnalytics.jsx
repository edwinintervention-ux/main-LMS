import React, { useState, useMemo } from 'react';
import { 
  BarChart3, Calendar, TrendingUp, Wallet, CheckCircle, 
  Search as SearchIcon, Download, Activity, ArrowUpRight
} from 'lucide-react';
import { 
  T, Card, KPI, DT, Btn, Badge, ModuleHeader,
  fmt, fmtM, now, calculateLoanStatus, dlCSV, toCSV,
  DatePicker, DateRangePicker, localDateStr
} from '@/lms-common';

const PerformanceAnalytics = ({ loans = [], payments = [], customers = [], showToast = () => {} }) => {
  const [dStart, setDStart] = useState(now().slice(0, 7) + '-01'); // 1st of current month
  const [dEnd, setDEnd] = useState(now());
  const [cEnd, setCEnd] = useState(now());

  const performance = useMemo(() => {
    // 1. Identify the Cohort: Loans disbursed in [dStart, dEnd]
    const cohort = loans.filter(l => {
      // Use disbursed date only — createdAt fallback includes Rejected/Pending apps that never disbursed
      const d = l.disbursed || l.disbursedAt;
      if (!d) return false;
      
      // Exclude pre-disbursement or cancelled statuses
      if (['Rejected', 'Declined', 'Cancelled', 'Approved', 'Application submitted', 'worker-pending'].includes(l.status)) return false;
      
      return d >= dStart && d <= dEnd;
    });

    const totalPrincipal = cohort.reduce((s, l) => s + (l.amount || 0), 0);
    const totalExpected = totalPrincipal * 1.3; // Flat 30% rule

    // 2. Identify Payments for this cohort on or before cEnd
    const cohortLoanIds = new Set(cohort.map(l => l.id));
    const cohortPayments = payments.filter(p => 
      cohortLoanIds.has(p.loanId) && 
      p.status === 'Allocated' &&
      (!cEnd || localDateStr(p.date) <= cEnd)
    );

    const totalCollected = cohortPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const recoveryRate = totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(1) : "0.0";

    // 3. Map cohort for display
    const rows = cohort.map(l => {
      const lPayments = cohortPayments.filter(p => p.loanId === l.id);
      const collected = lPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const expected = (l.amount || 0) * 1.3;
      const rate = expected > 0 ? ((collected / expected) * 100).toFixed(1) : "0.0";
      
      return {
        ...l,
        collected,
        expected,
        rate: rate + '%'
      };
    });

    const avgLoanValue = cohort.length > 0 ? Math.round(totalPrincipal / cohort.length) : 0;
    const uniqueCustomers = new Set(cohort.map(l => l.customerId || l.customer_id || l.customer));
    const uniqueCustomersCount = uniqueCustomers.size;

    return {
      cohort,
      totalPrincipal,
      totalExpected,
      totalCollected,
      recoveryRate,
      avgLoanValue,
      uniqueCustomersCount,
      rows
    };
  }, [loans, payments, dStart, dEnd, cEnd]);

  const handleExport = () => {
    const csvData = performance.rows.map(r => ({
      'Loan ID': r.id,
      'Customer': r.customer,
      'Disbursed Date': r.disbursed || r.createdAt?.split('T')[0],
      'Principal': r.amount,
      'Total Expected': r.expected,
      'Total Collected': r.collected,
      'Recovery %': r.rate,
      'Status': r.status
    }));
    dlCSV(toCSV(csvData), `Performance_Report_${dStart}_to_${dEnd}_as_of_${cEnd}.csv`);
    showToast('Export successful', 'ok');
  };

  return (
    <div className="fu">
      <ModuleHeader 
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ background: `${T.accent}15`, padding: 8, borderRadius: 12 }}><BarChart3 size={24} color={T.accent} /></div> Performance Analytics</div>}
        sub="Measure collection performance for specific disbursement cycles."
      />

      {/* Date Filters */}
      <Card style={{ marginBottom: 24, padding: '24px 28px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 300px' }}>
            <label style={{ fontSize: 11, fontWeight: 800, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'block' }}>Disbursements Period</label>
            <DateRangePicker 
              start={dStart} 
              end={dEnd} 
              onStartChange={setDStart} 
              onEndChange={setDEnd} 
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <DatePicker 
              label="Collections End Date" 
              value={cEnd} 
              onChange={setCEnd} 
            />
          </div>
          <Btn onClick={handleExport} v="secondary" icon={Download} style={{ height: 46 }}>Export Data</Btn>
        </div>
      </Card>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <KPI label="Total Disbursed" value={fmt(performance.totalPrincipal)} icon={Wallet} color={T.accent} desc="Principal Cohort Volume" />
        <KPI label="Average Loan Value" value={fmt(performance.avgLoanValue)} icon={Wallet} color={T.purple} desc="Average Disbursed Amount" />
        <KPI label="Total Expected" value={fmt(performance.totalExpected)} icon={TrendingUp} color={T.blue} desc="Principal + 30% Interest" />
        <KPI label="Total Collected" value={fmt(performance.totalCollected)} icon={CheckCircle} color={T.ok} desc={`Repayments by ${cEnd}`} />
        <KPI label="Recovery Rate" value={`${performance.recoveryRate}%`} icon={Activity} color={Number(performance.recoveryRate) > 90 ? T.ok : Number(performance.recoveryRate) > 70 ? T.warn : T.danger} desc="Of Total Expected Volume" />
      </div>

      {/* Cohort Details */}
      <Card style={{ padding: 0, borderRadius: 24, overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.txt }}>Cohort Breakdown</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>Showing {performance.rows.length} loans across {performance.uniqueCustomersCount} unique active customers disbursed in the selected period</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge color={T.accent} alpha={0.1}>{performance.rows.length} Loans</Badge>
            <Badge color={T.purple} alpha={0.1}>{performance.uniqueCustomersCount} Customers</Badge>
          </div>
        </div>
        <div style={{ padding: '0 12px 12px' }}>
          <DT 
            cols={[
              { k: 'id', l: 'Loan ID', r: v => <span style={{ fontFamily: T.mono, fontSize: 11, opacity: 0.7 }}>{v}</span> },
              { k: 'customer', l: 'Borrower', r: v => <div style={{ fontWeight: 700, fontSize: 14 }}>{v}</div> },
              { k: 'disbursed', l: 'Disbursed', r: (v, r) => <div style={{ fontSize: 12, fontWeight: 600 }}>{v || r.createdAt?.split('T')[0]}</div> },
              { k: 'amount', l: 'Principal', r: v => <div style={{ fontFamily: T.mono, fontWeight: 600 }}>{fmt(v)}</div> },
              { k: 'expected', l: 'Target', r: v => <div style={{ fontFamily: T.mono, fontWeight: 600, color: T.blue }}>{fmt(v)}</div> },
              { k: 'collected', l: 'Collected', r: v => <div style={{ fontFamily: T.mono, fontWeight: 800, color: T.ok }}>{fmt(v)}</div> },
              { k: 'rate', l: 'Recovery %', r: v => <Badge color={parseFloat(v) >= 100 ? T.ok : parseFloat(v) > 50 ? T.accent : T.warn} alpha={0.1} variant="capsule">{v}</Badge> },
              { k: 'status', l: 'Current Status', r: v => <Badge color={T.muted}>{v}</Badge> }
            ]}
            rows={performance.rows}
          />
        </div>
      </Card>
    </div>
  );
};

export default PerformanceAnalytics;
