const https = require('https');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync('clickup-config.json', 'utf8'));
const token = config.apiToken;

// Map task IDs to screenshots
const attachments = [
  // PS-UI-01: no specific screenshot needed (accessibility/DOM issue)
  // PS-UI-02: no specific screenshot
  { taskId: '86d3thr6k', file: 'reports/prayer-schedule-crud-images/02-add-new-plan-blank-dates.png', label: 'PS-UI-03 - Blank Start/End dates & Custom city' },
  { taskId: '86d3thr6q', file: 'reports/prayer-schedule-crud-images/04-configure-prefilled-and-delete-covered.png', label: 'PS-UI-04 - Configure covers Delete button' },
  { taskId: '86d3thr6y', file: 'reports/prayer-schedule-crud-images/02-add-new-plan-blank-dates.png', label: 'PS-UI-05 - City shows __custom__ sentinel' },
  // Also attach general evidence to UI-01 and UI-02
  { taskId: '86d3thr6e', file: 'reports/prayer-schedule-crud-images/02-add-new-plan-blank-dates.png', label: 'PS-UI-01 - Add New Plan drawer (no label association)' },
  { taskId: '86d3thr6h', file: 'reports/prayer-schedule-crud-images/01-plan-list.png', label: 'PS-UI-02 - Plan list showing lal kurti plan with 350m banner' },
];

function uploadAttachment(taskId, filePath, label) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const boundary = '----FormBoundary' + Date.now();

    const header = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="attachment"; filename="' + filename + '"\r\n' +
      'Content-Type: image/png\r\n\r\n'
    );
    const footer = Buffer.from('\r\n--' + boundary + '--\r\n');
    const body = Buffer.concat([header, fileBuffer, footer]);

    const options = {
      hostname: 'api.clickup.com',
      path: '/api/v2/task/' + taskId + '/attachment',
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.id || result.url) {
            resolve({ taskId, filename, status: 'OK' });
          } else {
            reject(new Error('Upload error for ' + taskId + ': ' + data));
          }
        } catch (e) {
          reject(new Error('Parse error: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  for (const att of attachments) {
    try {
      const result = await uploadAttachment(att.taskId, att.file, att.label);
      console.log('ATTACHED:', result.taskId, '|', result.filename, '|', result.status);
    } catch (e) {
      console.error('FAILED:', e.message);
    }
  }
  console.log('\nDone.');
}

main();
