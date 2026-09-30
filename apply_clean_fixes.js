const fs = require('fs');

const svgStamp = \<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="90" fill="none" stroke="#3b82f6" stroke-width="4" opacity="0.8"/>
  <circle cx="100" cy="100" r="82" fill="none" stroke="#3b82f6" stroke-width="1" opacity="0.8"/>
  <circle cx="100" cy="100" r="50" fill="none" stroke="#3b82f6" stroke-width="1" opacity="0.8"/>
  <path id="top-curve" d="M 24,100 A 76,76 0 0,1 176,100" fill="transparent" />
  <path id="bottom-curve" d="M 176,100 A 76,76 0 0,1 24,100" fill="transparent" />
  <text fill="#3b82f6" font-family="Arial, sans-serif" font-size="16" font-weight="bold" letter-spacing="1.5" opacity="0.9">
    <textPath href="#top-curve" startOffset="50%" text-anchor="middle">
      INTERVENTION CAPITAL LTD
    </textPath>
  </text>
  <text fill="#3b82f6" font-family="Arial, sans-serif" font-size="12" font-weight="bold" letter-spacing="2" opacity="0.9">
    <textPath href="#bottom-curve" startOffset="50%" text-anchor="middle">
      * MICRO-FINANCE *
    </textPath>
  </text>
</svg>\;
const stampBase64 = 'data:image/svg+xml;base64,' + Buffer.from(svgStamp).toString('base64');

function replaceInFile(path, replaces) {
    let content = fs.readFileSync(path, 'utf8');
    for (let r of replaces) {
        content = content.split(r[0]).join(r[1]);
    }
    fs.writeFileSync(path, content, 'utf8');
}

// 1. DashboardTab.jsx (Remove LiveClock)
replaceInFile('src/modules/dashboard/DashboardTab.jsx', [
    ['<LiveClock />', '']
]);

// 2. lms-common.jsx (Brand rename, paybill removal, new stamp)
let lmsContent = fs.readFileSync('src/lms-common.jsx', 'utf8');
// Replace stamp definition
lmsContent = lmsContent.replace(/export const INTERVENTION_STAMP_BASE64\s*=\s*['"][^'"]*['"];/g, \export const INTERVENTION_STAMP_BASE64 = '\';\);
// Fix brand text
lmsContent = lmsContent.split('Adequate Capital').join('Intervention Capital');
lmsContent = lmsContent.split('adequatecapital').join('interventioncapital');
lmsContent = lmsContent.split('ADEQUATE_LOGO_BASE64').join('INTERVENTION_LOGO_BASE64');
lmsContent = lmsContent.split('ADEQUATE_STAMP_BASE64').join('INTERVENTION_STAMP_BASE64');
// Paybill removal
lmsContent = lmsContent.split('Paybill 4166191').join('Paybill -');
lmsContent = lmsContent.split('Paybill: 4166191').join('Paybill: -');
lmsContent = lmsContent.split('Paybill: *4166191*').join('Paybill: *-*');
lmsContent = lmsContent.split('Paybill <b>4166191</b>').join('Paybill <b>-</b>');
lmsContent = lmsContent.split('Paybill: <b>4166191</b>').join('Paybill: <b>-</b>');
lmsContent = lmsContent.split('<td><b>4166191</b></td>').join('<td><b>-</b></td>');

fs.writeFileSync('src/lms-common.jsx', lmsContent, 'utf8');

// 3. Other files
replaceInFile('src/utils/generateP9Form.js', [
    ['ADEQUATE_STAMP_BASE64', 'INTERVENTION_STAMP_BASE64'],
    ['Adequate Capital', 'Intervention Capital']
]);

replaceInFile('src/utils/reportExport.js', [
    ['ADEQUATE_STAMP_BASE64', 'INTERVENTION_STAMP_BASE64'],
    ['ADEQUATE_LOGO_BASE64', 'INTERVENTION_LOGO_BASE64'],
    ['Adequate Capital', 'Intervention Capital']
]);

replaceInFile('src/components/PwaInstallPrompt.jsx', [
    ['Adequate Capital', 'Intervention Capital']
]);

replaceInFile('src/utils/shareDocsViaWhatsApp.js', [
    ['Adequate Capital', 'Intervention Capital']
]);

replaceInFile('supabase/functions/send-admin-otp/index.ts', [
    ['Adequate Capital', 'Intervention Capital']
]);

console.log("All replacements applied cleanly!");
