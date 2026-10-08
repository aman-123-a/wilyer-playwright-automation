const https = require('https');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('clickup-config.json', 'utf8'));
const token = config.apiToken;
const teamId = config.teamId;
const spaceId = config.defaultSpace.id; // CMS space

// Date range: 7 Aug 2025 to 23 Jul 2026 (Unix ms)
const DATE_FROM = new Date('2025-08-07T00:00:00Z').getTime();
const DATE_TO   = new Date('2026-07-23T23:59:59Z').getTime();

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.clickup.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse error: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getAllTasksFromList(listId, listName) {
  let page = 0;
  let allTasks = [];
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      page: page,
      include_closed: 'true',
      subtasks: 'true',
      date_created_gt: DATE_FROM,
      date_created_lt: DATE_TO,
    });
    const result = await apiGet(`/api/v2/list/${listId}/task?${params}`);
    const tasks = result.tasks || [];
    allTasks = allTasks.concat(tasks.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || 'unknown',
      priority: t.priority?.priority || 'none',
      assignees: (t.assignees || []).map(a => a.username || a.email || a.id).join(', '),
      creator: t.creator?.username || t.creator?.email || '',
      date_created: t.date_created ? new Date(parseInt(t.date_created)).toISOString().split('T')[0] : '',
      date_updated: t.date_updated ? new Date(parseInt(t.date_updated)).toISOString().split('T')[0] : '',
      url: t.url,
      list: listName,
      tags: (t.tags || []).map(tag => tag.name).join(', '),
      description: (t.description || '').substring(0, 120).replace(/\n/g, ' ')
    })));
    hasMore = tasks.length === 100;
    page++;
  }
  return allTasks;
}

async function getSpaceFolders() {
  const result = await apiGet(`/api/v2/space/${spaceId}/folder?archived=false`);
  return result.folders || [];
}

async function getSpaceLists() {
  // Lists not in folders
  const result = await apiGet(`/api/v2/space/${spaceId}/list?archived=false`);
  return result.lists || [];
}

async function getFolderLists(folderId) {
  const result = await apiGet(`/api/v2/folder/${folderId}/list?archived=false`);
  return result.lists || [];
}

