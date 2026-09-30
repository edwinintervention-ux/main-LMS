import React, { useState, useMemo } from 'react';
import { Card, T, DT, fmt, now, ts, Btn } from '@/lms-common';
import { Download, Search } from 'lucide-react';

export default function DisbursementsReport({ loans, customers }) {
  const [pickedStart, setPickedStart] = useState(now().slice(0, 7) + '-01'); 
  const [pickedEnd, setPickedEnd] = useState(now());
  const [appliedStart, setAppliedStart] = useState(now().slice(0, 7) + '-01');
  const [appliedEnd, setAppliedEnd] = useState(now());

  const filteredLoans = useMemo(() => {
    const start = new Date(`${appliedStart}T00:00:00`).getTime();
    const end = new Date(`${appliedEnd}T23:59:59.999`).getTime();
    
    return loans.filter(l => {
      const dateStr = l.disbursed || l.createdAt;
      if (!dateStr) return false;
      const lTime = new Date(dateStr).getTime();
      return lTime >= start && lTime <= end;
    }).sort((a, b) => new Date(b.disbursed || b.createdAt).getTime() - new Date(a.disbursed || a.createdAt).getTime());
  }, [loans, appliedStart, appliedEnd]);

  const { totalPrincipal, totalFees, count } = useMemo(() => {
    let p = 0;
    let f = 0;
    filteredLoans.forEach(l => {
      p += l.amount || 0;
      f += l.regFee || 0;
    });
    return { totalPrincipal: p, totalFees: f, count: filteredLoans.length };
  }, [filteredLoans]);

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Principal Disbursed</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>{fmt(totalPrincipal)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.blue}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Loans Disbursed</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, marginTop: 4 }}>{count}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Registration Fees Charged</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ok, marginTop: 4 }}>{fmt(totalFees)}</div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <DT 
          cols={[
            { k: 'disbursed', l: 'Disbursement Date', r: (v, r) => <span style={{ color: T.dim, fontSize: 12 }}>{ts(v || r.createdAt)}</span> },
            { k: 'id', l: 'Loan ID', r: v => <span style={{ fontWeight: 600, color: T.txt }}>{v}</span> },
            { k: 'customer', l: 'Customer', r: (v, r) => {
               const c = customers.find(x => x.id === (r.customerId || r.customer_id));
               return <span style={{ fontWeight: 600, color: T.accent }}>{c ? c.name : (r.customer || 'Unknown')}</span>;
            }},
            { k: 'amount', l: 'Principal', r: v => <span style={{ fontWeight: 800, color: T.danger }}>{fmt(v)}</span> },
            { k: 'regFee', l: 'Reg Fee', r: v => <span style={{ fontWeight: 600, color: T.ok }}>{fmt(v)}</span> },
            { k: 'status', l: 'Status', r: v => <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, color: T.dim }}>{v}</span> }
          ]}
          rows={filteredLoans}
        />
      </Card>
    </div>
  );
}
