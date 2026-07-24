/**
 * ClickUp Task Utility
 * Usage: node clickup.js "Task Name" "Task Description" [listName] [tag]
 * 
 * Defaults:
 *   - List: will prompt or use first available in 2026 Support Team
 *   - Tag: backlog
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'clickup-config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function getListsInFolder(config, folderId) {
  const res = await fetch(`${config.apiBaseUrl}/folder/${folderId}/list`, {
    headers: { 'Authorization': config.apiToken }
  });
  const data = await res.json();
  return data.lists || [];
}

async function createTask(config, listId, taskName, taskDescription, tags = ['backlog']) {
  const body = {
    name: taskName,
    description: taskDescription || '',
    tags: tags,
    priority: 3,
    status: 'backlog'
  };

  const res = await fetch(`${config.apiBaseUrl}/list/${listId}/task`, {
    method: 'POST',
    headers: {
      'Authorization': config.apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create task: ${res.status} - ${err}`);
  }

  return await res.json();
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node clickup.js "Task Name" "Task Description" [listName] [tag]');
    console.log('\nAvailable lists in 2026 Support Team:');
    const config = loadConfig();
    for (const [name, id] of Object.entries(config.lists)) {
      console.log(`  - ${name} (${id})`);
    }
    process.exit(0);
  }

  const config = loadConfig();
  const taskName = args[0];
  const taskDescription = args[1] || '';
  const listName = args[2] || null;
  const tag = args[3] || config.defaultTag;

  // Resolve list ID
  let listId;
  if (listName) {
    // Find matching list by name (case-insensitive partial match)
    const match = Object.entries(config.lists).find(([name]) => 
      name.toLowerCase().includes(listName.toLowerCase())
    );
    if (match) {
      listId = match[1];
      console.log(`Using list: ${match[0]}`);
    } else {
      console.error(`List "${listName}" not found. Available lists:`);
      for (const name of Object.keys(config.lists)) {
        console.log(`  - ${name}`);
      }
      process.exit(1);
    }
  } else {
    // Default to CMS Improvements
    listId = config.lists['CMS Improvements'];
    console.log('Using default list: CMS Improvements');
  }

  try {
    const task = await createTask(config, listId, taskName, taskDescription, [tag]);
    console.log('\n✅ Task Created Successfully!');
    console.log(`   Name:   ${task.name}`);
    console.log(`   ID:     ${task.id}`);
    console.log(`   URL:    ${task.url}`);
    console.log(`   Status: ${task.status?.status}`);
    console.log(`   Tags:   ${task.tags?.map(t => t.name).join(', ')}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

module.exports = { loadConfig, createTask, getListsInFolder };

main();