async function main() {
  console.log('Fetching ClickUp workspace structure...\n');

  const allTasks = [];
  const listsSeen = new Set();

  // 1. Get all folders in the CMS space
  const folders = await getSpaceFolders();
  console.log(`Found ${folders.length} folders in CMS space`);

  for (const folder of folders) {
    console.log(`  Folder: ${folder.name} (${folder.id})`);
    const lists = await getFolderLists(folder.id);
    for (const list of lists) {
      if (listsSeen.has(list.id)) continue;
      listsSeen.add(list.id);
      console.log(`    List: ${list.name} (${list.id})`);
      const tasks = await getAllTasksFromList(list.id, `${folder.name} / ${list.name}`);
      allTasks.push(...tasks);
      console.log(`      -> ${tasks.length} tasks`);
    }
  }

  // 2. Also fetch from known lists (in case they are not in traversed folders)
  const knownLists = Object.entries(config.lists);
  for (const [name, id] of knownLists) {
    if (listsSeen.has(id)) continue;
    listsSeen.add(id);
    console.log(`  Known list: ${name} (${id})`);
    const tasks = await getAllTasksFromList(id, name);
    allTasks.push(...tasks);
    console.log(`    -> ${tasks.length} tasks`);
  }

  // Also fetch the specific list from URL: 901615652519
  const psListId = '901615652519';
  if (!listsSeen.has(psListId)) {
    listsSeen.add(psListId);
    console.log(`  PS Bugs list (901615652519)`);
    const tasks = await getAllTasksFromList(psListId, 'Prayer Schedule Bugs');
    allTasks.push(...tasks);
    console.log(`    -> ${tasks.length} tasks`);
  }

  // 3. Get space-level lists (not in folders)
  const spaceLists = await getSpaceLists();
  for (const list of spaceLists) {
    if (listsSeen.has(list.id)) continue;
    listsSeen.add(list.id);
    console.log(`  Space list: ${list.name} (${list.id})`);
    const tasks = await getAllTasksFromList(list.id, list.name);
    allTasks.push(...tasks);
    console.log(`    -> ${tasks.length} tasks`);
  }

  console.log(`\nTotal tasks fetched: ${allTasks.length}`);

  // Sort by date created
  allTasks.sort((a, b) => a.date_created.localeCompare(b.date_created));

  // Save raw JSON
  fs.writeFileSync('scripts/ps-all-tasks.json', JSON.stringify(allTasks, null, 2));
  console.log('Saved raw data to scripts/ps-all-tasks.json');

  // --- Build categorized report ---
  const categories = {
    'Android': [],
    'WebOS / LG': [],
    'Samsung': [],
    'Raspberry Pi / On-Premise': [],
    'On Premise': [],
    'Prayer Schedule': [],
    'RBAC / Group / Folder System': [],
    'Widgets / Auto Login': [],
    'CMS / General': [],
    'Other': []
  };

  function categorize(task) {
    const text = (task.name + ' ' + task.list + ' ' + task.description).toLowerCase();
    if (/android/.test(text)) return 'Android';
    if (/lg|webos/.test(text)) return 'WebOS / LG';
    if (/samsung/.test(text)) return 'Samsung';
    if (/raspberry|raspi|on.prem/.test(text)) return 'Raspberry Pi / On-Premise';
    if (/on.prim|on premise|on-premise/.test(text)) return 'On Premise';
    if (/prayer/.test(text)) return 'Prayer Schedule';
    if (/rbac|role|group|folder|permission/.test(text)) return 'RBAC / Group / Folder System';
    if (/widget|auto.login|autologin/.test(text)) return 'Widgets / Auto Login';
    if (/cms|bug|improvement|media|library|screen|playlist/.test(text)) return 'CMS / General';
    return 'Other';
  }

  for (const task of allTasks) {
    const cat = categorize(task);
    categories[cat].push(task);
  }

  // Status summary
  const statusMap = {};
  for (const task of allTasks) {
    const s = task.status;
    statusMap[s] = (statusMap[s] || 0) + 1;
  }

  // Build markdown report
  let md = `# Aman Kumar — ClickUp Work Report\n`;
  md += `**Period:** 7 Aug 2025 – 23 Jul 2026\n`;
  md += `**Space:** CMS (cms.pocsample.in / wilyer signage)\n`;
  md += `**Generated:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Total Tasks Found:** ${allTasks.length}\n\n`;

  md += `## Status Breakdown\n\n`;
  md += `| Status | Count |\n|--------|-------|\n`;
  for (const [s, c] of Object.entries(statusMap).sort((a,b) => b[1]-a[1])) {
    md += `| ${s} | ${c} |\n`;
  }

  md += `\n## Platform / Module Breakdown\n\n`;
  for (const [cat, tasks] of Object.entries(categories)) {
    if (tasks.length === 0) continue;
    md += `### ${cat} (${tasks.length} tasks)\n\n`;
    md += `| # | Task Name | List | Status | Priority | Date | Link |\n`;
    md += `|---|-----------|------|--------|----------|------|------|\n`;
    for (const [i, t] of tasks.entries()) {
      const name = t.name.length > 60 ? t.name.substring(0,57)+'...' : t.name;
      md += `| ${i+1} | ${name} | ${t.list} | ${t.status} | ${t.priority} | ${t.date_created} | [↗](${t.url}) |\n`;
    }
    md += '\n';
  }

  md += `## All Tasks — Full List\n\n`;
  md += `| # | Task | List | Status | Priority | Created | Updated | Assignees | URL |\n`;
  md += `|---|------|------|--------|----------|---------|---------|-----------|-----|\n`;
  for (const [i, t] of allTasks.entries()) {
    const name = t.name.length > 55 ? t.name.substring(0,52)+'...' : t.name;
    md += `| ${i+1} | ${name} | ${t.list} | ${t.status} | ${t.priority} | ${t.date_created} | ${t.date_updated} | ${t.assignees} | [↗](${t.url}) |\n`;
  }

  fs.writeFileSync('scripts/aman-work-report.md', md);
  console.log('Report saved to scripts/aman-work-report.md');
  console.log('\n=== QUICK SUMMARY ===');
  console.log('Total tasks:', allTasks.length);
  for (const [s, c] of Object.entries(statusMap).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${s}: ${c}`);
  }
  for (const [cat, tasks] of Object.entries(categories)) {
    if (tasks.length > 0) console.log(`  [${cat}]: ${tasks.length} tasks`);
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
