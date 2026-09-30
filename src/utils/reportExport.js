import { ADEQUATE_STAMP_BASE64, ADEQUATE_LOGO_BASE64 } from '@/lms-common';

// Inlined helpers — avoids circular dependency with lms-common in production build
const fmt = (n) => 'KES ' + (Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtM = fmt;
const ts = (d) => { 
  if (!d) return '—'; 
  try { 
    if (typeof d === 'string' && d.length === 10) {
      return new Date(d + 'T00:00:00').toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return new Date(d).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); 
  } catch { 
    return d; 
  } 
};

const downloadLoanDoc = (html, filename) => {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow popups to generate the PDF document.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.setTimeout(() => { win.document.title = filename; win.print(); }, 500);
};

const BRAND_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1f36; padding: 0; margin: 0; line-height: 1.5; font-size: 11px; }
  
  .header-wrapper { background-color: #0c182b; color: #ffffff; padding: 40px; border-bottom: 4px solid #cda434; display: flex; justify-content: space-between; align-items: flex-start; }
  .logo-title-group { display: flex; align-items: center; gap: 20px; }
  .logo-img { height: 60px; width: auto; background: white; padding: 5px; border-radius: 50%; }
  .logo-text { font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
  .slogan-text { color: #f59e0b; font-size: 13px; font-style: italic; margin-top: 4px; }
  .doc-title { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 25px; margin-bottom: 5px; }
  .doc-meta { font-size: 12px; color: #cbd5e1; }
  .header-right { text-align: right; font-size: 11px; color: #cbd5e1; }
  .header-right b { color: #ffffff; font-size: 14px; font-weight: 700; }
  .header-right a { color: #cbd5e1; text-decoration: none; }
  
  .content { padding: 40px; }

  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; margin-bottom: 40px; }
  .summary-box { padding: 15px; border: 1px solid #e2e8f0; border-radius: 4px; background: #ffffff; border-top: 3px solid #cbd5e1; }
  .summary-box.color-1a1f36 { border-top-color: #94a3b8; }
  .summary-box.color-10b981 { border-top-color: #10b981; }
  .summary-box.color-ef4444 { border-top-color: #ef4444; }
  .summary-box.color-4F46E5 { border-top-color: #f59e0b; }
  .meta-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
  .meta-value { font-size: 20px; font-weight: 800; }
  
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { background-color: #0c182b; color: #ffffff; padding: 12px 15px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 12px 15px; font-size: 11px; color: #334155; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background-color: #f8fafc; }
  .amt-in { color: #10b981; font-weight: 600; }
  .amt-out { color: #ef4444; font-weight: 600; }
  .amt-bal { font-weight: 800; color: #0c182b; }
  
  .footer { text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 40px; }

  .stamp-footer-wrap { position: relative; display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  .stamp-footer-text { text-align: center; font-size: 10px; color: #94a3b8; flex: 1; }
  .stamp-corner { width: 250px; height: 250px; transform: rotate(-8deg); pointer-events: none; flex-shrink: 0; filter: saturate(2.5) contrast(1.8) brightness(0.9); }
`;

function buildHTML(title, subtitle, summaryBoxes, headers, rows, filename) {
  const stampSrc = ADEQUATE_STAMP_BASE64 || '';
  const logoSrc = ADEQUATE_LOGO_BASE64 || '';
  const today = new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>${BRAND_STYLE}</style>
    </head>
    <body>

      <div class="header-wrapper">
        <div>
          <div class="logo-title-group">
            ${logoSrc ? `<img src="${logoSrc}" class="logo-img" alt="Logo" />` : ''}
            <div>
              <div class="logo-text">ADEQUATE CAPITAL LIMITED</div>
              <div class="slogan-text">You deserve nothing less!</div>
            </div>
          </div>
          <div class="doc-title">${title}</div>
          <div class="doc-meta">${subtitle.replace(/<br>/g, ' &bull; ')}</div>
          <div class="doc-meta" style="margin-top:4px;">Generated: ${ts(new Date().toISOString())}</div>
        </div>
        <div class="header-right">
          <div style="margin-bottom: 15px;">
            <div style="font-size: 10px; text-transform: uppercase;">Paybill No.</div>
            <b>4166191</b>
          </div>
          <div style="line-height: 1.6;">
            P.O. Box 253-00241<br>
            Kitengela, Kenya<br><br>
            <a href="mailto:info@adequatecapital.co.ke">info@adequatecapital.co.ke</a>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="summary-grid">
          ${summaryBoxes.map(b => {
             let colorClass = 'color-1a1f36';
             if (b.color === '#10b981') colorClass = 'color-10b981';
             if (b.color === '#ef4444') colorClass = 'color-ef4444';
             if (b.color === '#4F46E5') colorClass = 'color-4F46E5';
             return `
              <div class="summary-box ${colorClass}">
                <div class="meta-label">${b.label}</div>
                <div class="meta-value" style="color: ${b.color || '#1a1f36'}">${b.value}</div>
              </div>
            `;
          }).join('')}
        </div>

        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>

        <div class="stamp-footer-wrap">
          <div class="stamp-footer-text">
            This is a computer-generated document. For any inquiries, please contact info@adequatecapital.co.ke.
          </div>
          ${stampSrc ? `
          <div class="stamp-corner" style="position: relative;">
            <img src="${stampSrc}" alt="Stamp" style="width: 100%; height: 100%; display: block;" />
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: 900; color: #dc2626; letter-spacing: 0px; padding-right: 10px; padding-bottom: 2px;">
              ${today}
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
  downloadLoanDoc(html, filename, 'pdf');
}

export function exportBusinessStatementPDF(appliedStart, appliedEnd, data) {
  const { filteredLedger, openingBalance, closingBalance, totalIn, totalOut } = data;
  
  const headers = ['Date', 'Description', 'Reference', 'Money Out', 'Money In', 'Balance'];
  const rows = [
    [appliedStart, '<strong>Opening Balance</strong>', '-', '-', '-', `<span class="amt-bal">${fmt(openingBalance)}</span>`],
    ...filteredLedger.map(tx => [
      ts(tx.date),
      `<strong>${tx.description}</strong><br><span style="font-size:10px;color:#94a3b8">${tx.source}</span>`,
      `<span style="font-family:monospace;font-size:11px">${tx.ref || '-'}</span>`,
      tx.moneyOut > 0 ? `<span class="amt-out">${fmt(tx.moneyOut)}</span>` : '-',
      tx.moneyIn > 0 ? `<span class="amt-in">${fmt(tx.moneyIn)}</span>` : '-',
      `<span class="amt-bal">${fmt(tx.runningBalance)}</span>`
    ])
  ];

  buildHTML('Business Statement', `Period: ${appliedStart} to ${appliedEnd}`, [
    { label: 'Opening Balance', value: fmt(openingBalance), color: '#1a1f36' },
    { label: 'Total Money In', value: fmt(totalIn), color: '#10b981' },
    { label: 'Total Money Out', value: fmt(totalOut), color: '#ef4444' },
    { label: 'Closing Balance', value: fmt(closingBalance), color: '#4F46E5' }
  ], headers, rows, `Business_Statement_${appliedStart}_${appliedEnd}.pdf`);
}

export function exportProfitLossStatementPDF(appliedStart, appliedEnd, totalRevenue, totalPrincipalLoss, grossProfit) {
  const headers = ['Metric', 'Amount', 'Description'];
  const rows = [
    ['Total Operating Revenue', `<span class="amt-in">${fmt(totalRevenue)}</span>`, 'Realized Interest & Fees'],
    ['Principal Write-offs (Losses)', `<span class="amt-out">${fmt(totalPrincipalLoss)}</span>`, 'Unrecovered capital marked as written off'],
    ['<strong>Gross Profit</strong>', `<strong><span class="${grossProfit >= 0 ? 'amt-in' : 'amt-out'}">${fmt(grossProfit)}</span></strong>`, 'Revenue minus Principal Losses']
  ];

  buildHTML('Profit & Loss Statement', `Period: ${appliedStart} to ${appliedEnd}`, [
    { label: 'Total Operating Revenue', value: fmt(totalRevenue), color: '#10b981' },
    { label: 'Principal Losses', value: fmt(totalPrincipalLoss), color: '#ef4444' },
    { label: 'Gross Profit', value: fmt(grossProfit), color: grossProfit >= 0 ? '#10b981' : '#ef4444' }
  ], headers, rows, `Profit_Loss_Statement_${appliedStart}_${appliedEnd}.pdf`);
}

export function exportCustomerStatementPDF(customer, appliedStart, appliedEnd, data) {
  const { filteredLedger, openingBalance, closingBalance, totalDebits, totalCredits } = data;
  
  const headers = ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'];
  const rows = [
    [appliedStart, '<strong>Opening Balance</strong>', '-', '-', '-', `<span class="amt-bal">${fmt(openingBalance)}</span>`],
    ...filteredLedger.map(tx => [
      ts(tx.date),
      `<strong>${tx.description}</strong><br><span style="font-size:10px;color:#94a3b8">Loan ID: ${tx.loanId || '-'}</span>`,
      `<span style="font-family:monospace;font-size:11px">${tx.ref || '-'}</span>`,
      tx.debit > 0 ? `<span class="amt-out">${fmt(tx.debit)}</span>` : '-',
      tx.credit > 0 ? `<span class="amt-in">${fmt(tx.credit)}</span>` : '-',
      `<span class="amt-bal">${fmt(tx.runningBalance)}</span>`
    ])
  ];

  buildHTML(
    'Customer Statement of Account',
    `Customer: ${customer.name} (ID: ${customer.idNo || customer.phone})<br>Period: ${appliedStart} to ${appliedEnd}`,
    [
      { label: 'Opening Balance', value: fmt(openingBalance) },
      { label: 'Total Debits', value: fmt(totalDebits), color: '#ef4444' },
      { label: 'Total Credits', value: fmt(totalCredits), color: '#10b981' },
      { label: 'Closing Balance', value: fmt(closingBalance) }
    ],
    headers,
    rows,
    `Customer_Statement_${customer.name.replace(/\s+/g,'_')}.pdf`
  );
}

export function exportPARReportPDF(parData, dateString) {
  const { par1Pct, par1, par30Pct, par30, par60Pct, par60, par90Pct, par90, overdueLoans } = parData;
  const headers = ['Loan ID', 'Customer', 'Days Overdue', 'Principal at Risk', 'Total Outstanding'];
  const rows = overdueLoans.map(l => [
    `<span style="font-family:monospace;font-size:11px">${l.id}</span>`,
    `<strong>${l.customer}</strong><br><span style="font-size:10px;color:#94a3b8">${l.phone || ''}</span>`,
    `<strong>${l.daysOverdue}d</strong>`,
    `<span class="amt-out">${fmt(l.outstandingPrincipal)}</span>`,
    `<strong>${fmt(l.totalOutstanding)}</strong>`
  ]);

  buildHTML(
    'Portfolio At Risk (PAR) Report',
    `As of: ${dateString}`,
    [
      { label: 'PAR 1 (Total Overdue)', value: `${par1Pct}% <span style="font-size:11px;font-weight:600">(${fmt(par1)})</span>`, color: '#f59e0b' },
      { label: 'PAR 30 (>30 Days)', value: `${par30Pct}% <span style="font-size:11px;font-weight:600">(${fmt(par30)})</span>`, color: '#ef4444' },
      { label: 'PAR 60 (>60 Days)', value: `${par60Pct}% <span style="font-size:11px;font-weight:600">(${fmt(par60)})</span>`, color: '#ef4444' },
      { label: 'PAR 90 (>90 Days)', value: `${par90Pct}% <span style="font-size:11px;font-weight:600">(${fmt(par90)})</span>`, color: '#ef4444' }
    ],
    headers,
    rows,
    `PAR_Report_${ts(new Date().toISOString()).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
  );
}

export function exportCSV(dataArray, filename) {
  if (!dataArray || !dataArray.length) {
    alert("No data available to export.");
    return;
  }
  const headers = Object.keys(dataArray[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));
  
  for (const row of dataArray) {
    const values = headers.map(header => {
      const escaped = (''+row[header]).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
