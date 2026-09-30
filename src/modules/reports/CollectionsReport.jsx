import React, { useState, useMemo } from 'react';
import { Card, T, DT, fmt, now, ts, Btn } from '@/lms-common';
import { Download, Search } from 'lucide-react';

export default function CollectionsReport({ payments, customers }) {
  const [pickedStart, setPickedStart] = useState(now().slice(0, 7) + '-01'); 
  const [pickedEnd, setPickedEnd] = useState(now());
  const [appliedStart, setAppliedStart] = useState(now().slice(0, 7) + '-01');
  const [appliedEnd, setAppliedEnd] = useState(now());

  const filteredPayments = useMemo(() => {
    const start = new Date(`${appliedStart}T00:00:00`).getTime();
    const end = new Date(`${appliedEnd}T23:59:59.999`).getTime();
    
    return payments.filter(p => {
      const pTime = new Date(p.date || p.created_at).getTime();
      return pTime >= start && pTime <= end;
    }).sort((a, b) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime());
  }, [payments, appliedStart, appliedEnd]);

  const { totalCollected, count, unallocated } = useMemo(() => {
    let tot = 0;
    let un = 0;
    filteredPayments.forEach(p => {
      tot += p.amount;
      if (p.status !== 'Allocated') un += p.amount;
    });
    return { totalCollected: tot, count: filteredPayments.length, unallocated: un };
  }, [filteredPayments]);

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
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Collections</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ok, marginTop: 4 }}>{fmt(totalCollected)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.blue}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Transaction Count</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, marginTop: 4 }}>{count}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.warn}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Unallocated Funds</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.warn, marginTop: 4 }}>{fmt(unallocated)}</div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <DT 
          cols={[
            { k: 'date', l: 'Received Date', r: v => <span style={{ color: T.dim, fontSize: 12 }}>{ts(v)}</span> },
            { k: 'method', l: 'Method', r: v => <span style={{ fontWeight: 600, color: T.txt }}>{v || 'M-Pesa'}</span> },
            { k: 'receipt', l: 'Reference', r: (v, r) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: T.dim }}>{v || r.id}</span> },
            { k: 'customer', l: 'Customer', r: (v, r) => {
               const c = customers.find(x => x.id === (r.customerId || r.customer_id));
               return <span style={{ fontWeight: 600, color: T.accent }}>{c ? c.name : (r.customer || 'Unknown')}</span>;
            }},
            { k: 'loanId', l: 'Loan ID', r: v => <span style={{ fontWeight: 600, color: T.txt }}>{v || 'Unallocated'}</span> },
            { k: 'amount', l: 'Amount', r: v => <span style={{ fontWeight: 800, color: T.ok }}>{fmt(v)}</span> },
            { k: 'status', l: 'Status', r: v => <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: v === 'Allocated' ? T.ok+'20' : T.warn+'20', color: v === 'Allocated' ? T.ok : T.warn }}>{v}</span> }
          ]}
          rows={filteredPayments}
        />
      </Card>
    </div>
  );
}
