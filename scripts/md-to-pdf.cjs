const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const md = fs.readFileSync(path.resolve('reports/api-audit/top20-api-usage-report.md'), 'utf8');

// minimal markdown -> HTML (tables, headings, lists, hr, code, bold)
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function inline(s){
  return esc(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
}
const lines = md.split('\n');
let html='', i=0, inList=false;
function closeList(){ if(inList){html+='</ul>';inList=false;} }
while(i<lines.length){
  let l=lines[i];
  if(/^\|/.test(l)){ // table block
    closeList();
    const tbl=[]; while(i<lines.length && /^\|/.test(lines[i])){tbl.push(lines[i]);i++;}
    const rows=tbl.filter(r=>!/^\|[\s:|-]+\|$/.test(r.replace(/\s/g,'')));
    html+='<table>';
    rows.forEach((r,ri)=>{
      const cells=r.split('|').slice(1,-1).map(c=>c.trim());
      const tag=ri===0?'th':'td';
      html+='<tr>'+cells.map(c=>`<${tag}>${inline(c)}</${tag}>`).join('')+'</tr>';
    });
    html+='</table>'; continue;
  }
  if(/^### /.test(l)){closeList();html+=`<h3>${inline(l.slice(4))}</h3>`;}
  else if(/^## /.test(l)){closeList();html+=`<h2>${inline(l.slice(3))}</h2>`;}
  else if(/^# /.test(l)){closeList();html+=`<h1>${inline(l.slice(2))}</h1>`;}
  else if(/^---\s*$/.test(l)){closeList();html+='<hr>';}
  else if(/^[-*] /.test(l)){ if(!inList){html+='<ul>';inList=true;} html+=`<li>${inline(l.slice(2))}</li>`;}
  else if(/^\s*$/.test(l)){closeList();}
  else {closeList();html+=`<p>${inline(l)}</p>`;}
  i++;
}
closeList();

const doc=`<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Segoe UI,Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:8px;}
h1{font-size:20px;border-bottom:3px solid #2563eb;padding-bottom:6px;color:#1e3a8a;}
h2{font-size:15px;color:#1e40af;margin-top:18px;border-bottom:1px solid #ddd;padding-bottom:3px;}
h3{font-size:13px;color:#334155;}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:9.5px;}
th{background:#1e40af;color:#fff;text-align:left;padding:5px 6px;}
td{border:1px solid #d1d5db;padding:4px 6px;}
tr:nth-child(even) td{background:#f1f5f9;}
code{background:#eef2ff;color:#3730a3;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:9px;}
hr{border:none;border-top:1px solid #cbd5e1;margin:14px 0;}
ul{margin:6px 0;padding-left:18px;}
li{margin:3px 0;}
strong{color:#0f172a;}
p{margin:6px 0;}
</style></head><body>${html}</body></html>`;

(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage();
  await p.setContent(doc,{waitUntil:'networkidle'});
  await p.pdf({path:path.resolve('reports/api-audit/top20-api-usage-report.pdf'),format:'A4',printBackground:true,margin:{top:'14mm',bottom:'14mm',left:'12mm',right:'12mm'}});
  await b.close();
  console.log('PDF written: reports/api-audit/top20-api-usage-report.pdf');
})();
