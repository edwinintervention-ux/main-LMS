import React, { useMemo, useState } from 'react';
import { Card, T, calculateLoanStatus, fmt } from '@/lms-common';
import { FileText, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function CBKReport({ loans }) {
  // Classification Buckets
  const BUCKETS = [
    { id: 'normal', label: 'Normal (Performing)', min: 0, max: 0, prov: 0.01, desc: '0 days in arrears' },
    { id: 'watch', label: 'Watch', min: 1, max: 30, prov: 0.05, desc: '1 - 30 days in arrears' },
    { id: 'substandard', label: 'Substandard', min: 31, max: 90, prov: 0.20, desc: '31 - 90 days in arrears' },
    { id: 'doubtful', label: 'Doubtful', min: 91, max: 180, prov: 0.50, desc: '91 - 180 days in arrears' },
    { id: 'loss', label: 'Loss', min: 181, max: 99999, prov: 1.00, desc: '> 180 days in arrears' }
  ];

  const reportData = useMemo(() => {
    // Only care about disbursed loans that are not settled
    const activeLoans = loans.filter(l => {
      const e = calculateLoanStatus(l);
      const isDisbursed = !['Rejected','Declined','Cancelled','Reversed','Application submitted','worker-pending','Approved'].includes(e.badgeStatus);
      return isDisbursed && !e.isSettled;
    });

    const summary = BUCKETS.map(b => ({ ...b, count: 0, outstanding: 0, provision: 0 }));

    activeLoans.forEach(l => {
      const e = calculateLoanStatus(l);
      const overdue = e.overdueDays || 0;
      const outstanding = e.totalAmountDue || 0;

      const bucket = summary.find(b => overdue >= b.min && overdue <= b.max) || summary[summary.length - 1];
      bucket.count++;
      bucket.outstanding += outstanding;
      bucket.provision += (outstanding * bucket.prov);
    });

    const totalLoans = summary.reduce((sum, b) => sum + b.count, 0);
    const totalOutstanding = summary.reduce((sum, b) => sum + b.outstanding, 0);
    const totalProvision = summary.reduce((sum, b) => sum + b.provision, 0);

    // PAR calculations (PAR > 30)
    const par30Outstanding = summary.filter(b => b.min > 30).reduce((sum, b) => sum + b.outstanding, 0);
    const par30Ratio = totalOutstanding > 0 ? (par30Outstanding / totalOutstanding) * 100 : 0;

    return { summary, totalLoans, totalOutstanding, totalProvision, par30Ratio, par30Outstanding };
  }, [loans]);

  const handleExport = () => {
    const wsData = [
      ["CBK Regulatory Report - Loan Classification & Provisioning"],
      ["Generated on", new Date().toLocaleDateString('en-GB')],
      [],
      ["Classification", "Description", "Number of Accounts", "Outstanding Portfolio (KES)", "Required Provision %", "Required Provision Amount (KES)"]
    ];

    reportData.summary.forEach(b => {
      wsData.push([
        b.label,
        b.desc,
        b.count,
        b.outstanding,
        `${(b.prov * 100)}%`,
        b.provision
      ]);
    });

    wsData.push([]);
    wsData.push(["TOTAL", "", reportData.totalLoans, reportData.totalOutstanding, "", reportData.totalProvision]);
    wsData.push([]);
    wsData.push(["PORTFOLIO AT RISK (PAR > 30)"]);
    wsData.push(["PAR > 30 Amount (KES)", reportData.par30Outstanding]);
    wsData.push(["PAR > 30 Ratio (%)", `${reportData.par30Ratio.toFixed(2)}%`]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CBK Report");
    XLSX.writeFile(wb, `CBK_Regulatory_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto', fontFamily: T.body }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txt, fontFamily: T.head }}>Regulatory Reports (CBK Format)</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
            Standard CBK Loan Classification & Provisioning Schedule
          </div>
        </div>
        <button 
          onClick={handleExport}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, background: T.accent, color: T.card,
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}
        >
          <Download size={16} /> Export to Excel
        </button>
      </div>

      <Card padded style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}`, color: T.dim }}>
              <th style={{ padding: '12px 8px', fontWeight: 600 }}>Classification</th>
              <th style={{ padding: '12px 8px', fontWeight: 600 }}>Days in Arrears</th>
              <th style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>Accounts</th>
              <th style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>Outstanding (KES)</th>
              <th style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>Prov. %</th>
              <th style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>Required Prov. (KES)</th>
            </tr>
          </thead>
          <tbody>
            {reportData.summary.map((b, i) => (
              <tr key={b.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '12px 8px', color: T.txt, fontWeight: 600 }}>{b.label}</td>
                <td style={{ padding: '12px 8px', color: T.dim }}>{b.desc}</td>
                <td style={{ padding: '12px 8px', color: T.txt, textAlign: 'right' }}>{b.count}</td>
                <td style={{ padding: '12px 8px', color: T.txt, textAlign: 'right', fontWeight: 600 }}>{fmt(b.outstanding)}</td>
                <td style={{ padding: '12px 8px', color: T.dim, textAlign: 'right' }}>{(b.prov * 100)}%</td>
                <td style={{ padding: '12px 8px', color: T.warn, textAlign: 'right', fontWeight: 600 }}>{fmt(b.provision)}</td>
              </tr>
            ))}
            <tr style={{ background: T.card2, fontWeight: 800 }}>
              <td colSpan={2} style={{ padding: '14px 8px', color: T.txt }}>TOTAL PORTFOLIO</td>
              <td style={{ padding: '14px 8px', color: T.txt, textAlign: 'right' }}>{reportData.totalLoans}</td>
              <td style={{ padding: '14px 8px', color: T.txt, textAlign: 'right' }}>{fmt(reportData.totalOutstanding)}</td>
              <td style={{ padding: '14px 8px', color: T.dim, textAlign: 'right' }}>-</td>
              <td style={{ padding: '14px 8px', color: T.warn, textAlign: 'right' }}>{fmt(reportData.totalProvision)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginTop: 20 }}>
        <Card padded style={{ background: T.card2 }}>
          <div style={{ color: T.dim, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Portfolio at Risk (PAR &gt; 30)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: reportData.par30Ratio > 5 ? T.danger : T.ok }}>
              {reportData.par30Ratio.toFixed(1)}%
            </span>
            <span style={{ fontSize: 13, color: T.dim }}>
              (KES {fmt(reportData.par30Outstanding)})
            </span>
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 12 }}>
            * CBK recommended PAR&gt;30 threshold is typically below 5%.
          </div>
        </Card>

        <Card padded style={{ background: T.card2 }}>
          <div style={{ color: T.dim, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Total Required Provision</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: T.warn }}>
              KES {fmt(reportData.totalProvision)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 12 }}>
            * This amount should be held as a provision for bad debts on your balance sheet.
          </div>
        </Card>
      </div>
    </div>
  );
}
