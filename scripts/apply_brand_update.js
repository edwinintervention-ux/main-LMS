import fs from 'fs';
import path from 'path';

const logoB64Path = 'public/logo_base64.txt';

if (!fs.existsSync(logoB64Path)) {
  console.error(`Error: ${logoB64Path} does not exist. Run process_logo.js first.`);
  process.exit(1);
}

const newLogoBase64 = fs.readFileSync(logoB64Path, 'utf8').trim();
console.log(`Loaded new logo base64 (length: ${newLogoBase64.length})`);

// Define list of files to update
const filesToUpdate = [
  'index.html',
  'src/components/CommandCenter.jsx',
  'src/components/Sidebar.jsx',
  'src/context/AuthContext.jsx',
  'src/modules/database/DatabaseTab.jsx',
  'src/modules/security/SecuritySettingsTab.jsx',
  'src/modules/security/SettingsTab.jsx',
  'src/modules/workers/AssetRecoveryDashboard.jsx',
  'src/modules/workers/WorkerPanel.jsx',
  'src/modules/workers/WorkersTab.jsx',
  'src/pages/PaymentsHub/SalariesTab.jsx',
  'src/lms-common.jsx',
  'src/lms-core.jsx'
];

// Perform replacements
filesToUpdate.forEach(filePath => {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(absolutePath, 'utf8');
  let originalContent = content;

  // Special cases for specific files
  if (filePath === 'index.html') {
    // Update favicon reference
    content = content.replace(
      'href="/favicon.svg"',
      'href="/favicon.png"'
    );
  }

  if (filePath === 'src/context/AuthContext.jsx') {
    // Support both admin emails for worker profile bypass
    content = content.replace(
      `userEmail !== 'admin@adequatecapital.co.ke'`,
      `userEmail !== 'admin@adequatecapital.co.ke' && userEmail !== 'admin@interventioncapital.co.ke'`
    );
  }

  if (filePath === 'src/modules/security/SettingsTab.jsx') {
    // Support both admin emails for fallback recovery email
    content = content.replace(
      `emailToReset === 'admin@adequatecapital.co.ke'`,
      `emailToReset === 'admin@adequatecapital.co.ke' || emailToReset === 'admin@interventioncapital.co.ke'`
    );
  }

  if (filePath === 'src/modules/database/DatabaseTab.jsx') {
    // Support both backup signatures
    content = content.replace(
      `!text.includes('ADEQUATE CAPITAL LMS BACKUP')`,
      `!text.includes('ADEQUATE CAPITAL LMS BACKUP') && !text.includes('INTERVENTION CAPITAL LMS BACKUP')`
    );
  }

  if (filePath === 'src/lms-common.jsx') {
    // Specifically replace the full ADEQUATE_LOGO_BASE64 definition value.
    // In lms-common.jsx, the line matches: export const ADEQUATE_LOGO_BASE64 = "data:image/png;base64,...";
    // We regex match the export statement and replace the string value.
    const logoRegex = /(export\s+const\s+INTERVENTION_LOGO_BASE64\s*=\s*")([^"]+)(")/;
    if (logoRegex.test(content)) {
      content = content.replace(logoRegex, `$1${newLogoBase64}$3`);
      console.log('Successfully updated logo base64 definition value in lms-common.jsx');
    } else {
      console.warn('Could not find INTERVENTION_LOGO_BASE64 definition in lms-common.jsx');
    }
  }

  // General branding replacements
  content = content.replace(/ADEQUATE_LOGO_BASE64/g, 'INTERVENTION_LOGO_BASE64');
  content = content.replace(/ADEQUATE_STAMP_BASE64/g, 'INTERVENTION_STAMP_BASE64');
  
  content = content.replace(/admin@adequatecapital\.co\.ke/g, 'admin@interventioncapital.co.ke');
  content = content.replace(/info@adequatecapital\.co\.ke/g, 'info@interventioncapital.co.ke');
  
  // Replace "Adequate Capital" only if not inside the code paths modified above
  // First replace company names with Ltd
  content = content.replace(/ADEQUATE CAPITAL LTD/g, 'INTERVENTION CAPITAL LTD');
  content = content.replace(/ADEQUATE CAPITAL Ltd/g, 'INTERVENTION CAPITAL LTD');
  content = content.replace(/Adequate Capital LTD/g, 'Intervention Capital LTD');
  content = content.replace(/Adequate Capital Ltd/g, 'Intervention Capital Ltd');
  
  // Standard text replacements
  content = content.replace(/Adequate Capital/g, 'Intervention Capital');
  content = content.replace(/ADEQUATE CAPITAL/g, 'INTERVENTION CAPITAL');
  content = content.replace(/Adequate<br\/>Capital/g, 'Intervention<br/>Capital');
  content = content.replace(/ADEQUATE_ADMIN/g, 'INTERVENTION_ADMIN');

  if (content !== originalContent) {
    fs.writeFileSync(absolutePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`No changes made to ${filePath}`);
  }
});

console.log('Branding update completed successfully!');
