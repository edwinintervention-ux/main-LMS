import React, { useMemo } from 'react';
import { Card, T, DT, fmt, fmtM, now, ts, Btn, normProduct, getProductBaseRate, getProductDays, calculateLoanStatus } from '@/lms-common';
import { Download, Shield } from 'lucide-react';

export default function PortfolioReport({ loans, customers, payments }) {

  const portfolioData = useMemo(() => {
    const activeLoans = loans.filter(l => l.disbursed && !['Settled', 'Written off', 'Cancelled', 'Reversed'].includes(l.status));
    
    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalPenalties = 0;
    let totalOutstanding = 0;
    
    let overdueCount = 0;
    let overduePrincipal = 0;

    const rowData = activeLoans.map(l => {
      const loanPayments = payments.filter(p => p.loanId === l.id && p.status === 'Allocated');
      const paid = loanPayments.reduce((s, p) => s + p.amount, 0);
      const status = calculateLoanStatus(l, null, paid);
      
      const amount = l.amount || 0;
      const effectiveRate = getProductBaseRate(l.product) * (1 - (Number(l.interestDiscount) || 0) / 100);
      const expectedInterest = amount * effectiveRate;
      const expectedPenalty = status.penalty || 0;
      
      let remainingDebt = status.totalAmountDue;
      
      // Waterfall allocation of remaining debt (outstanding amounts)
      const outstandingPenalties = Math.min(remainingDebt, expectedPenalty);
      remainingDebt -= outstandingPenalties;
      
      const outstandingInterest = Math.min(remainingDebt, expectedInterest);
      remainingDebt -= outstandingInterest;
      
      const outstandingPrincipal = Math.max(0, Math.min(remainingDebt, amount));

      totalPrincipal += outstandingPrincipal;
      totalInterest += outstandingInterest;
      totalPenalties += outstandingPenalties;
      totalOutstanding += status.totalAmountDue;

      if (status.daysOverdue > 0) {
        overdueCount++;
        overduePrincipal += outstandingPrincipal;
      }

      return {
        ...l,
        outstandingPrincipal,
        outstandingInterest,
        outstandingPenalties,
        totalOutstanding: status.totalAmountDue,
        daysOverdue: status.daysOverdue,
        computedStatus: status.status
      };
    }).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    return { 
      rows: rowData,
      totalPrincipal, 
      totalInterest, 
      totalPenalties, 
      totalOutstanding,
      overdueCount,
      overduePrincipal,
      activeCount: activeLoans.length
    };
  }, [loans, payments]);

  const handleDownloadPDF = () => {
    alert("PDF Download feature is coming in Phase 5!");
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: T.dim }}>
             <Shield size={20} />
             <span style={{ fontSize: 13, fontWeight: 600 }}>Live Portfolio Snapshot (As of {ts(now())})</span>
          </div>
        </div>
        <Btn onClick={handleDownloadPDF} icon={Download} color={T.danger}>Download PDF</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.blue}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Active Loans</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, marginTop: 4 }}>{portfolioData.activeCount}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Outstanding Principal</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>{fmtM(portfolioData.totalPrincipal)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.warn}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Outstanding Interest</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.warn, marginTop: 4 }}>{fmtM(portfolioData.totalInterest)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.accent}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Outstanding Penalties</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, marginTop: 4 }}>{fmtM(portfolioData.totalPenalties)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Portfolio Exposure</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ok, marginTop: 4 }}>{fmtM(portfolioData.totalOutstanding)}</div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <DT 
          cols={[
            { k: 'id', l: 'Loan ID', r: v => <span style={{ fontWeight: 600, color: T.txt }}>{v}</span> },
            { k: 'customer', l: 'Customer', r: (v, r) => {
               const c = customers.find(x => x.id === (r.customerId || r.customer_id));
               return <span style={{ fontWeight: 600, color: T.accent }}>{c ? c.name : 'Unknown'}</span>;
            }},
            { k: 'disbursed', l: 'Disbursed', r: (v, r) => <span style={{ color: T.dim, fontSize: 12 }}>{ts(v || r.created_at)}</span> },
            { k: 'outstandingPrincipal', l: 'Principal', r: v => <span style={{ fontWeight: 600, color: T.danger }}>{fmt(v)}</span> },
            { k: 'outstandingInterest', l: 'Interest', r: v => <span style={{ fontWeight: 600, color: T.warn }}>{fmt(v)}</span> },
            { k: 'outstandingPenalties', l: 'Penalties', r: v => <span style={{ fontWeight: 600, color: T.dim }}>{fmt(v)}</span> },
            { k: 'totalOutstanding', l: 'Total Outstanding', r: v => <span style={{ fontWeight: 800, color: T.ok }}>{fmt(v)}</span> },
            { k: 'computedStatus', l: 'Status', r: (v, r) => (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: v === 'Overdue' ? T.danger+'20' : T.ok+'20', color: v === 'Overdue' ? T.danger : T.ok }}>
                    {v === 'Overdue' ? `${v} (${r.daysOverdue}d)` : v}
                </span>
            )}
          ]}
          rows={portfolioData.rows}
        />
      </Card>
    </div>
  );
}
