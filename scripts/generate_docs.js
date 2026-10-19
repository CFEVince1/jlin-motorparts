const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DOCS_DIR = path.join(__dirname, '../docs');
const MD_PATH = path.join(DOCS_DIR, 'design_documents.md');
const HTML_OUTPUT = path.join(DOCS_DIR, 'design_documents.html');
const PDF_OUTPUT = path.join(DOCS_DIR, 'design_documents.pdf');
const WORD_OUTPUT = path.join(DOCS_DIR, 'design_documents.doc');

// Read source markdown
const mdContent = fs.readFileSync(MD_PATH, 'utf8');

// Parse markdown to HTML sections
function markdownToHtml(md) {
  // Extract diagrams
  const blocks = [];
  let processed = md.replace(/```mermaid\s*([\s\S]*?)```/g, (match, code) => {
    const id = `diagram_${blocks.length}`;
    blocks.push(code.trim());
    return `<div class="diagram-wrapper"><pre class="mermaid" id="${id}">${code.trim()}</pre></div>`;
  });

  // Convert basic markdown elements
  // Headers
  processed = processed.replace(/^# (.*$)/gim, '<h1 class="doc-title">$1</h1>');
  processed = processed.replace(/^## (.*$)/gim, '<h2 class="section-title">$1</h2>');
  processed = processed.replace(/^### (.*$)/gim, '<h3 class="subsection-title">$1</h3>');
  processed = processed.replace(/^#### (.*$)/gim, '<h4 class="minor-title">$1</h4>');

  // Bold & Italics
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Horizontal rules
  processed = processed.replace(/^---$/gim, '<hr class="doc-divider"/>');

  // Tables
  const lines = processed.split('\n');
  const resultLines = [];
  let inTable = false;
  let tableHeaderParsed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHeaderParsed = false;
        resultLines.push('<div class="table-container"><table class="doc-table">');
      }

      if (line.includes('---')) {
        tableHeaderParsed = true;
        continue;
      }

      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (!tableHeaderParsed) {
        resultLines.push('<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>');
      } else {
        resultLines.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
      }
    } else {
      if (inTable) {
        resultLines.push('</tbody></table></div>');
        inTable = false;
      }
      if (line.startsWith('- ')) {
        resultLines.push(`<li class="doc-li">${line.slice(2)}</li>`);
      } else if (line.length > 0 && !line.startsWith('<')) {
        resultLines.push(`<p class="doc-p">${line}</p>`);
      } else {
        resultLines.push(line);
      }
    }
  }

  if (inTable) {
    resultLines.push('</tbody></table></div>');
  }

  return resultLines.join('\n');
}

const bodyHtml = markdownToHtml(mdContent);

const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>System Design Documents - JLIN Motorparts</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
    }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background: #f8fafc;
      margin: 0;
      padding: 40px;
    }
    .page-container {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      padding: 50px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
    }
    .doc-title {
      font-size: 2.2rem;
      color: #0f172a;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 12px;
      margin-bottom: 24px;
      font-weight: 800;
    }
    .section-title {
      font-size: 1.5rem;
      color: #1e3a8a;
      margin-top: 40px;
      margin-bottom: 16px;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 8px;
      font-weight: 700;
      page-break-after: avoid;
    }
    .subsection-title {
      font-size: 1.2rem;
      color: #2563eb;
      margin-top: 24px;
      margin-bottom: 12px;
      font-weight: 600;
      page-break-after: avoid;
    }
    .doc-p {
      color: #334155;
      font-size: 0.95rem;
      margin-bottom: 14px;
    }
    .doc-li {
      color: #334155;
      font-size: 0.92rem;
      margin-bottom: 6px;
    }
    .doc-divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 36px 0;
    }
    .diagram-wrapper {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow-x: auto;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
      page-break-inside: avoid;
    }
    .diagram-wrapper svg {
      max-width: 100% !important;
      height: auto !important;
    }
    .table-container {
      margin: 20px 0;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    .doc-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
      padding: 10px 14px;
      border: 1px solid #cbd5e1;
    }
    .doc-table td {
      padding: 10px 14px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    .doc-table tr:nth-child(even) {
      background: #f8fafc;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .page-container {
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
      .diagram-wrapper {
        border: 1px solid #cbd5e1;
        box-shadow: none;
        page-break-inside: avoid;
      }
      .section-title {
        page-break-before: always;
      }
      .section-title:first-of-type {
        page-break-before: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
      <span style="font-size: 0.85rem; font-weight: 700; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase;">Software Engineering Specification Document</span>
      <span style="font-size: 0.85rem; color: #64748b;">JLIN Motorparts Inventory & POS System</span>
    </div>

    ${bodyHtml}

    <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 0.82rem;">
      JLIN Motorparts Management & POS System &bull; Design Documents &bull; Generated October 2026
    </div>
  </div>

  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      er: {
        useMaxWidth: false
      },
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true
      }
    });
  </script>
</body>
</html>`;

fs.writeFileSync(HTML_OUTPUT, completeHtml, 'utf8');
console.log('✅ HTML documentation saved to:', HTML_OUTPUT);

async function exportPdfAndWord() {
  console.log('🚀 Launching Headless Edge browser to render diagrams and generate PDF/Word...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 2000, deviceScaleFactor: 2 });

  await page.goto('file://' + path.resolve(HTML_OUTPUT).replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // Wait for all mermaid diagrams to render into SVGs
  console.log('⏳ Waiting for all Mermaid diagrams to render...');
  await page.waitForFunction(() => {
    const svgs = document.querySelectorAll('.mermaid svg');
    return svgs.length >= 4;
  }, { timeout: 15000 });

  console.log('📸 All 4 Mermaid diagrams rendered successfully!');

  // Export PDF
  console.log('📄 Generating publication-ready PDF...');
  await page.pdf({
    path: PDF_OUTPUT,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '15mm',
      bottom: '15mm',
      left: '12mm',
      right: '12mm'
    }
  });
  console.log('✅ PDF saved to:', PDF_OUTPUT);

  // Extract fully rendered HTML with inline SVGs for Microsoft Word (.doc)
  const renderedContent = await page.evaluate(() => {
    return document.documentElement.outerHTML;
  });

  // Word-compatible HTML format with MS-Word MSO namespace headers
  const wordDocumentContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>System Design Documents - JLIN Motorparts</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
</head>
${renderedContent}
</html>`;

  fs.writeFileSync(WORD_OUTPUT, wordDocumentContent, 'utf8');
  console.log('✅ Word document (.doc) saved to:', WORD_OUTPUT);

  await browser.close();
  console.log('🎉 All documents converted successfully!');
}

exportPdfAndWord().catch(err => {
  console.error('❌ Document generation error:', err);
  process.exit(1);
});
