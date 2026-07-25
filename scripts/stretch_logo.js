import fs from 'fs';
import path from 'path';

// Define replacements per file
const fileReplacements = {
  'src/lms-core.jsx': [
    {
      find: `style={{ height: h, width: 'auto', display: 'block' }}`,
      replace: `style={{ height: h, width: h * 1.8, display: 'block' }}`
    }
  ],
  'src/lms-common.jsx': [
    {
      find: `style="height: 80px; width: auto; display: block; margin-left: auto; margin-bottom: 8px;"`,
      replace: `style="height: 80px; width: 144px; display: block; margin-left: auto; margin-bottom: 8px;"`
    },
    {
      find: `style='height: 50px; width: auto; display: block; margin-bottom: 8px;'`,
      replace: `style='height: 50px; width: 90px; display: block; margin-bottom: 8px;'`
    },
    {
      find: `style="height: 50px; width: auto; display: block; margin-bottom: 8px;"`,
      replace: `style="height: 50px; width: 90px; display: block; margin-bottom: 8px;"`
    },
    {
      find: `style="height: 40px; width: auto; display: block; margin-bottom: 10px;"`,
      replace: `style="height: 40px; width: 72px; display: block; margin-bottom: 10px;"`
    }
  ],
  'src/modules/workers/WorkerPanel.jsx': [
    {
      find: `style="height: 60px; width: auto; display: block; margin-left: auto;"`,
      replace: `style="height: 60px; width: 108px; display: block; margin-left: auto;"`
    },
    {
      find: `style="height: 70px; width: auto; display: block; margin-left: auto; margin-bottom: 4px;"`,
      replace: `style="height: 70px; width: 126px; display: block; margin-left: auto; margin-bottom: 4px;"`
    }
  ],
  'src/pages/PaymentsHub/SalariesTab.jsx': [
    {
      find: `style="height: 60px; width: auto; display: block; margin-left: auto;"`,
      replace: `style="height: 60px; width: 108px; display: block; margin-left: auto;"`
    }
  ]
};

// Apply replacements
Object.entries(fileReplacements).forEach(([filePath, replacements]) => {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(absolutePath, 'utf8');
  let originalContent = content;

  replacements.forEach(({ find, replace }) => {
    // Perform global replacement for each string pattern
    let occurrences = 0;
    while (content.includes(find)) {
      content = content.replace(find, replace);
      occurrences++;
    }
    if (occurrences > 0) {
      console.log(`Replaced ${occurrences} occurrences of pattern in ${filePath}`);
    }
  });

  if (content !== originalContent) {
    fs.writeFileSync(absolutePath, content, 'utf8');
    console.log(`Successfully updated logo aspect ratio in ${filePath}`);
  } else {
    console.log(`No changes needed or patterns not found in ${filePath}`);
  }
});

console.log('Logo stretching script executed successfully!');
