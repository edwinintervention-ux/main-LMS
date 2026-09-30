import React, { useState, useMemo } from 'react';
import { Card, T, DT, fmt, now, ts, Btn } from '@/lms-common';
import { Download, BarChart2, Search } from 'lucide-react';
import { calculateLoanStatus } from '@/lms-common';

export default function RevenueReport({ loans, payments, customers }) {
  const [pickedStart, setPickedStart] = useState(now().slice(0, 7) + '-01'); 
  const [pickedEnd, setPickedEnd] = useState(now());
  const [appliedStart, setAppliedStart] = useState(now().slice(0, 7) + '-01');
  const [appliedEnd, setAppliedEnd] = useState(now());

  const revenueData = useMemo(() => {
    const start = new Date(`${appliedStart}T00:00:00`).getTime();
    const end = new Date(`${appliedEnd}T23:59:59.999`).getTime();
    
    const validPayments = payments.filter(p => {
      const pTime = new Date(p.date || p.created_at).getTime();
      return pTime >= start && pTime <= end && p.status === 'Allocated';
    });

    let totalRevenue = 0;
    
    // Simplistic historical revenue estimation:
    // This report calculates realized revenue by running the loan schedule and determining 
    // the proportion of payments that went to interest/fees vs principal.
    const revenueRows = [];

    loans.forEach(l => {
      const loanPayments = payments.filter(p => p.loanId === l.id && p.status === 'Allocated');
      
      // Payments strictly within period
      const periodPayments = loanPayments.filter(p => {
        const pTime = new Date(p.date || p.created_at).getTime();
        return pTime >= start && pTime <= end;
      });

      if (periodPayments.length === 0) return;

      const totalPaid = loanPayments.reduce((s, p) => s + p.amount, 0);
      const periodPaid = periodPayments.reduce((s, p) => s + p.amount, 0);
      
      const status = calculateLoanStatus(l, null, totalPaid);
      
      // If loan is fully settled or has high payments, some of it is revenue.
      // A strict accounting system would allocate each payment individually.
      // As a proxy, if totalPaid > principal, the excess is realized revenue.
      // We attribute revenue to the period proportional to the payments made in the period.
      
      const realizedRevenueForLoan = Math.max(0, totalPaid - (l.amount || 0));
      
      // Proportion of revenue that happened in this period
      const proportion = totalPaid > 0 ? (periodPaid / totalPaid) : 0;
      const periodRevenue = realizedRevenueForLoan * proportion;

      if (periodRevenue > 0) {
        totalRevenue += periodRevenue;
        revenueRows.push({
          ...l,
          periodPaid,
          periodRevenue,
          periodPrincipal: periodPaid - periodRevenue
        });
      }
    });

    return { totalRevenue, rows: revenueRows.sort((a, b) => b.periodRevenue - a.periodRevenue) };
  }, [loans, payments, appliedStart, appliedEnd]);

  const handleDownloadPDF = () => {
    alert("PDF Download feature is coming in Phase 5!");
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase' }}>Period Start</label>
              <input type='date' value={pickedStart} onChange={e=>setPickedStart(e.target.value)} onClick={e => e.target.showPicker && e.target.showPicker()}
                  style={{ cursor: 'pointer', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', color: T.txt, fontSize: 12, fontWeight: 600, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase' }}>Period End</label>
              <input type='date' value={pickedEnd} onChange={e=>setPickedEnd(e.target.value)} onClick={e => e.target.showPicker && e.target.showPicker()}
                  style={{ cursor: 'pointer', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', color: T.txt, fontSize: 12, fontWeight: 600, outline: 'none' }} />
            </div>
          </div>
          <Btn onClick={() => { setAppliedStart(pickedStart); setAppliedEnd(pickedEnd); }} icon={Search}>Apply Filter</Btn>
        </div>
        <Btn onClick={handleDownloadPDF} icon={Download} color={T.danger}>Download PDF</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 16, marginBottom: 24, width: 300 }}>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Realized Revenue</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.ok, marginTop: 4 }}>{fmt(revenueData.totalRevenue)}</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Total Interest & Fees collected in period.</div>
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
            { k: 'periodPaid', l: 'Total Collections (Period)', r: v => <span style={{ fontWeight: 600, color: T.txt }}>{fmt(v)}</span> },
            { k: 'periodPrincipal', l: 'Allocated to Principal', r: v => <span style={{ fontWeight: 600, color: T.dim }}>{fmt(v)}</span> },
            { k: 'periodRevenue', l: 'Allocated to Revenue', r: v => <span style={{ fontWeight: 800, color: T.ok }}>{fmt(v)}</span> },
          ]}
          rows={revenueData.rows}
        />
      </Card>
    </div>
  );
}
