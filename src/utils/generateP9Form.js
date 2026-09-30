import { calculateStatutoryDeductions } from './taxCalculator';
import { generatePayslipHTML, fmt, fmtM, T, now, ADEQUATE_STAMP_BASE64 } from '@/lms-common';

export const generateP9Form = (worker, salaryPayments, workerDeductions, workerAdditions, year, cfg) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p9Data = [];

  let totalBasic = 0, totalBenefits = 0, totalGross = 0, totalNssf = 0, totalShif = 0, totalAhl = 0,
      totalTaxable = 0, totalPaye = 0, totalRelief = 0, totalInsRelief = 0, totalNet = 0;

  months.forEach((mName, i) => {
    const monthStr = year + '-' + String(i + 1).padStart(2, '0');
    const monthPayments = salaryPayments.filter(p =>
      String(p.worker_id) === String(worker.id) &&
      (p.month === monthStr || (p.created_at || '').slice(0, 7) === monthStr)
    );
    const monthDeds = workerDeductions.filter(d => String(d.worker_id) === String(worker.id) && d.month === monthStr);
    const monthAdds = workerAdditions.filter(a => String(a.worker_id) === String(worker.id) && a.month === monthStr);

    const netPaid    = monthPayments.reduce((s, p) => s + (Number(p.amount) || Number(p.netDue) || 0), 0);
    const customDeds = monthDeds.reduce((s, d) => s + Number(d.amount), 0);
    const customAdds = monthAdds.reduce((s, a) => s + Number(a.amount), 0);
    const helbAmt    = Number(worker.helbAmount || 0);

    let baseGross = 0;
    let stat = { nssf: 0, shif: 0, ahl: 0, paye: 0, totalStatutory: 0 };

    if (netPaid > 0) {
      const targetNet = netPaid + helbAmt + customDeds;
      let guessGross = Math.round(targetNet / 0.8975);
      for (let j = 0; j < 10; j++) {
        stat = calculateStatutoryDeductions(guessGross);
        const calcNet = guessGross - stat.totalStatutory;
        const diff = targetNet - calcNet;
        if (Math.abs(diff) <= 1) break;
        guessGross += diff;
      }
      baseGross = guessGross;
    }

    const basicPay      = Math.max(0, baseGross - customAdds);
    const benefits      = customAdds;
    const taxableIncome = Math.max(0, baseGross - stat.nssf - stat.shif);
    const relief        = (stat.paye > 0 || taxableIncome > 0) ? 2400 : 0;
    const insRelief     = 0;

    p9Data.push({ month: mName, basicPay, benefits, gross: baseGross, nssf: stat.nssf, shif: stat.shif,
      ahl: stat.ahl, taxableIncome, paye: stat.paye, relief, insRelief, net: netPaid });

    totalBasic     += basicPay;    totalBenefits  += benefits;
    totalGross     += baseGross;   totalNssf      += stat.nssf;
    totalShif      += stat.shif;   totalAhl       += stat.ahl;
    totalTaxable   += taxableIncome; totalPaye    += stat.paye;
    totalRelief    += relief;      totalInsRelief += insRelief;
    totalNet       += netPaid;
  });

  const fc = (v) => Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const employerKra  = cfg && cfg.employerKraPin   ? cfg.employerKraPin   : 'NOT SET';
  const employerName = cfg && cfg.portalName       ? cfg.portalName       : 'Adequate Capital Ltd';
  const employerAddr = cfg && cfg.address          ? cfg.address          : '';
  const employeeKra  = worker && worker.kraPin     ? worker.kraPin        : 'NOT SET';
  const employeeNssf = worker && worker.nssfNumber ? worker.nssfNumber    : '-';
  const employeeShif = worker && worker.shifNumber ? worker.shifNumber    : '-';
  const employeeId   = worker && worker.idNo       ? worker.idNo          : '-';
  const staffNo      = worker && worker.staffNo    ? worker.staffNo       : '-';
  const designation  = worker && worker.role       ? worker.role          : '-';

  const activePay  = p9Data.filter(d => d.gross > 0);
  const periodFrom = activePay.length > 0 ? activePay[0].month : '-';
  const periodTo   = activePay.length > 0 ? activePay[activePay.length - 1].month : '-';

  const dash = '<span style="color:#94a3b8">—</span>';
  const cell = (v, show) => show ? fc(v) : dash;

  const rows = p9Data.map(function(d) {
    const show = d.gross > 0;
    const payeNet = Math.max(0, d.paye - d.relief - d.insRelief);
    return '<tr>' +
      '<td>' + d.month + '</td>' +
      '<td>' + cell(d.basicPay, show) + '</td>' +
      '<td>' + cell(d.benefits, show) + '</td>' +
      '<td>' + cell(d.gross, show) + '</td>' +
      '<td>' + cell(d.nssf, show) + '</td>' +
      '<td>' + cell(d.shif, show) + '</td>' +
      '<td>' + cell(d.ahl, show) + '</td>' +
      '<td>' + cell(d.taxableIncome, show) + '</td>' +
      '<td>' + cell(d.paye, show) + '</td>' +
      '<td>' + cell(d.relief, show) + '</td>' +
      '<td>' + cell(d.insRelief, show) + '</td>' +
      '<td>' + cell(payeNet, show) + '</td>' +
      '<td>' + cell(d.net, show) + '</td>' +
      '</tr>';
  }).join('');

  const totalPayeNet = Math.max(0, totalPaye - totalRelief - totalInsRelief);

  const empKraCls  = employerKra  === 'NOT SET' ? ' class="missing"' : '';
  const empeeKraCls= employeeKra  === 'NOT SET' ? ' class="missing"' : '';
  const addrRow    = employerAddr ? '<div class="field-row"><span class="field-label">Address</span><span class="field-value">' + employerAddr + '</span></div>' : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">' +
    '<style>' +
    '@page{margin:10mm;size:landscape;}*{box-sizing:border-box;}' +
    'body{font-family:Inter,sans-serif;color:#1e293b;line-height:1.4;font-size:10px;padding:14px;}' +
    'h2,h4{margin:0;padding:0;}' +
    '.header{text-align:center;margin-bottom:12px;border-bottom:2.5px solid #1e40af;padding-bottom:8px;}' +
    '.header h2{font-size:15px;font-weight:900;color:#1e3a8a;letter-spacing:.5px;}' +
    '.header h4{font-size:10.5px;color:#475569;margin-top:3px;font-weight:600;}' +
    '.party-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}' +
    '.party-box{border:1px solid #cbd5e1;border-radius:7px;padding:9px 12px;background:#f8fafc;}' +
    '.box-title{font-size:8.5px;text-transform:uppercase;letter-spacing:.8px;font-weight:800;color:#1e40af;' +
    '  margin-bottom:5px;border-bottom:1px solid #e2e8f0;padding-bottom:3px;}' +
    '.field-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;gap:6px;}' +
    '.field-label{font-size:8.5px;text-transform:uppercase;color:#64748b;font-weight:700;white-space:nowrap;}' +
    '.field-value{font-size:10px;font-weight:700;color:#0f172a;text-align:right;}' +
    '.missing{color:#dc2626!important;}' +
    'table{width:100%;border-collapse:collapse;margin-top:4px;font-size:9px;}' +
    'th,td{border:1px solid #cbd5e1;padding:4px 5px;text-align:right;}' +
    'th{background:#1e3a8a;color:#fff;font-weight:700;font-size:8px;text-transform:uppercase;text-align:center;line-height:1.25;}' +
    'td:first-child{text-align:left;font-weight:600;}' +
    'tr:nth-child(even) td{background:#f8fafc;}' +
    '.total-row td{font-weight:800;background:#1e3a8a!important;color:#fff;border-top:2px solid #1e3a8a;}' +
    '.total-row td:first-child{color:#fff;}' +
    '.cert{margin-top:16px;border:1px solid #cbd5e1;border-radius:7px;padding:10px 14px;background:#f8fafc;}' +
    '.cert-title{font-size:8.5px;text-transform:uppercase;font-weight:800;color:#1e40af;letter-spacing:.8px;' +
    '  margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:3px;}' +
    '.cert-text{font-size:8.5px;color:#475569;margin-bottom:12px;line-height:1.6;}' +
    '.sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;}' +
    '.sig-box{text-align:center;}.sig-line{border-bottom:1px solid #64748b;height:28px;margin-bottom:3px;}' +
    '.sig-label{font-size:8px;color:#64748b;}' +
    '.footer{margin-top:10px;font-size:8px;color:#94a3b8;text-align:center;}' +
    '</style></head><body>' +

    '<div class="header" style="display:flex; align-items:center; justify-content:center; gap:20px;">' +
    '<img src="data:image/webp;base64,UklGRnoJAABXRUJQVlA4WAoAAAAQAAAAlwAAJAAAQUxQSK8HAAAB56e2bRsm0v+Hp88RkUFKBiUhf3EUpG3Aou5GRPx9dyAiIiIiIiIiIiJCtm3bhiStrCzbtm0jyna1bdsqq23btm3btm3jLaKi6xMi+j8BTqttW5bnV3wCW4AdiCQGcHd3lyH+yLcKDRqZTmUA52n/X/lyRP8ngBq2/+fb6klSe/aK6eqQzt5/9vafbdvessw6tm2kx7ZtY7a9dVk/736/tOfKubLXEf2fAEpd/76dP7x997RsrkHr7TgpXf1gbMK1Qo1Vn1/WmRfLAamrzknaPc5zLZD7xFVJCtXFWv1zSfqwcuzrdVqS9vclcspzkvRXdqybEJakZzIp8fKwpKM9YlvPsCTd7qWUMyTpctdYlntSku7xEDmtfrdB9eFhSTpe0+bLzs6uQXJ2dnZa1Kg4iBP/R94PJekdHyVc/Oqv4XB90vdI0gceS1yHgztbkbHk6IQyUaOMuXq8aOTxTf+fiZJ0rBKlrPnFOOhdLEnjLPDeG8DtDYDsbc+vDexYUGFBqBHgMmBFSrt1VbrYj650hemKOmDZEhiu7jD4mTsDwWdqzwjtqAiNbwjmzg1dH9h8ByOengTotFzdInrO0ngw7ro613/63OLiuflkHjRcSl3BBYLFkg6m2d4Owax6mBMOAdPh44N+QHUTjLusAeWaEPcqVca8JZCm6cD3y2GNj1deB7izPOVUAEHYcC4fYKOCOZsRb4fJ4yAwj5WS9Br/YTqAP3BEmmgLhTwr62MdthNrYNtRO2A8qN8YSngaUFO6+j+anaoGfDcXs6XyoNJGyJIfMzD4nRcwD8atk5gHo0ci/tvoYrSqXbKIbaVQhNdfuRm7uxPSHbjO+9xuJYwDcj9Z1wJmA6O+68s4EN/04UYA78+FscA3i2FFDVviEAhkld+3gEkyZsDoMmim2lCSjniBgUGgRoVS5UgnvbbQ9uIuEc6u3/SyAzeQfHmcFMduBQD92yT9aCNjd+Ktj33Ge+8Fbr4bmPwl8ddjPBB8apyhevCMDmNkTILRp4tHn2aO8Rww7cdk6P+WBzJL1kFSI8trId+zh6radkKS3yDoR0+pTncBxeJ4YdMeGUsID682Pp8LXYCUs/WGtLb48XWAzVkY39iqWgzjtkhMgdHFkM6TxjJY/3c1GFvUGhjqL9FkSdMt771G/Mt7mhljdwHxlbkPyPrSc5Sowz2gMBdC/rjXsWwJzAuPBb6bD2QDDz50HREghxuywP7G+okw+I4CMBkCo8cBxt8bgwiey4f6RU8ALPmwRBsk3Wz5/BNI/fz8AGDSaWBGZc+bAIV/Z4t6PwHlHhXgzIw6Nq8G7gn3g5+CUH4r0F1djQpqBe3G80AlwO75PXD8Uq6K6igrmDkJFJMOGE7f4snAM/IbAfltt5wt3PCPpCeB1MnPPzsxg+Qtb6xu1vLm0JaFy7enTX9+YjrQfyAQNWFdU9uhKwvAd/rq5iK1liuWtgTf7EfnjHv+kVUL7mkLJL3gBfKXhu5YtvjRzN6PrbYDYlYDoRtOLpnoA3lzl43oObL/SaPHsUIgq+h9zPlabDsme4hYfMz46mRFoKdmW/rrU9uMfbHsD0MzABaoHZBJuSsaYIG4Vhcl3RPBs6pcDHnV+NFn3KY8GD8d7tXZnjZSL0haHqF7eBKkO04HwO84iQMda6qpIAh6ECYI1hDeokumDr6CIEQbgJHjOGkDHWuPKo7TFvIdJyUaNhhTMd9RHbz75kDmv7r64uA4Y4ok9Yhw5wMvA83UGfDdMrDiywX+xxb6Bx3TNPgSC6hd74rD6gD0h71IVT0/y6r7+2Bop64VXijwv/iev8lX8dX+DoDv1QKisbuk4kqWo2qOXyuAOkckfV0VUvdKupJhqxbscT4ZslUHYHrT/AZww2hoCE8cAE5na91OBhj4yXxfMSwbCdnKqVMXHgjBMOi8K57aS4nKpLPST5j1pS5M0fUAdQ9J+iEj/kVJ+gr7qjrxp4ZCFdu4pmBDhtD+CWL1N122F8OU4aJssJnvzmZbQnRwv/SAZbXkcqMeN2h+StKe32Sut3k/dd3vCyErQt2SNRYEQbghzDoswYZJ64px3GNZD/2Oj+5GlOYXabWRsk9qxdv61EK9nxTxSi3b0BWOs7aoeqSZeca9dTSSmn1TasHYzZu7fU2gHjzfFRK1t2qusUYqSuOEjtjI+DrCXdhfjoOsorWkqJWxItN4YIKUA8BpodU/N4lDzfYV0++laT0QujV6yh0xap+XnqWWpDI2Kh2ynKhga7sD4KVdXv6dZ9yEZYa8HK1ba0Vud3T2laE8vFjGg4WRHogeBs2FjB+lK/WZJql+ZnkLQy0jsFb5ckk8+IJakDTo6MS8esHuRtL7m5WA+bcMQP16d5yvTjEhaLmH+pXFqtg8q9DsqO5A8ie/JFriPnvDFz3UoMznkq6DdyU1yJ5q8/wp6XbsrusWQFXXddtQsGLH3OoAqf3dvGjQzsvLs4KUvDxPVAtrhqarEpWXFw2mmXmu61Yktb/rtrc4rtsximi0V9LzSbQvlsJp/p1pFjZKN/sixGj9QFoq3FeSF8RoOeU+XcT89hyAIMk9EvzFHZJZyGGLJB8RJMl70KZADn0n2xiokjxqkMloQ6wB9G9nUQr8PQBWUDggpAEAANAJAJ0BKpgAJQA+bTaYSKQioqEiKSCADYlACsyPAbYDFAPUA3h/7VUoBsjnw9XJiXJJFzzF0XhFn4xevUl55J6r3P4XeCI3uRndf2ys6HlHs+2UHuZCOAD+/W7hA/vpZvDdLQNKnl1zKQjY4qqszU98WhAJnlM8f4QQoQYFdGUemPB8eQU1o7obL8SWVJNkgpXm19oEbIZ9+4S27sduhnrnn//H5/qj+P+ZRzVns6gX/+DKfJ3+//E7Pv79um3XuimrSnnGI9q0DKsao+RsHf4WeCkcpzffd2p6NvMACf7Y6+SXw5XFXe9Q/+DJ1ef+MoswSlFZzjnHVXzi/KG9nDv5Aedi/qvE48MZVv3yNaBazadm6rgOSiSBglBL2PHJiHLEGsz/XzNg8OrjAkSlZWn+meslkbt/1XXsT90N559Cynt/3Xf8c9XsTU7fSg6/8DfBVE/r/r8zsOUGmiLkzcNvSuws23cW5B4QHssf8Oqv+MXCUNSn9xMVXyWRFlIpZgP/HAtZIXMe9AWWYj1YyV6uz/z/+P+dyRe4YpwzVHmjbQAAAA==" alt="KRA Logo" style="height:48px;" />' +
    '<div style="text-align:center;">' +
    '<h2>TAX DEDUCTION CARD &mdash; YEAR ' + year + '</h2>' +
    '<h4>P9 FORM &nbsp;|&nbsp; Income Tax Act (Cap 470)</h4>' +
    '</div>' +
    '</div>' +

    '<div class="party-grid">' +
    '<div class="party-box">' +
    '<div class="box-title">Employer Details</div>' +
    '<div class="field-row"><span class="field-label">Name</span><span class="field-value">' + employerName + '</span></div>' +
    '<div class="field-row"><span class="field-label">KRA PIN</span><span' + empKraCls + ' class="field-value">' + employerKra + '</span></div>' +
    addrRow +
    '</div>' +

    '<div class="party-box">' +
    '<div class="box-title">Employee Details</div>' +
    '<div class="field-row"><span class="field-label">Name</span><span class="field-value">' + worker.name + '</span></div>' +
    '<div class="field-row"><span class="field-label">Employee No.</span><span class="field-value">' + staffNo + '</span></div>' +
    '<div class="field-row"><span class="field-label">Designation</span><span class="field-value">' + designation + '</span></div>' +
    '<div class="field-row"><span class="field-label">National ID</span><span class="field-value">' + employeeId + '</span></div>' +
    '<div class="field-row"><span class="field-label">KRA PIN</span><span' + empeeKraCls + ' class="field-value">' + employeeKra + '</span></div>' +
    '<div class="field-row"><span class="field-label">NSSF No.</span><span class="field-value">' + employeeNssf + '</span></div>' +
    '<div class="field-row"><span class="field-label">SHIF No.</span><span class="field-value">' + employeeShif + '</span></div>' +
    '<div class="field-row"><span class="field-label">Employment Period</span>' +
    '<span class="field-value">' + periodFrom + ' &ndash; ' + periodTo + ' ' + year + '</span></div>' +
    '</div>' +
    '</div>' +

    '<table><thead>' +
    '<tr>' +
    '<th rowspan="2">Month</th>' +
    '<th rowspan="2">Basic Salary</th>' +
    '<th rowspan="2">Benefits &amp;<br/>Non-Cash</th>' +
    '<th rowspan="2">Gross Pay<br/>(A)</th>' +
    '<th colspan="3">Allowable Deductions</th>' +
    '<th rowspan="2">Chargeable<br/>Income</th>' +
    '<th rowspan="2">PAYE Tax<br/>Charged</th>' +
    '<th colspan="2">Tax Reliefs</th>' +
    '<th rowspan="2">PAYE Tax<br/>Deducted</th>' +
    '<th rowspan="2">Net Pay</th>' +
    '</tr>' +
    '<tr>' +
    '<th>NSSF (B)</th><th>SHIF (C)</th><th>AHL (D)</th>' +
    '<th>Personal (E)</th><th>Insurance (F)</th>' +
    '</tr>' +
    '</thead><tbody>' +
    rows +
    '<tr class="total-row">' +
    '<td>TOTALS</td>' +
    '<td>' + fc(totalBasic) + '</td>' +
    '<td>' + fc(totalBenefits) + '</td>' +
    '<td>' + fc(totalGross) + '</td>' +
    '<td>' + fc(totalNssf) + '</td>' +
    '<td>' + fc(totalShif) + '</td>' +
    '<td>' + fc(totalAhl) + '</td>' +
    '<td>' + fc(totalTaxable) + '</td>' +
    '<td>' + fc(totalPaye) + '</td>' +
    '<td>' + fc(totalRelief) + '</td>' +
    '<td>' + fc(totalInsRelief) + '</td>' +
    '<td>' + fc(totalPayeNet) + '</td>' +
    '<td>' + fc(totalNet) + '</td>' +
    '</tr>' +
    '</tbody></table>' +

    '<div class="cert">' +
    '<div class="cert-title">Employer Certification</div>' +
    '<div class="cert-text">I certify that the information given in this return is correct and complete, and that the tax shown as deducted ' +
    'has been or will be duly paid to the Kenya Revenue Authority in accordance with the Income Tax Act (Cap. 470).</div>' +
    '<div class="sig-grid">' +
    '<div class="sig-box">' +
      '<img src="data:image/jpeg;base64,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" style="height:35px; object-fit:contain; margin-bottom:-4px;" />' +
      '<div class="sig-label" style="border-top:1px solid #64748b; padding-top:2px;">Authorised Signature</div>' +
    '</div>' +
    '<div class="sig-box">' +
      '<div style="height:35px; display:flex; align-items:flex-end; justify-content:center; font-weight:800; font-size:10px; color:#1e3a8a;">Chief Executive Officer</div>' +
      '<div class="sig-label" style="border-top:1px solid #64748b; padding-top:2px;">Designation / Title</div>' +
    '</div>' +
    '<div class="sig-box" style="position:relative; display:flex; flex-direction:column; align-items:center;">' +
      '<div style="position:absolute; bottom:-5px; width:100px; height:100px; transform:rotate(-8deg); opacity:0.85; filter:saturate(2.5) contrast(1.8) brightness(0.9); pointer-events:none;">' +
        '<img src="' + ADEQUATE_STAMP_BASE64 + '" alt="Stamp" style="width:100%; height:100%; display:block;" />' +
        '<div style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; font-family:\'Courier New\', Courier, monospace; font-size:5.5px; font-weight:bold; color:#dc2626; letter-spacing:-0.2px; padding-right:3px; padding-bottom:1px;">' +
          new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/ /g, '-') +
        '</div>' +
      '</div>' +
      '<div style="height:35px;"></div>' +
      '<div class="sig-label" style="border-top:1px solid #64748b; padding-top:2px; width:100%;">Date &amp; Official Stamp</div>' +
    '</div>' +
    '</div></div>' +

    '<div class="footer">' +
    '<p>System-generated P9 Tax Deduction Card &nbsp;|&nbsp; ' + employerName + ' &nbsp;|&nbsp; Generated: ' + now().split('T')[0] + '</p>' +
    '<p>This form must be issued to the employee within 30 days after year-end or upon cessation of employment &mdash; Income Tax Act Cap 470.</p>' +
    '</div>' +
    '</body></html>';
};
