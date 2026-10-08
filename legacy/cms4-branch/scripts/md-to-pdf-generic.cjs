const fs=require('fs'),path=require('path');const{chromium}=require('playwright');
const src=process.argv[2],out=process.argv[3];
const md=fs.readFileSync(path.resolve(src),'utf8');
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const inline=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/_([^_]+)_/g,'<em>$1</em>');
const lines=md.split('\n');let html='',i=0,inList=false;const cl=()=>{if(inList){html+='</ul>';inList=false;}};
while(i<lines.length){let l=lines[i];
 if(/^\|/.test(l)){cl();const t=[];while(i<lines.length&&/^\|/.test(lines[i])){t.push(lines[i]);i++;}
  const rows=t.filter(r=>!/^\|[\s:|-]+\|$/.test(r.replace(/\s/g,'')));html+='<table>';
  rows.forEach((r,ri)=>{const c=r.split('|').slice(1,-1).map(x=>x.trim());const tg=ri===0?'th':'td';html+='<tr>'+c.map(x=>`<${tg}>${inline(x)}</${tg}>`).join('')+'</tr>';});html+='</table>';continue;}
 if(/^> /.test(l)){cl();html+=`<blockquote>${inline(l.slice(2))}</blockquote>`;}
 else if(/^### /.test(l)){cl();html+=`<h3>${inline(l.slice(4))}</h3>`;}
 else if(/^## /.test(l)){cl();html+=`<h2>${inline(l.slice(3))}</h2>`;}
 else if(/^# /.test(l)){cl();html+=`<h1>${inline(l.slice(2))}</h1>`;}
 else if(/^---\s*$/.test(l)){cl();html+='<hr>';}
 else if(/^\d+\. /.test(l)){cl();html+=`<p class=ol>${inline(l)}</p>`;}
 else if(/^[-*] /.test(l)){if(!inList){html+='<ul>';inList=true;}html+=`<li>${inline(l.slice(2))}</li>`;}
 else if(/^\s*$/.test(l)){cl();}
 else{cl();html+=`<p>${inline(l)}</p>`;}
 i++;}
cl();
const doc=`<!doctype html><html><head><meta charset=utf-8><style>
body{font-family:Segoe UI,Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:8px;}
h1{font-size:20px;border-bottom:3px solid #2563eb;padding-bottom:6px;color:#1e3a8a;}
h2{font-size:15px;color:#1e40af;margin-top:16px;border-bottom:1px solid #ddd;padding-bottom:3px;}
h3{font-size:12.5px;color:#334155;margin-bottom:2px;}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:9.5px;}
th{background:#1e40af;color:#fff;text-align:left;padding:5px 6px;}
td{border:1px solid #d1d5db;padding:4px 6px;vertical-align:top;}
tr:nth-child(even) td{background:#f1f5f9;}
code{background:#eef2ff;color:#3730a3;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:9px;}
blockquote{border-left:4px solid #94a3b8;background:#f8fafc;margin:8px 0;padding:6px 10px;color:#334155;}
hr{border:none;border-top:1px solid #cbd5e1;margin:12px 0;}
ul{margin:4px 0;padding-left:18px;}li{margin:2px 0;}
p.ol{margin:3px 0;}strong{color:#0f172a;}
</style></head><body>${html}</body></html>`;
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.setContent(doc,{waitUntil:'networkidle'});
await p.pdf({path:path.resolve(out),format:'A4',printBackground:true,margin:{top:'14mm',bottom:'14mm',left:'12mm',right:'12mm'}});
await b.close();console.log('PDF written: '+out);})();
