import fs from 'fs';

let content = fs.readFileSync('src/lms-common.jsx', 'utf8');

// Replace standard colors across all themes
content = content.replace(/--accent: #[0-9A-Fa-f]+;/g, '--accent: #2E7D32;');
content = content.replace(/--a-lo: #[0-9A-Fa-f]{6,8};/g, '--a-lo: #2E7D3215;');
content = content.replace(/--a-mid: #[0-9A-Fa-f]{6,8};/g, '--a-mid: #2E7D3230;');
content = content.replace(/--a-lo: rgba\([^)]+\);/g, '--a-lo: rgba(46, 125, 50, 0.15);');
content = content.replace(/--a-mid: rgba\([^)]+\);/g, '--a-mid: rgba(46, 125, 50, 0.3);');

content = content.replace(/--gold: #[0-9A-Fa-f]+;/g, '--gold: #C49A2C;');
content = content.replace(/--g-lo: #[0-9A-Fa-f]{6,8};/g, '--g-lo: #C49A2C15;');
content = content.replace(/--g-lo: rgba\([^)]+\);/g, '--g-lo: rgba(196, 154, 44, 0.15);');

content = content.replace(/--warn: #[0-9A-Fa-f]+;/g, '--warn: #C49A2C;');
content = content.replace(/--w-lo: #[0-9A-Fa-f]{6,8};/g, '--w-lo: #C49A2C15;');
content = content.replace(/--w-lo: rgba\([^)]+\);/g, '--w-lo: rgba(196, 154, 44, 0.15);');

// Replace dark texts to brand dark blue
content = content.replace(/--txt: #0F172A;/g, '--txt: #0D1B2A;');
content = content.replace(/--txt: #1E293B;/g, '--txt: #0D1B2A;'); // if any

// Replace string instances
content = content.replace(/Adequate Capital/g, 'Intervention Capital');
content = content.replace(/adequatecapital/g, 'interventioncapital');
content = content.replace(/'Adequate'/g, "'Intervention'");

// Replace Base64 logo
const INTERVENTION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
  <rect x="250" y="50" width="15" height="40" fill="#0D1B2A" />
  <rect x="270" y="30" width="15" height="60" fill="#0D1B2A" />
  <rect x="290" y="10" width="15" height="80" fill="#0D1B2A" />
  <path d="M 230 80 Q 275 120 320 40 L 330 50 L 320 20 L 290 30 L 300 40 Q 275 100 240 70 Z" fill="#2E7D32" />
  <text x="300" y="160" font-family="Inter, sans-serif" font-weight="900" font-size="64" fill="#0D1B2A" text-anchor="middle" letter-spacing="-2">INTERVENTION</text>
  <text x="300" y="190" font-family="Inter, sans-serif" font-weight="600" font-size="24" fill="#2E7D32" text-anchor="middle" letter-spacing="8">CAPITAL</text>
</svg>`;

const b64 = "data:image/svg+xml;base64," + Buffer.from(INTERVENTION_SVG).toString('base64');
content = content.replace(/export const ADEQUATE_LOGO_BASE64 = "[^"]*";/, `export const ADEQUATE_LOGO_BASE64 = "${b64}";`);

fs.writeFileSync('src/lms-common.jsx', content);

let core = fs.readFileSync('src/lms-core.jsx', 'utf8');
core = core.replace(/Adequate Capital/g, 'Intervention Capital');
core = core.replace(/adequatecapital/g, 'interventioncapital');
core = core.replace(/'Adequate'/g, "'Intervention'");
core = core.replace(/"Adequate"/g, '"Intervention"');
fs.writeFileSync('src/lms-core.jsx', core);

console.log("Replacements complete.");
