const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CONFIG_PATH = 'c:/Users/User/Downloads/wilyer-playwright/clickup-config.json';
const OUTPUT_PDF_PATH = 'c:/Users/User/Downloads/wilyer-playwright/scoping_report.pdf';
const OUTPUT_MD_PATH = 'c:/Users/User/Downloads/wilyer-playwright/scoping_report.md';

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function getListsInFolder(config, folderId) {
  const url = `${config.apiBaseUrl}/folder/${folderId}/list`;
  const res = await fetch(url, {
    headers: { 'Authorization': config.apiToken }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get lists: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.lists || [];
}

async function getTasksInList(config, listId) {
  const url = `${config.apiBaseUrl}/list/${listId}/task?archived=false`;
  const res = await fetch(url, {
    headers: { 'Authorization': config.apiToken }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get tasks for list ${listId}: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.tasks || [];
}

async function main() {
  try {
    const config = loadConfig();
    const folderId = config.defaultFolder.id;
    console.log(`Folder Name: ${config.defaultFolder.name} (ID: ${folderId})`);
    
    const lists = await getListsInFolder(config, folderId);
    console.log(`Found ${lists.length} lists. Fetching tasks...`);
    
    const detailedLists = [];
    const scopingTasks = [];
    
    for (const list of lists) {
      try {
        const tasks = await getTasksInList(config, list.id);
        const filtered = tasks.filter(t => t.status && t.status.status.toLowerCase() === 'scoping');
        
        detailedLists.push({
          id: list.id,
          name: list.name,
          task_count: list.task_count,
          scoping_count: filtered.length
        });
        
        filtered.forEach(t => {
          scopingTasks.push({
            listName: list.name,
            listId: list.id,
            taskId: t.id,
            name: t.name,
            status: t.status.status,
            priority: t.priority ? t.priority.priority : 'none',
            url: t.url,
            assignees: t.assignees ? t.assignees.map(a => a.username) : []
          });
        });
      } catch (err) {
        console.error(`Error processing list ${list.name}:`, err.message);
      }
    }
    
    // Build Markdown Document
    let md = `# ClickUp Scoping Report\n\n`;
    md += `**Folder:** ${config.defaultFolder.name} (ID: \`${folderId}\`)\n`;
    md += `**Date:** ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;
    
    md += `## ClickUp Lists in Folder\n\n`;
    md += `| List Name | List ID | Total Tasks | Tasks in Scoping |\n`;
    md += `| :--- | :--- | :---: | :---: |\n`;
    detailedLists.forEach(l => {
      md += `| **${l.name}** | \`${l.id}\` | ${l.task_count} | **${l.scoping_count}** |\n`;
    });
    md += `\n---\n\n`;
    
    md += `## Tasks in Scoping Status (${scopingTasks.length} Tasks)\n\n`;
    
    const groupedTasks = {};
    scopingTasks.forEach(t => {
      if (!groupedTasks[t.listName]) {
        groupedTasks[t.listName] = [];
      }
      groupedTasks[t.listName].push(t);
    });
    
    for (const [listName, tasks] of Object.entries(groupedTasks)) {
      md += `### ${listName}\n\n`;
      tasks.forEach(t => {
        const priorityStr = t.priority !== 'none' ? `**Priority:** ${t.priority.toUpperCase()}` : '';
        const assigneeStr = t.assignees.length > 0 ? `**Assignees:** ${t.assignees.join(', ')}` : '';
        const meta = [priorityStr, assigneeStr].filter(Boolean).join(' | ');
        const metaText = meta ? ` (${meta})` : '';
        md += `- [${t.name}](${t.url}) - \`#${t.taskId}\`${metaText}\n`;
      });
      md += `\n`;
    }
    
    // Save Markdown
    fs.writeFileSync(OUTPUT_MD_PATH, md, 'utf-8');
    console.log(`Saved Markdown to ${OUTPUT_MD_PATH}`);
    
    // Render PDF via Playwright
    // Simple inline Markdown converter
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      
    const lines = md.split('\n');
    let html = '';
    let inList = false;
    
    const closeList = () => {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
    };
    
    let i = 0;
    while (i < lines.length) {
      let l = lines[i];
      if (/^\|/.test(l)) {
        closeList();
        const t = [];
        while (i < lines.length && /^\|/.test(lines[i])) {
          t.push(lines[i]);
          i++;
        }
        const rows = t.filter(r => !/^\|[\s:|-]+\|$/.test(r.replace(/\s/g, '')));
        html += '<table>';
        rows.forEach((r, ri) => {
          const c = r.split('|').slice(1, -1).map(x => x.trim());
          const tg = ri === 0 ? 'th' : 'td';
          html += '<tr>' + c.map(x => `<${tg}>${inline(x)}</${tg}>`).join('') + '</tr>';
        });
        html += '</table>';
        continue;
      }
      
      if (/^### /.test(l)) {
        closeList();
        html += `<h3>${inline(l.slice(4))}</h3>`;
      } else if (/^## /.test(l)) {
        closeList();
        html += `<h2>${inline(l.slice(3))}</h2>`;
      } else if (/^# /.test(l)) {
        closeList();
        html += `<h1>${inline(l.slice(2))}</h1>`;
      } else if (/^---\s*$/.test(l)) {
        closeList();
        html += '<hr>';
      } else if (/^[-*] /.test(l)) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += `<li>${inline(l.slice(2))}</li>`;
      } else if (/^\s*$/.test(l)) {
        closeList();
      } else {
        closeList();
        html += `<p>${inline(l)}</p>`;
      }
      i++;
    }
    closeList();
    
    const doc = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>ClickUp Scoping Report</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11px;
    line-height: 1.5;
    color: #1e293b;
    padding: 15px;
  }
  h1 {
    font-size: 22px;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 8px;
    color: #1e3a8a;
    margin-top: 0;
  }
  h2 {
    font-size: 15px;
    color: #1d4ed8;
    margin-top: 20px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
  }
  h3 {
    font-size: 13px;
    color: #334155;
    margin-top: 15px;
    margin-bottom: 5px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 10px;
  }
  th {
    background: #1e40af;
    color: #ffffff;
    text-align: left;
    padding: 6px 8px;
    font-weight: 600;
  }
  td {
    border: 1px solid #e2e8f0;
    padding: 5px 8px;
    vertical-align: top;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }
  code {
    background: #f1f5f9;
    color: #0f172a;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: Consolas, monospace;
    font-size: 9px;
  }
  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 20px 0;
  }
  ul {
    margin: 6px 0;
    padding-left: 20px;
  }
  li {
    margin: 4px 0;
  }
  p {
    margin: 6px 0;
  }
  strong {
    color: #0f172a;
  }
  a {
    color: #2563eb;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
</style>
</head>
<body>
  ${html}
</body>
</html>`;
    
    console.log('Launching browser to render PDF...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(doc, { waitUntil: 'networkidle' });
    await page.pdf({
      path: path.resolve(OUTPUT_PDF_PATH),
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        bottom: '15mm',
        left: '15mm',
        right: '15mm'
      }
    });
    await browser.close();
    console.log(`PDF written successfully to ${OUTPUT_PDF_PATH}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
