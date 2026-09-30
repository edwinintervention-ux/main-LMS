import React, { useMemo } from 'react';
import { Card, T, DT, fmt, fmtM, now, ts, Btn, normProduct, getProductBaseRate, getProductDays, calculateLoanStatus } from '@/lms-common';
import { Download, AlertOctagon, AlertTriangle } from 'lucide-react';
import { exportPARReportPDF } from '@/utils/reportExport';

export default function PARReport({ loans, customers, payments }) {

  const parData = useMemo(() => {
    const activeLoans = loans.filter(l => l.disbursed && !['Settled', 'Written off', 'Cancelled', 'Reversed'].includes(l.status));
    
    let totalPortfolioPrincipal = 0;
    
    const buckets = {
      current: { label: 'Current (0 days)', principal: 0, count: 0 },
      par1_30: { label: '1 - 30 days', principal: 0, count: 0 },
      par31_60: { label: '31 - 60 days', principal: 0, count: 0 },
      par61_90: { label: '61 - 90 days', principal: 0, count: 0 },
      par91_120: { label: '91 - 120 days', principal: 0, count: 0 },
      par120plus: { label: '120+ days', principal: 0, count: 0 },
    };

    const overdueLoans = [];

    activeLoans.forEach(l => {
      const loanPayments = payments.filter(p => p.loanId === l.id && p.status === 'Allocated');
      const paid = loanPayments.reduce((s, p) => s + p.amount, 0);
      const status = calculateLoanStatus(l, null, paid);
      
      const amount = l.amount || 0;
      const effectiveRate = getProductBaseRate(l.product) * (1 - (Number(l.interestDiscount) || 0) / 100);
      const expectedInterest = amount * effectiveRate;
      const expectedFees = l.regFee || 0;
      const expectedPenalty = status.penalty || 0;
      
      let remainingDebt = status.totalAmountDue;
      
      const outstandingPenalties = Math.min(remainingDebt, expectedPenalty);
      remainingDebt -= outstandingPenalties;
      
      const outstandingFees = Math.min(remainingDebt, expectedFees);
      remainingDebt -= outstandingFees;
      
      const outstandingInterest = Math.min(remainingDebt, expectedInterest);
      remainingDebt -= outstandingInterest;
      
      const outstandingPrincipal = Math.max(0, Math.min(remainingDebt, amount));

      totalPortfolioPrincipal += outstandingPrincipal;

      const d = status.overdueDays || 0;
      if (d === 0) {
        buckets.current.principal += outstandingPrincipal;
        buckets.current.count++;
      } else {
        if (d >= 1 && d <= 30) { buckets.par1_30.principal += outstandingPrincipal; buckets.par1_30.count++; }
        else if (d >= 31 && d <= 60) { buckets.par31_60.principal += outstandingPrincipal; buckets.par31_60.count++; }
        else if (d >= 61 && d <= 90) { buckets.par61_90.principal += outstandingPrincipal; buckets.par61_90.count++; }
        else if (d >= 91 && d <= 120) { buckets.par91_120.principal += outstandingPrincipal; buckets.par91_120.count++; }
        else { buckets.par120plus.principal += outstandingPrincipal; buckets.par120plus.count++; }
        
        // Find customer for phone number
        const cust = customers.find(c => c.id === l.customerId);

        overdueLoans.push({
          ...l,
          phone: cust?.phone || cust?.phone_number || '',
          outstandingPrincipal,
          daysOverdue: d,
          totalOutstanding: status.totalAmountDue
        });
      }
    });

    overdueLoans.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Calculate PAR percentages
    const par1 = totalPortfolioPrincipal - buckets.current.principal;
    const par30 = buckets.par31_60.principal + buckets.par61_90.principal + buckets.par91_120.principal + buckets.par120plus.principal;
    const par60 = buckets.par61_90.principal + buckets.par91_120.principal + buckets.par120plus.principal;
    const par90 = buckets.par91_120.principal + buckets.par120plus.principal;

    return { 
      totalPortfolioPrincipal,
      buckets: Object.values(buckets),
      par1, par30, par60, par90,
      par1Pct: totalPortfolioPrincipal ? (par1 / totalPortfolioPrincipal * 100).toFixed(1) : 0,
      par30Pct: totalPortfolioPrincipal ? (par30 / totalPortfolioPrincipal * 100).toFixed(1) : 0,
      par60Pct: totalPortfolioPrincipal ? (par60 / totalPortfolioPrincipal * 100).toFixed(1) : 0,
      par90Pct: totalPortfolioPrincipal ? (par90 / totalPortfolioPrincipal * 100).toFixed(1) : 0,
      overdueLoans
    };
  }, [loans, payments, customers]);

  const handleDownloadPDF = () => {
    exportPARReportPDF(parData, ts(now()));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: T.dim }}>
             <AlertOctagon size={20} />
             <span style={{ fontSize: 13, fontWeight: 600 }}>Portfolio At Risk (As of {ts(now())})</span>
          </div>
        </div>
        <Btn onClick={handleDownloadPDF} icon={Download} color={T.danger}>Download PDF</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.warn}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>PAR 1 (Total Overdue)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.warn, marginTop: 4 }}>{parData.par1Pct}% <span style={{fontSize: 12, fontWeight: 500, color: T.dim}}>({fmtM(parData.par1)})</span></div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>PAR 30 ({'>'}30 Days)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>{parData.par30Pct}% <span style={{fontSize: 12, fontWeight: 500, color: T.dim}}>({fmtM(parData.par30)})</span></div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>PAR 60 ({'>'}60 Days)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>{parData.par60Pct}% <span style={{fontSize: 12, fontWeight: 500, color: T.dim}}>({fmtM(parData.par60)})</span></div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>PAR 90 ({'>'}90 Days)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>{parData.par90Pct}% <span style={{fontSize: 12, fontWeight: 500, color: T.dim}}>({fmtM(parData.par90)})</span></div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        <Card style={{ padding: 0, overflowX: 'auto', alignSelf: 'flex-start' }}>
            <div style={{ padding: '16px 20px', background: T.surface, borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 13, color: T.txt }}>
                Aging Buckets
            </div>
            <DT 
            cols={[
                { k: 'label', l: 'Bucket', r: v => <span style={{ fontWeight: 600, color: T.txt }}>{v}</span> },
                { k: 'count', l: 'Loans' },
                { k: 'principal', l: 'Principal At Risk', r: v => <span style={{ fontWeight: 800, color: T.danger }}>{fmt(v)}</span> },
            ]}
            rows={parData.buckets}
            />
        </Card>

        <Card style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '16px 20px', background: T.surface, borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 13, color: T.txt, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} color={T.warn} /> Overdue Loans
            </div>
            <DT 
            cols={[
                { k: 'id', l: 'Loan ID', r: v => <span style={{ fontWeight: 600, color: T.txt }}>{v}</span> },
                { k: 'customer', l: 'Customer', r: (v, r) => {
                const c = customers.find(x => x.id === (r.customerId || r.customer_id));
                return <span style={{ fontWeight: 600, color: T.accent }}>{c ? c.name : 'Unknown'}</span>;
                }},
                { k: 'daysOverdue', l: 'Days Overdue', r: v => <span style={{ fontWeight: 800, color: v > 30 ? T.danger : T.warn }}>{v}d</span> },
                { k: 'outstandingPrincipal', l: 'Principal At Risk', r: v => <span style={{ fontWeight: 600, color: T.danger }}>{fmt(v)}</span> },
                { k: 'totalOutstanding', l: 'Total Outstanding', r: v => <span style={{ fontWeight: 800, color: T.txt }}>{fmt(v)}</span> },
            ]}
            rows={parData.overdueLoans}
            />
        </Card>
      </div>
    </div>
  );
}
