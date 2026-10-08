const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MD_PATH = path.resolve('C:/Users/User/.gemini/antigravity-ide/brain/8fafe46d-4049-4c5d-8441-d42530b1fb05/aman-kumar-work-report.md');
const PDF_PATH = path.resolve('reports/aman-kumar-work-report-20260723.pdf');

function mdToHtml(md) {
  // Simple markdown → HTML converter sufficient for this report
  let html = md
    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Code block
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Bullet lists: collect consecutive lines starting with - or *
    .replace(/((?:^[-*] .+\n?)+)/gm, (match) => {
      const items = match.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
      return `<ul>${items}</ul>\n`;
    })
    // Numbered lists
    .replace(/((?:^\d+\. .+\n?)+)/gm, (match) => {
      const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>\n`;
    });

  // Tables
  html = html.replace(/((?:^\|.+\|\n)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    let tableHtml = '<table>';
    let isHeader = true;
    for (const row of rows) {
      if (/^\|[-| :]+\|$/.test(row)) { isHeader = false; continue; }
      const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (isHeader) {
        tableHtml += '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      } else {
        tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    }
    tableHtml += '</tbody></table>';
    return tableHtml;
  });

  // Paragraphs — wrap non-tagged lines
  const lines = html.split('\n');
  const result = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') { result.push(''); continue; }
    if (/^<(h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|hr|pre|blockquote|strong)/.test(trimmed)) {
      result.push(line);
    } else if (!/^<\/?(h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|hr|pre|blockquote)/.test(trimmed)) {
      result.push(`<p>${trimmed}</p>`);
    } else {
      result.push(line);
    }
  }
  return result.join('\n');
}

const md = fs.readFileSync(MD_PATH, 'utf8');
const bodyHtml = mdToHtml(md);

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Aman Kumar — ClickUp Work Report 2025–2026</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 11px;
    line-height: 1.6;
    color: #1a1a2e;
    background: #fff;
    padding: 0;
  }

  /* Cover strip */
  .cover {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
    color: white;
    padding: 36px 48px 28px;
    margin-bottom: 28px;
    border-radius: 0 0 12px 12px;
    page-break-after: avoid;
  }
  .cover h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 6px;
    color: #fff;
    border: none;
    padding: 0;
  }
  .cover .subtitle { font-size: 12px; color: #a8b2d8; margin-bottom: 14px; }
  .cover .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 16px;
  }
  .cover .meta-item { background: rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 12px; }
  .cover .meta-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #7b8db0; margin-bottom: 3px; }
  .cover .meta-value { font-size: 13px; font-weight: 600; color: #e8eaf6; }

  .content { padding: 0 48px 40px; }

  h1 { display: none; } /* covered by .cover */
  h2 {
    font-size: 15px;
    font-weight: 700;
    color: #0f3460;
    margin: 28px 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #e8edf5;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12.5px;
    font-weight: 600;
    color: #1a1a2e;
    margin: 18px 0 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    page-break-after: avoid;
  }
  h3::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 14px;
    background: linear-gradient(180deg, #e94560, #0f3460);
    border-radius: 2px;
  }
  h4 {
    font-size: 11px;
    font-weight: 600;
    color: #16213e;
    margin: 14px 0 6px;
    page-break-after: avoid;
  }

  p { margin: 6px 0 8px; color: #2d3748; }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px;
    font-size: 10px;
    page-break-inside: auto;
  }
  thead tr {
    background: linear-gradient(90deg, #0f3460, #16213e);
    color: white;
  }
  th {
    padding: 7px 10px;
    font-weight: 600;
    text-align: left;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid #edf2f7;
    vertical-align: top;
  }
  tbody tr:nth-child(even) { background: #f7fafc; }
  tbody tr:hover { background: #ebf4ff; }

  /* Status badges */
  td:nth-child(4), td:nth-child(3) {
    white-space: nowrap;
  }

  /* Links */
  a { color: #0f3460; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Code */
  code {
    font-family: 'JetBrains Mono', monospace;
    background: #f0f4f8;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9.5px;
    color: #e94560;
  }
  pre {
    background: #1a1a2e;
    color: #a8b2d8;
    padding: 14px 16px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    line-height: 1.7;
    margin: 10px 0 14px;
    overflow-x: auto;
    white-space: pre;
  }
  pre code { background: none; color: inherit; padding: 0; }

  /* Lists */
  ul, ol { padding-left: 18px; margin: 6px 0 10px; }
  li { margin-bottom: 3px; color: #2d3748; }

  /* Blockquote */
  blockquote {
    border-left: 3px solid #e94560;
    margin: 10px 0;
    padding: 8px 14px;
    background: #fff5f5;
    border-radius: 0 6px 6px 0;
    color: #555;
    font-style: italic;
  }

  hr { border: none; border-top: 1px solid #e8edf5; margin: 20px 0; }

  strong { font-weight: 600; color: #1a1a2e; }

  /* Summary cards for the top stats */
  .stat-card {
    display: inline-block;
    background: linear-gradient(135deg, #f7fafc, #edf2f7);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 16px;
    margin: 4px;
    text-align: center;
    min-width: 100px;
  }

  /* Page breaks */
  h2 { page-break-before: auto; }

  @page {
    size: A4;
    margin: 15mm 15mm 15mm 15mm;
  }

  @media print {
    body { background: white; }
    .cover { border-radius: 0; }
  }
</style>
</head>
<body>

<div class="cover">
  <h1>Aman Kumar — ClickUp Work Report</h1>
  <div class="subtitle">CMS Platform · cms.pocsample.in / Wilyer Signage · Live API Pull</div>
  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-label">Period</div>
      <div class="meta-value">Aug 7, 2025 – Jul 23, 2026</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Total Tasks</div>
      <div class="meta-value">1,723</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Shipped / Done</div>
      <div class="meta-value">~783 (45%)</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Platforms</div>
      <div class="meta-value">Android · LG · Samsung · RPi · On-Prem</div>
    </div>
  </div>
</div>

<div class="content">
${bodyHtml}
</div>

</body>
</html>`;

fs.writeFileSync('scripts/aman-report.html', fullHtml);
console.log('HTML written. Launching browser for PDF...');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'networkidle' });
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '12mm', left: '10mm', right: '10mm' }
  });
  await browser.close();
  const stats = fs.statSync(PDF_PATH);
  console.log(`PDF saved: ${PDF_PATH}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
})();
