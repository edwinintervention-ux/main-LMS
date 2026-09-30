import React, { useState, useMemo } from 'react';
import { Card, T, DT, fmt, now, ts, Btn, normProduct, getProductBaseRate, getProductDays, calculateLoanStatus } from '@/lms-common';
import { Download, PieChart, TrendingUp, TrendingDown } from 'lucide-react';
import { exportProfitLossStatementPDF } from '@/utils/reportExport';

export default function ProfitLossReport({ loans, payments, customers }) {
  const [pickedStart, setPickedStart] = useState(now().slice(0, 7) + '-01'); 
  const [pickedEnd, setPickedEnd] = useState(now());
  const [appliedStart, setAppliedStart] = useState(now().slice(0, 7) + '-01');
  const [appliedEnd, setAppliedEnd] = useState(now());

  const { totalRevenue, totalPrincipalLoss } = useMemo(() => {
    const start = new Date(`${appliedStart}T00:00:00`).getTime();
    const end = new Date(`${appliedEnd}T23:59:59.999`).getTime();
    
    let rev = 0;
    let loss = 0;

    loans.forEach(l => {
      const loanPayments = payments.filter(p => p.loanId === l.id && p.status === 'Allocated');
      const totalPaid = loanPayments.reduce((s, p) => s + p.amount, 0);

      // Calculate what the total charges are for this loan
      const principal = l.amount || 0;
      const effectiveRate = getProductBaseRate(l.product) * (1 - (Number(l.interestDiscount) || 0) / 100);
      const expectedInterest = principal * effectiveRate;
      const expectedFee = l.regFee || 0;
      const totalCharged = principal + expectedInterest + expectedFee;

      // Revenue = portion of payments that exceeded the principal (i.e., interest + fees collected)
      // Using waterfall: payments first recover principal, then interest, then fees
      const interestAndFeeCollected = Math.max(0, totalPaid - principal);
      const maxRevenue = expectedInterest + expectedFee;
      const realizedRevenue = Math.min(interestAndFeeCollected, maxRevenue);

      // Filter to period payments
      const periodPayments = loanPayments.filter(p => {
        const pTime = new Date(p.date || p.created_at).getTime();
        return pTime >= start && pTime <= end;
      });
      const periodPaid = periodPayments.reduce((s, p) => s + p.amount, 0);

      if (periodPaid > 0 && totalPaid > 0) {
        const proportion = periodPaid / totalPaid;
        rev += realizedRevenue * proportion;
      }

      // 2. Written-off principal loss
      if (l.status === 'Written off') {
        const lTime = new Date(l.updatedAt || l.createdAt).getTime();
        if (lTime >= start && lTime <= end) {
          const principalLoss = Math.max(0, principal - Math.min(totalPaid, principal));
          loss += principalLoss;
        }
      }
    });

    return { totalRevenue: rev, totalPrincipalLoss: loss };
  }, [loans, payments, appliedStart, appliedEnd]);

  const grossProfit = totalRevenue - totalPrincipalLoss;

  const handleDownloadPDF = () => {
    exportProfitLossStatementPDF(appliedStart, appliedEnd, totalRevenue, totalPrincipalLoss, grossProfit);
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
          <Btn onClick={() => { setAppliedStart(pickedStart); setAppliedEnd(pickedEnd); }} icon={PieChart}>Calculate P&L</Btn>
        </div>
        <Btn onClick={handleDownloadPDF} icon={Download} color={T.danger}>Download PDF</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Operating Revenue</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ok, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
             {fmt(totalRevenue)} <TrendingUp size={20} />
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Realized Interest & Fees</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Principal Write-offs (Losses)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.danger, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
             {fmt(totalPrincipalLoss)} <TrendingDown size={20} />
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Unrecovered capital marked as written off</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${grossProfit >= 0 ? T.ok : T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Gross Profit</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: grossProfit >= 0 ? T.ok : T.danger, marginTop: 4 }}>
             {fmt(grossProfit)}
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Revenue minus Principal Losses</div>
        </Card>
      </div>

      <Card style={{ padding: 30, textAlign: 'center', color: T.muted }}>
         <PieChart size={40} style={{ margin: '0 auto 15px', opacity: 0.3 }} />
         <div style={{ fontWeight: 600, fontSize: 16 }}>Detailed Expense Tracking</div>
         <div style={{ fontSize: 13, marginTop: 5 }}>To calculate Net Profit, operational expenses (salaries, software, rent) must be tracked.<br/>Expense tracking module is pending integration.</div>
      </Card>
    </div>
  );
}
