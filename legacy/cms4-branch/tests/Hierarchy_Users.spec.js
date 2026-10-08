import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildHierarchy() {
  const names = [
    'Alice Carter', 'Brian Walker', 'Cynthia Reed', 'David Morgan',
    'Ethan Brooks', 'Fiona Hayes', 'George Bennett', 'Hannah Price',
    'Ian Foster', 'Julia Turner', 'Kevin Hughes', 'Laura Simmons',
    'Marcus Flynn', 'Nina Powell', 'Oscar Grant', 'Paula Reyes',
    'Quincy Ward', 'Rachel Long', 'Samuel Cox', 'Tina Wells'
  ];

  const parentMap = {
    1: null,
    2: 1, 3: 1, 4: 1,
    5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4,
    11: 5, 12: 5, 13: 6, 14: 7, 15: 7, 16: 8, 17: 9, 18: 10,
    19: 11, 20: 12
  };

  const users = names.map((name, i) => {
    const id = i + 1;
    return {
      id,
      name,
      email: name.toLowerCase().replace(' ', '.') + '@example.com',
      role: id === 1 ? 'Admin' : 'User',
      reports_to: parentMap[id],
      reportees: []
    };
  });

  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  for (const u of users) {
    if (u.reports_to !== null) byId[u.reports_to].reportees.push(u.id);
  }
  return users;
}

function depthOf(users) {
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  let max = 0;
  for (const u of users) {
    let d = 1, cur = u;
    while (cur.reports_to !== null) { cur = byId[cur.reports_to]; d++; }
    if (d > max) max = d;
  }
  return max;
}

test('generate hierarchical users and validate consistency', async () => {
  const users = buildHierarchy();
  const byId = Object.fromEntries(users.map(u => [u.id, u]));

  expect(users).toHaveLength(20);

  const admins = users.filter(u => u.role === 'Admin');
  expect(admins).toHaveLength(1);
  expect(admins[0].reports_to).toBeNull();

  for (const u of users) {
    if (u.id !== 1) {
      expect(u.role).toBe('User');
      expect(u.reports_to).not.toBeNull();
      expect(byId[u.reports_to].reportees).toContain(u.id);
    }
    for (const childId of u.reportees) {
      expect(byId[childId].reports_to).toBe(u.id);
    }
  }

  const orphans = users.filter(u => u.id !== 1 && u.reports_to === null);
  expect(orphans).toHaveLength(0);

  expect(depthOf(users)).toBeGreaterThanOrEqual(4);

  const outPath = path.join(__dirname, '..', 'data', 'hierarchy-users.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ users }, null, 2));
  console.log(`Wrote ${users.length} users to ${outPath}`);
});
