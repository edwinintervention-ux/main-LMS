import React, { useState, useMemo } from 'react';
import { Card, T, DT, fmt, now, ts, Btn, Badge } from '@/lms-common';
import { Download, Search, User, FileSpreadsheet } from 'lucide-react';
import { generateCustomerLedger, filterLedgerByDate, calculateOpeningBalance, applyRunningBalance } from '@/utils/financialLedger';
import { exportCustomerStatementPDF, exportCSV } from '@/utils/reportExport';

export default function CustomerStatement({ loans, customers, payments }) {
  const [pickedStart, setPickedStart] = useState('2024-01-01'); 
  const [pickedEnd, setPickedEnd] = useState(now());
  const [appliedStart, setAppliedStart] = useState('2024-01-01');
  const [appliedEnd, setAppliedEnd] = useState(now());
  
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const customerOptions = useMemo(() => {
    return customers.map(c => ({ value: c.id, label: `${c.name} (${c.idNo || c.phone})` }));
  }, [customers]);

  const fullLedger = useMemo(() => {
    if (!selectedCustomerId) return [];
    const customerLoans = loans.filter(l => (l.customerId || l.customer_id) === selectedCustomerId);
    const customerPayments = payments.filter(p => (p.customerId || p.customer_id) === selectedCustomerId || customerLoans.some(l => l.id === (p.loanId || p.loan_id)));
    return generateCustomerLedger(customerLoans, customerPayments);
  }, [selectedCustomerId, loans, payments]);

  // When customer changes, auto-set period start to earliest loan disbursement date
  const handleCustomerChange = (customerId) => {
    setSelectedCustomerId(customerId);
    if (customerId) {
      const customerLoans = loans.filter(l => (l.customerId || l.customer_id) === customerId);
      const customerPayments = payments.filter(p => (p.customerId || p.customer_id) === customerId);
      // Gather all relevant dates: loan disbursements AND payments (for reg fee-only customers)
      const loanDates = customerLoans.map(l => l.disbursed || l.createdAt || l.created_at).filter(Boolean);
      const paymentDates = customerPayments.map(p => p.date || p.created_at).filter(Boolean);
      const allDates = [...loanDates, ...paymentDates].map(d => d.slice(0, 10)).sort();
      const earliest = allDates[0] || '2024-01-01';
      setPickedStart(earliest);
      setAppliedStart(earliest);
    }
  };

  const ledgerData = useMemo(() => {
    if (!selectedCustomerId) return { filteredLedger: [], openingBalance: 0, closingBalance: 0, totalDebits: 0, totalCredits: 0 };
    
    const opening = calculateOpeningBalance(fullLedger, appliedStart);
    const filtered = filterLedgerByDate(fullLedger, appliedStart, appliedEnd);
    const withRunning = applyRunningBalance(filtered, opening);
    
    const tDebits = filtered.reduce((s, tx) => s + tx.debit, 0);
    const tCredits = filtered.reduce((s, tx) => s + tx.credit, 0);
    const closing = opening + tDebits - tCredits;

    return { filteredLedger: withRunning, openingBalance: opening, closingBalance: closing, totalDebits: tDebits, totalCredits: tCredits };
  }, [fullLedger, appliedStart, appliedEnd, selectedCustomerId]);

  const { filteredLedger, openingBalance, closingBalance, totalDebits, totalCredits } = ledgerData;

  const handleDownloadPDF = () => {
    const cust = customers.find(c => c.id === selectedCustomerId);
    exportCustomerStatementPDF(cust, appliedStart, appliedEnd, ledgerData);
  };

  const handleDownloadCSV = () => {
    const cust = customers.find(c => c.id === selectedCustomerId);
    const csvReady = filteredLedger.map(tx => ({
      Date: tx.date,
      Description: tx.description,
      Reference: tx.ref || '',
      LoanID: tx.loanId || '',
      Debit: tx.debit,
      Credit: tx.credit,
      RunningBalance: tx.runningBalance
    }));
    exportCSV(csvReady, `Customer_Statement_${cust?.name.replace(/\s+/g,'_')}.csv`);
  };

  return (
    <div>
      {/* Customer Selector & Date Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase' }}>Select Customer</label>
            <select 
              value={selectedCustomerId} 
              onChange={e => handleCustomerChange(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', color: T.txt, fontSize: 12, fontWeight: 600, outline: 'none', width: 250 }}
            >
              <option value="">-- Choose Customer --</option>
              {customerOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

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
          <Btn onClick={handleDownloadCSV} icon={FileSpreadsheet} color={T.ok} disabled={!selectedCustomerId}>CSV</Btn>
          <Btn onClick={handleDownloadPDF} icon={Download} color={T.danger} disabled={!selectedCustomerId}>PDF</Btn>
        </div>
      </div>

      {!selectedCustomerId ? (
        <Card style={{ padding: 60, textAlign: 'center', color: T.muted }}>
          <User size={40} style={{ margin: '0 auto 15px', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, fontSize: 16 }}>No Customer Selected</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>Please select a customer to view their statement of account.</div>
        </Card>
      ) : (
        <>
          {/* Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <Card style={{ padding: 16, borderLeft: `4px solid ${T.blue}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Opening Balance</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, marginTop: 4 }}>{fmt(openingBalance)}</div>
            </Card>
            <Card style={{ padding: 16, borderLeft: `4px solid ${T.danger}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Debits (Charges)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>{fmt(totalDebits)}</div>
            </Card>
            <Card style={{ padding: 16, borderLeft: `4px solid ${T.ok}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Total Credits (Payments)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.ok, marginTop: 4 }}>{fmt(totalCredits)}</div>
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
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Loan ID: {r.loanId || '-'}</div>
                  </div>
                )},
                { k: 'ref', l: 'Reference', r: v => <span style={{ fontFamily: 'monospace', fontSize: 11, color: T.dim }}>{v}</span> },
                { k: 'debit', l: 'Debit', r: v => v > 0 ? <span style={{ color: T.danger, fontWeight: 600 }}>{fmt(v)}</span> : '-' },
                { k: 'credit', l: 'Credit', r: v => v > 0 ? <span style={{ color: T.ok, fontWeight: 600 }}>{fmt(v)}</span> : '-' },
                { k: 'runningBalance', l: 'Running Balance', r: v => <span style={{ fontWeight: 800, color: T.txt }}>{fmt(v)}</span> }
              ]}
              rows={[{ id: 'opening', date: `${appliedStart}T00:00:00`, description: 'Opening Balance', loanId: '-', ref: '-', debit: 0, credit: 0, runningBalance: openingBalance }, ...filteredLedger]}
              defaultSort="date"
              defaultDir="asc"
            />
          </Card>
        </>
      )}
    </div>
  );
}
