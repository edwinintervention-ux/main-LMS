import React, { useState, useMemo } from 'react';
import { Card, T, DT, fmt, now, ts, Btn } from '@/lms-common';
import { Download, Search, FileSpreadsheet } from 'lucide-react';
import { generateBusinessLedger, filterLedgerByDate, calculateBusinessOpeningBalance, applyBusinessRunningBalance } from '@/utils/financialLedger';
import { exportBusinessStatementPDF, exportCSV } from '@/utils/reportExport';

export default function BusinessStatement({ loans, customers, payments }) {
  const [pickedStart, setPickedStart] = useState(now().slice(0, 7) + '-01'); 
  const [pickedEnd, setPickedEnd] = useState(now());
  const [appliedStart, setAppliedStart] = useState(now().slice(0, 7) + '-01');
  const [appliedEnd, setAppliedEnd] = useState(now());

  const fullLedger = useMemo(() => {
    return generateBusinessLedger(loans, payments);
  }, [loans, payments]);

  const maskPhone = (phone) => {
    if (!phone || String(phone).length < 10) return '';
    const str = String(phone).replace(/\s+/g, '');
    const len = str.length;
    return `${str.slice(0, len - 6)}***${str.slice(-3)}`;
  };

  const ledgerData = useMemo(() => {
    const opening = calculateBusinessOpeningBalance(fullLedger, appliedStart);
    const filtered = filterLedgerByDate(fullLedger, appliedStart, appliedEnd);
    
    const augmentedFiltered = filtered.map(tx => {
      const cust = customers.find(c => c.id === tx.customerId);
      const phoneStr = cust?.phone || cust?.phone_number;
      const masked = maskPhone(phoneStr);
      return {
        ...tx,
        source: masked && tx.source && tx.source !== 'System' ? `${tx.source} (${masked})` : tx.source
      };
    });

    const withRunning = applyBusinessRunningBalance(augmentedFiltered, opening);
    
    const tIn = augmentedFiltered.reduce((s, tx) => s + tx.moneyIn, 0);
    const tOut = augmentedFiltered.reduce((s, tx) => s + tx.moneyOut, 0);
    const closing = opening + tOut - tIn;

    return { filteredLedger: withRunning, openingBalance: opening, closingBalance: closing, totalIn: tIn, totalOut: tOut };
  }, [fullLedger, appliedStart, appliedEnd, customers]);

  const { filteredLedger, openingBalance, closingBalance, totalIn, totalOut } = ledgerData;

  const handleDownloadPDF = () => {
    exportBusinessStatementPDF(appliedStart, appliedEnd, ledgerData);
  };

  const handleDownloadCSV = () => {
    const csvReady = filteredLedger.map(tx => ({
      Date: tx.date,
      Description: tx.description,
      Reference: tx.ref || '',
      MoneyOut: tx.moneyOut,
      MoneyIn: tx.moneyIn,
      RunningBalance: tx.runningBalance
    }));
    exportCSV(csvReady, `Business_Statement_${appliedStart}_${appliedEnd}.csv`);
  };

  return (
    <div>
      {/* Date Filter & Export */}
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
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={handleDownloadCSV} icon={FileSpreadsheet} color={T.ok}>CSV</Btn>
          <Btn onClick={handleDownloadPDF} icon={Download} color={T.danger}>PDF</Btn>
        </div>
      </div>

      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.blue}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Opening Balance</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, marginTop: 4 }}>{fmt(openingBalance)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Money In</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ok, marginTop: 4 }}>{fmt(totalIn)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Money Out</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>{fmt(totalOut)}</div>
        </Card>
        <Card style={{ padding: 16, borderLeft: `4px solid ${T.accent}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Closing Balance</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, marginTop: 4 }}>{fmt(closingBalance)}</div>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <DT 
          cols={[
            { k: 'date', l: 'Date & Time', r: v => <span style={{ color: T.dim, fontSize: 12 }}>{ts(v)}</span> },
            { k: 'description', l: 'Transaction Details', r: (v, r) => (
              <div>
                <div style={{ fontWeight: 600, color: T.txt }}>{v}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{r.source}</div>
              </div>
            )},
            { k: 'ref', l: 'Reference', r: v => <span style={{ fontFamily: 'monospace', fontSize: 11, color: T.dim }}>{v}</span> },
            { k: 'moneyOut', l: 'Money Out', r: v => v > 0 ? <span style={{ color: T.danger, fontWeight: 600 }}>{fmt(v)}</span> : '-' },
            { k: 'moneyIn', l: 'Money In', r: v => v > 0 ? <span style={{ color: T.ok, fontWeight: 600 }}>{fmt(v)}</span> : '-' },
            { k: 'runningBalance', l: 'Running Balance', r: v => <span style={{ fontWeight: 800, color: T.txt }}>{fmt(v)}</span> }
          ]}
          rows={[{ id: 'opening', date: `${appliedStart}T00:00:00`, description: 'Opening Balance', source: '-', ref: '-', moneyOut: 0, moneyIn: 0, runningBalance: openingBalance }, ...filteredLedger]}
          defaultSort="date"
          defaultDir="asc"
        />
      </Card>
    </div>
  );
}
