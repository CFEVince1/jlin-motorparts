const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HTML_PATH = path.join(__dirname, '../docs/design_documents.html');
const CLAUDE_DOCS = 'C:\\claude reading\\docs';
const INVENTORY_DOCS = path.join(__dirname, '../docs');

// Ensure directories exist
if (!fs.existsSync(CLAUDE_DOCS)) {
  fs.mkdirSync(CLAUDE_DOCS, { recursive: true });
}

async function exportDiagrams() {
  console.log('🚀 Launching Headless Edge to capture high-resolution diagram pictures...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--font-render-hinting=max'
    ]
  });

  const page = await browser.newPage();
  // 2.0x device scale factor and 2400px width for ultra-sharp, high-DPI retina rendering
  await page.setViewport({ width: 2400, height: 3500, deviceScaleFactor: 2.0 });

  const fileUrl = 'file://' + path.resolve(HTML_PATH).replace(/\\/g, '/');
  console.log('Loading:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for all 4 mermaid diagrams to render
  console.log('⏳ Waiting for all Mermaid diagrams to render SVGs...');
  await page.waitForFunction(() => {
    const svgs = document.querySelectorAll('.mermaid svg');
    return svgs.length >= 4;
  }, { timeout: 20000 });

  console.log('✅ All 4 diagrams rendered. Preparing high-resolution captures...');

  // Inject styles to ensure beautiful, white-background, padded card rendering for each diagram wrapper
  await page.evaluate(() => {
    const wrappers = document.querySelectorAll('.diagram-wrapper');
    wrappers.forEach((el, index) => {
      el.style.backgroundColor = '#ffffff';
      el.style.padding = '24px';
      el.style.borderRadius = '12px';
      el.style.border = '1px solid #e2e8f0';
      el.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
      el.style.marginBottom = '30px';
      el.style.display = 'inline-block';
      el.style.width = '100%';
      el.style.boxSizing = 'border-box';
    });
  });

  // Short pause to ensure layout reflow has stabilized
  await new Promise(r => setTimeout(r, 1000));

  const diagramFiles = [
    {
      index: 0,
      name: 'erd_diagram.png',
      title: '1. Entity-Relationship Diagram (ERD)'
    },
    {
      index: 1,
      name: 'dfd_level_0_context_diagram.png',
      title: '2. DFD Level 0 Context Diagram'
    },
    {
      index: 2,
      name: 'dfd_level_1_dataflow_diagram.png',
      title: '3. DFD Level 1 Subsystem Data Flow Decomposition'
    },
    {
      index: 3,
      name: 'system_architecture_diagram.png',
      title: '4. 3-Tier Cloud Physical Architecture Diagram'
    }
  ];

  const wrappers = await page.$$('.diagram-wrapper');
  console.log(`Found ${wrappers.length} diagram containers.`);

  for (const item of diagramFiles) {
    if (wrappers[item.index]) {
      console.log(`📸 Capturing "${item.title}" -> ${item.name}...`);
      const targetPathClaude = path.join(CLAUDE_DOCS, item.name);
      const targetPathInventory = path.join(INVENTORY_DOCS, item.name);

      await wrappers[item.index].screenshot({
        path: targetPathClaude,
        omitBackground: false
      });

      // Also copy to Inventory docs
      fs.copyFileSync(targetPathClaude, targetPathInventory);
      console.log(`   Saved: ${targetPathClaude}`);
      console.log(`   Saved: ${targetPathInventory}`);
    } else {
      console.warn(`⚠️ Warning: Diagram wrapper at index ${item.index} not found!`);
    }
  }

  await browser.close();
  console.log('🎉 All diagrams successfully exported as high-resolution PNG images!');
}

exportDiagrams().catch(err => {
  console.error('❌ Diagram export failed:', err);
  process.exit(1);
});
