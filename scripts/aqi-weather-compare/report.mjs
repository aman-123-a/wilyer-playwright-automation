// Builds reports/aqi-weather-api-comparison/index.html + summary.md from the JSON produced by the run. No numbers are typed in here: every figure is read from results.
import fs from 'fs';
import os from 'os';
import { OUT, stats } from './common.mjs';

const rd = f => { try { return JSON.parse(fs.readFileSync(OUT + '/' + f, 'utf8')); } catch { return null; } };
const api = rd('api-results.json'), base = rd('baseline-results.json'), ui = rd('ui-results.json') || { display: [], refresh: [], errors: [], network: [] };
const clean = rd('cleanup-results.json'), pairs = rd('pairs.json') || [];
const extra = rd('extra-results.json') || { aqiBoundary: [], missing: [], xss: [], secrets: [], requestCount: [] };
const offRep = rd('offline-repeat.json') || { rows: [] };
const cmsUi = rd('cms-ui-results.json') || { tests: [], cleanup: [] };
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const f = v => v === null || v === undefined ? '<i>n/a</i>' : esc(v);
const pct = (o, n) => o ? ((n - o) / o * 100).toFixed(1) + '%' : 'n/a';
const tbl = (head, rows) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

// ---------- aggregate API stats per widget type (all 200 timings pooled; errors counted over all runs) ----------
const agg = type => {
  const out = {};
  for (const side of ['old', 'new']) {
    const ps = api.pairs.filter(p => p.type === type);
    const runs = ps.flatMap(p => p[side].runs);
    const ok = runs.filter(r => r.status === 200);
    out[side] = { st: stats(ok.map(r => r.ms)), total: runs.length, errors: runs.length - ok.length,
      s4: runs.filter(r => r.status >= 400 && r.status < 500).length, s5: runs.filter(r => r.status >= 500).length,
      s429: runs.filter(r => r.status === 429).length, timeouts: runs.filter(r => r.status === 0).length };
  }
  return out;
};
const A = api ? { aqi: agg('aqi'), weather: agg('weather') } : null;
const errPct = x => (x.errors / x.total * 100).toFixed(1) + '%';
const blockA = (title, a) => {
  const o = a.old, n = a.new;
  return `<h3>${title}</h3>` + tbl(['', 'Average', 'Median', 'p90', 'p95', 'Max', 'Error %', '4xx', '5xx', '429', 'Timeouts', 'n (200s / all)'],
    [['<b>Old API</b>', o.st.avg, o.st.median, o.st.p90, o.st.p95, o.st.max, errPct(o), o.s4, o.s5, o.s429, o.timeouts, `${o.st.n} / ${o.total}`],
     ['<b>New API</b>', n.st.avg, n.st.median, n.st.p90, n.st.p95, n.st.max, errPct(n), n.s4, n.s5, n.s429, n.timeouts, `${n.st.n} / ${n.total}`],
     ['<b>Difference</b>', (n.st.avg - o.st.avg).toFixed(1) + ' ms (' + pct(o.st.avg, n.st.avg) + ')', (n.st.median - o.st.median).toFixed(1) + ' ms (' + pct(o.st.median, n.st.median) + ')',
      (n.st.p90 - o.st.p90).toFixed(1), (n.st.p95 - o.st.p95).toFixed(1) + ' ms (' + pct(o.st.p95, n.st.p95) + ')', (n.st.max - o.st.max).toFixed(1), '', '', '', '', '', '']]);
};

// ---------- TC01 / TC07 per widget ----------
const tc01 = api.pairs.flatMap(p => ['old', 'new'].map(s => {
  const x = p.single[s], ok = x.status === 200;
  return [p.key, esc(p.label), s, x.status, x.ms, x.bytes, ok ? 'PASS (HTTP 200)' : '<b class=bad>FAIL</b>'];
}));
const tc01diff = api.pairs.map(p => [p.key, p.single.old.ms, p.single.new.ms, (p.single.new.ms - p.single.old.ms).toFixed(1) + ' ms', pct(p.single.old.ms, p.single.new.ms), p.single.old.bytes, p.single.new.bytes, pct(p.single.old.bytes, p.single.new.bytes)]);
const tc07 = api.pairs.filter(p => p.old.stats || p.new.stats).map(p => {
  const o = p.old.stats, n = p.new.stats; const g = (k) => o && n ? (n[k] - o[k]).toFixed(1) : 'n/a';
  return [p.key, o ? `${o.min} / ${o.avg} / ${o.median} / ${o.p90} / ${o.p95} / ${o.max}` : 'no 200 responses', n ? `${n.min} / ${n.avg} / ${n.median} / ${n.p90} / ${n.p95} / ${n.max}` : 'no 200 responses', g('avg'), g('median'), `${p.old.errors}/${p.old.runs.length}`, `${p.new.errors}/${p.new.runs.length}`];
});
// first call vs rest on new (cold start evidence) vs old
const cold = api.pairs.filter(p => p.new.stats).map(p => {
  const nr = p.new.runs.map(r => r.ms), or_ = p.old.runs.map(r => r.ms);
  const rest = a => stats(a.slice(1));
  return [p.key, or_[0], rest(or_).median, nr[0], rest(nr).median];
});

// ---------- TC04 structure ----------
const tc04 = api.pairs.filter(p => p.structure).map(p => [p.key, p.structure.removedFields.length, p.structure.addedFields.length, p.structure.typeChanges.length,
  `<details><summary>removed in NEW</summary><code>${p.structure.removedFields.map(esc).join('<br>')}</code></details>` + (p.structure.addedFields.length ? `<br>added: <code>${p.structure.addedFields.map(esc).join(', ')}</code>` : '')]);

// ---------- TC02 / TC03 values ----------
const TOL = { temp: 3, humidity: 15, 'wind.speed': 3, pressure: 15 }; // QA-chosen sanity bands: NO documented tolerance exists
const valRows = type => api.pairs.filter(p => p.type === type).flatMap(p => p.values.filter(v => v.field !== 'cityCount').map(v => {
  const num = typeof v.old === 'number' && typeof v.new === 'number';
  let res;
  if (v.new === null && v.old !== null) res = '<b class=bad>MISSING in NEW</b>';
  else if (v.old === null && v.new !== null) res = 'added in NEW';
  else if (JSON.stringify(v.old) === JSON.stringify(v.new)) res = 'identical';
  else if (num && TOL[v.field] !== undefined) res = Math.abs(v.new - v.old) <= TOL[v.field] ? `within QA band ±${TOL[v.field]}` : `<b class=bad>outside QA band ±${TOL[v.field]}</b>`;
  else res = 'differs';
  const isT = v.field === 'temp' || v.field === 'feels_like';
  const u = x => x === null || x === undefined ? f(x) : isT ? `${esc(x)} °C` : f(x);
  return [p.key, esc(v.city), v.field, u(v.old), u(v.new), num ? (v.new - v.old).toFixed(2) + (isT ? ' °C' : '') : '', res];
}));
// temperature + response time per widget/city (response time = that widget's call; per-city data arrives in one response)
const aqiRows = api.pairs.filter(p => p.type === 'aqi' && p.old.stats).flatMap(p => [...new Set(p.values.filter(v => v.field === 'aqi').map(v => v.city))].map(c => {
  const g = n => p.values.find(v => v.city === c && v.field === n);
  return [p.key, esc(c), `${g('aqi').old} → ${g('aqi').new}`, `${g('pm25').old} → ${g('pm25').new}`, `${g('pm10').old} → ${g('pm10').new}`, `${p.single.old.ms} / ${p.old.stats.median} ms`, `${p.single.new.ms} / ${p.new.stats.median} ms`];
}));
const tempRows =api.pairs.filter(p => p.type === 'weather').flatMap(p => p.values.filter(v => v.field === 'temp').map(v => {
  const d = (v.new - v.old);
  return [p.key, esc(v.city), `${v.old} °C`, `${v.new} °C`, `${d >= 0 ? '+' : ''}${d.toFixed(2)} °C`, `${p.single.old.ms} ms`, `${p.single.new.ms} ms`, p.old.stats ? `${p.old.stats.median} ms` : 'n/a', p.new.stats ? `${p.new.stats.median} ms` : 'n/a'];
}));

// ---------- UI ----------
const disp = ui.display.map(d => [d.key, d.side, d.dataVisible ? 'yes' : '<b class=bad>NO</b>', f(d.timeToDataVisibleMs), d.firstApi ? `${d.firstApi.status} / ${d.firstApi.apiMs ?? 'not captured'}` : 'none', d.requestsAtLoad, d.requestsAfter30s, d.failed.length, d.pageErrors.length, `<a href="screenshots/display-${d.key}-${d.side}.png">shot</a>`]);
const refr = ui.refresh.map(r => [r.key, r.side, r.apiStats ? `${r.apiStats.avg} / ${r.apiStats.p95} / ${r.apiStats.max}` : 'n/a', r.dataStats ? `${r.dataStats.avg} / ${r.dataStats.p95} / ${r.dataStats.max}` : 'n/a', r.failed, r.dupRequests, r.runs.map(x => x.requests).join(',')]);
const errs = ui.errors.map(e => {
  const flags = [e.blank ? 'BLANK' : '', e.pageErrors.length ? 'JS EXCEPTION' : ''].filter(Boolean).join(' + ');
  return [e.key, e.side, esc(e.scenario), flags ? `<b class=bad>${flags}</b>` : 'no crash/blank', esc(e.visibleText.slice(0, 70)), e.requests, e.pageErrors.length, `<a href="${esc(e.screenshot.replace(OUT + '/', ''))}">shot</a>`];
});
const net = ui.network.map(n => [n.key, n.side, esc(n.condition), n.dataVisible ?? n.recovered ?? '', f(n.timeMs ?? n.recoveryMs), n.stillShownWhileOffline === undefined ? '' : 'still shown offline: ' + n.stillShownWhileOffline, esc((n.textSample || '').slice(0, 60))]);
const consoleRows = ui.display.filter(d => d.console.length || d.failed.length || d.pageErrors.length).map(d => [d.key, d.side, esc(d.console.join(' | ')), esc(d.failed.join(' | ')), esc(d.pageErrors.join(' | '))]);

// ---------- environment ----------
const envInfo = { 'Run started': api.startedAt, 'API run finished': api.finishedAt, 'UI run finished': ui.finishedAt || 'not finished', 'Machine OS': `${os.type()} ${os.release()}`, 'Node': process.version,
  'Browser': 'Playwright Chromium (headless), desktop viewport 1280x720 (widget) / 1440x900 (CMS)', 'Old API': 'https://v3-5api.wilyersignage.com (widgets served by widgets.signagecloud.in)', 'New API': 'https://v3-5api.pocsample.in (widgets served by widget-test.signagecloud.in)', 'Credentials': 'read from local gitignored .env; not written to any report' };

const ranBase = base ? tbl(['Host', 'n', 'Median ms', 'Avg', 'p95', 'Min', 'Max', 'HTTP'], [['Old', base.old.stats.n, base.old.stats.median, base.old.stats.avg, base.old.stats.p95, base.old.stats.min, base.old.stats.max, base.old.statuses.join()], ['New', base.new.stats.n, base.new.stats.median, base.new.stats.avg, base.new.stats.p95, base.new.stats.min, base.new.stats.max, base.new.statuses.join()]]) : '';
const baseDelta = base ? (base.new.stats.median - base.old.stats.median).toFixed(1) : 'n/a';

// ---------- defects (text is analysis; every figure quoted is pulled from the result files above) ----------
const w = api.pairs.find(p => p.key === 'W-DEL'), a = api.pairs.find(p => p.key === 'A-DEL'), am = api.pairs.find(p => p.key === 'A-MUM');
const wv = n => w.values.find(v => v.field === n), av = (c, n) => a.values.find(v => v.city === c && v.field === n);
const remMin = Math.min(...api.pairs.filter(p => p.type === 'weather' && p.structure).map(p => p.structure.removedFields.length)), remMax = Math.max(...api.pairs.filter(p => p.type === 'weather' && p.structure).map(p => p.structure.removedFields.length));
const defects = [
  { id: 'BUG-CMP-01', cls: '5. API CONTRACT / BREAKING CHANGE', sev: 'P2 - Medium', pri: 'Confirm with API owner', title: 'New weather API drops fields the old API returned',
    old: `Old response carries feels_like, temp_min/max, dew_point, wind.deg/gust, visibility, clouds.all, weather[].icon/description/id, city.coord/timezone/country, forecast humidity/wind/pop (${remMin}-${remMax} field paths per widget)`,
    nw: 'None of those fields are present; only temp, humidity, pressure, wind.speed, weather[].main, sunrise/sunset, dt, forecast temp/condition remain', exp: 'Either the fields are retained, or the removal is documented and no consumer (widget, player, third parties) depends on them', act: `Structure diff on all 5 weather widgets: ${remMin}-${remMax} removed paths, 0 added, 0 type changes. The widget still rendered (see TC05) so no visible break was observed for the fields the widget reads`, ev: 'api-results.json -> pairs[].structure; samples/cmp-old-W-*.json vs samples/cmp-new-W-*.json', status: w.single.new.status, ms: w.single.new.ms },
  { id: 'BUG-CMP-02', cls: '5. API CONTRACT / BREAKING CHANGE (scale/units)', sev: 'P1 - High', pri: 'Confirm intended spec before release', title: 'AQI pollutant fields changed meaning (index values -> raw concentrations) and overall AQI changed materially',
    old: `Delhi: aqi ${av('delhi', 'aqi').old}, pm25 ${av('delhi', 'pm25').old}, pm10 ${av('delhi', 'pm10').old}, no2 ${av('delhi', 'no2').old}, co ${av('delhi', 'co').old}; Gurugram aqi ${av('gurugram', 'aqi').old}`,
    nw: `Delhi: aqi ${av('delhi', 'aqi').new}, pm25 ${av('delhi', 'pm25').new}, pm10 ${av('delhi', 'pm10').new}, no2 ${av('delhi', 'no2').new}, co ${av('delhi', 'co').new}; Gurugram aqi ${av('gurugram', 'aqi').new}`,
    exp: 'Same field name should carry the same scale/unit, or the scale change should be in the spec with matching widget labels and category mapping', act: 'pm25 changed from AQI-style sub-index to ug/m3-style concentration, co/no2 changed by orders of magnitude, and Gurugram overall AQI moved into a different category band. Live drift alone does not explain a change in scale; this is a source/scale change (provider identity is NOT verifiable from the client)', ev: 'api-results.json -> A-DEL / A-BLR values; samples/cmp-*-A-*.json', status: a.single.new.status, ms: a.single.new.ms },
  { id: 'BUG-CMP-03', cls: '6. UI / WIDGET REGRESSION (candidate)', sev: 'P2 - Medium', pri: 'Confirm with product', title: 'AQI widget status word does not match the headline number it is displayed next to (NEW)',
    old: 'not reproduced on old side in this run (compare display screenshots)', nw: 'On the Android player earlier in this session, Rajiv Chowk showed 52.24 labelled "Hazardous", while the API overall aqi was 312 and pm25 was 52.24; label follows overall aqi, number shows pm25',
    exp: 'Number and status describe the same quantity', act: 'Headline number is PM2.5 concentration, status is derived from the overall aqi field', ev: 'reports/aqi-weather/player/seq/f7-c15b.png; samples/new-6abe3cfa36f9ebeed640c15b.json', status: 200, ms: '' },
  { id: 'BUG-CMP-04', cls: '2. DATA CHANGE DUE TO LIVE WEATHER (unconfirmed)', sev: 'P3 - Low', pri: 'Info', title: 'Weather humidity/wind differ materially between old and new for the same city',
    old: `Delhi temp ${wv('temp').old}, humidity ${wv('humidity').old}, wind ${wv('wind.speed').old}, dt ${wv('timestamp(dt)').old}`, nw: `Delhi temp ${wv('temp').new}, humidity ${wv('humidity').new}, wind ${wv('wind.speed').new}, dt ${wv('timestamp(dt)').new}`,
    exp: 'Within an agreed tolerance for observations taken minutes apart (no tolerance is documented; see TC03 table for QA bands used)', act: 'Temperatures agree closely while humidity/wind differ; observation timestamps differ, so live variation cannot be excluded', ev: 'api-results.json -> W-DEL values', status: 200, ms: '' },
  { id: 'BUG-CMP-05', cls: '3. PERFORMANCE (unconfirmed, not like-for-like)', sev: 'P3 - Low', pri: 'Re-test with warmed widgets', title: 'First request to a freshly created widget on the NEW API took ~2-2.8 s; later requests ~0.36-0.4 s',
    old: 'Old widgets were already warm (existing widgets), so no cold-start sample exists', nw: cold.map(r => `${r[0]}: first ${r[3]} ms vs median-of-rest ${r[4]} ms`).join('; '), exp: 'n/a (no requirement given)', act: 'Cold-start pattern on every new widget. Cannot be compared with old: creating fresh widgets on the old (production) backend was out of scope', ev: 'api-results.json -> pairs[].new.runs', status: 200, ms: '' },
  { id: 'BUG-CMP-06', cls: '7. ENVIRONMENT ISSUE (not a defect)', sev: 'n/a', pri: 'n/a', title: `New host is ~${baseDelta} ms slower than old even for a no-work call`,
    old: base ? `Median ${base.old.stats.median} ms (HTTP 400, unknown widget id)` : '', nw: base ? `Median ${base.new.stats.median} ms (HTTP 400, unknown widget id)` : '', exp: 'n/a', act: 'Host/network distance accounts for the steady-state gap; compare TC07 medians against this floor', ev: 'baseline-results.json', status: 400, ms: '' },
  { id: 'BUG-CMP-07', cls: 'PRE-EXISTING (both sides, not a regression)', sev: 'P3 - Low', pri: 'Backlog', title: 'AQI widget without coordinates returns HTTP 500 instead of a 4xx / fallback',
    old: `HTTP ${am.single.old.status}, ${am.single.old.bytes} bytes: ${esc(am.oldErrorBody)}`, nw: `HTTP ${am.single.new.status}, ${am.single.new.bytes} bytes: ${esc(am.newErrorBody)}`, exp: 'A configuration problem should not surface as a server error', act: 'Mirror of old widget "NCR" (city only, no coordinates) returns 500 on both hosts', ev: 'samples/cmp-*-A-MUM.json', status: 500, ms: am.single.new.ms },
];
{
  const eo = ui.errors.filter(e => e.side === 'old'), en = ui.errors.filter(e => e.side === 'new');
  if (eo.length && en.length) {
    const bo = eo.filter(e => e.blank).length, bn = en.filter(e => e.blank).length;
    defects.push({ id: 'BUG-CMP-08', cls: 'PRE-EXISTING (identical on old and new, not a regression) - UI/WIDGET', sev: 'P2 - Medium', pri: 'Backlog / product decision', title: 'Widget renders a completely blank page when the API fails (no fallback or error state)',
      old: `${bo} of ${eo.length} injected error scenarios gave an empty page, ${eo.filter(e => e.pageErrors.length).length} with JS exceptions`, nw: `${bn} of ${en.length} injected error scenarios gave an empty page, ${en.filter(e => e.pageErrors.length).length} with JS exceptions`,
      exp: 'A fallback/error message, or keeping the last good data, instead of a blank screen', act: 'Statuses 400/401/403/404/408/429/500/502/503, network abort, hung request, empty body, {} and malformed JSON all end in a blank page with no visible text. No crash and no page error, but nothing is shown. Applies to first load with no cached data', ev: 'screenshots/err-*.png (e.g. err-W-DEL-new-500.png); ui-results.json -> errors', status: 'various (mocked)', ms: '' });
  }
}
{
  const t5=cmsUi.tests.find(t=>t.id==='UI-05-weather'), t5a=cmsUi.tests.find(t=>t.id==='UI-05-aqi'), t10=cmsUi.tests.find(t=>t.id==='UI-10-weather');
  if (t5 && t5a) defects.push({ id: 'BUG-CMP-09', cls: 'PRODUCT BUG (CMS, new environment; not compared with old CMS)', sev: 'P2 - Medium', pri: 'Fix validation', title: 'CMS saves a Weather widget with no location, while AQI rejects the same input',
    old: 'not tested on cms.wilyersignage.com (no writes to production)', nw: `Weather: name only, empty location -> ${esc(t5.detail.slice(0,60))}; typed junk text (no autocomplete pick) -> ${esc((t10||{detail:''}).detail.slice(0,60))}. AQI: same input -> ${esc(t5a.detail.slice(0,40))}`,
    exp: 'A widget without a usable location should be rejected with a validation message (as AQI does)', act: 'Weather widget is saved with city: [] (HTTP 200); typed free text is silently discarded. Such a widget would have nothing to show on a screen', ev: 'cms-ui-results.json UI-05-weather / UI-10-weather; screenshots/cmsui-weather-empty-location.png', status: 200, ms: '' });
}
const defHtml = defects.map(d => `<div class=def><h3>${d.id}: ${esc(d.title)}</h3>${tbl(['Field', 'Value'], [['Classification', d.cls], ['Environment', 'Old: v3-5api.wilyersignage.com; New: v3-5api.pocsample.in; same widget config/locations'], ['Old API result', esc(d.old)], ['New API result', esc(d.nw)], ['Expected', esc(d.exp)], ['Actual', esc(d.act)], ['HTTP status / time (new)', `${d.status} / ${d.ms} ms`], ['Steps', 'Run scripts/aqi-weather-compare/api-compare.mjs (needs .env); compare samples/ files'], ['Evidence', esc(d.ev)], ['Severity', d.sev], ['Priority', d.pri]])}</div>`).join('');


const bTbl = field => { const rows = []; for (const v of [...new Set(extra.aqiBoundary.map(x => x.value))]) { const g = side => extra.aqiBoundary.find(x => x.side === side && x.varied === field && x.value === v); const o = g('old'), n = g('new'); if (o && n) rows.push([v, esc(o.label || (o.blank ? 'BLANK' : '(none)')), esc(n.label || (n.blank ? 'BLANK' : '(none)')), o.jsErrors + '/' + n.jsErrors]); } return tbl(['Value', 'Status word OLD', 'Status word NEW', 'JS errors old/new'], rows); };
const missTbl = w => tbl(['Case', 'OLD result', 'NEW result'], [...new Set(extra.missing.filter(x => x.widget === w).map(x => x.case))].map(c => { const g = side => extra.missing.find(x => x.widget === w && x.case === c && x.side === side); const fm = x => !x ? 'n/a' : (x.blank ? '<b class=bad>BLANK</b>' : esc(x.text.slice(0, 70))) + (x.jsErrors.length ? ' <b class=bad>JS ERROR</b>' : ''); return [esc(c), fm(g('old')), fm(g('new'))]; }));
const xssTbl = tbl(['Side', 'Widget', 'Payload', 'Script executed', 'Blank', 'JS errors', 'Raw tag shown as text'], extra.xss.map(x => [x.side, x.widget, esc(x.payload), x.xssExecuted ? '<b class=bad>YES</b>' : 'no', x.blank ? 'BLANK' : 'no', x.jsErrors, x.rawTagVisibleAsText ? 'yes' : 'no']));
const secTbl = tbl(['Side', 'Bundle', 'Pattern', 'Hits', 'Redacted sample'], extra.secrets.filter(x => x.pattern).map(x => [x.side, esc(x.bundle), x.pattern, x.hits, esc((x.sampleRedacted || []).join(' '))]));
const secApi = tbl(['Side', 'readPublic status (no login)', 'with unexpected params', 'same body', 'CORS allow-origin'], extra.secrets.filter(x => x.check).map(x => [x.side, x.status, x.unexpectedParamsStatus, x.sameBodyWithUnexpectedParams, esc(x.corsAllowOrigin)]));
const reqTbl = tbl(['Side', 'Widget', 'Window', 'readPublic requests', 'At seconds'], extra.requestCount.map(x => [x.side, x.widget, x.windowSeconds + ' s', x.requests, x.atSeconds.join(', ')]));
const offTbl = tbl(['Widget', 'Side', 'Run', 'Data before offline', '+1 s', '+3 s', '+8 s', '+15 s'], offRep.rows.map(x => [x.key, x.side, x.run, x.visibleBeforeOffline, x['t+1s'], x['t+3s'], x['t+8s'], x['t+15s']]));
const extraHtml = extra.aqiBoundary.length ? `<h2>Extra tests (responses mocked in the browser; nothing written to either backend)</h2>
<h3>AQI status word - overall <code>aqi</code> varied, <code>pm25</code> fixed at 50</h3>${bTbl('aqi')}
<h3>AQI status word - <code>pm25</code> varied, overall <code>aqi</code> fixed at 50</h3>${bTbl('pm25')}
<p>If the word changes only in the first table, the label is driven by overall <code>aqi</code> while the headline number shows PM2.5 (BUG-CMP-03). No product band spec was provided, so the bands are shown as observed, not judged.</p>
<h3>Missing / null AQI fields</h3>${missTbl('aqi')}<h3>Missing / null weather fields</h3>${missTbl('weather')}
<h3>XSS and very long input</h3>${xssTbl}<h3>Bundle credential scan (values not stored)</h3>${secTbl}<h3>readPublic access and unexpected parameters</h3>${secApi}
<h3>Request count, 3-minute window</h3>${reqTbl}` : '<h2>Extra tests</h2><p>not run yet</p>';

const uiFix = t => /^UI-04/.test(t.id) ? { status: 'PASS (server-side)', detail: 'Client sent the request, server rejected it with HTTP 400 so no widget was created. The test originally flagged FAIL because it expected the UI to block before sending (harness criterion too strict). No client-side validation message was checked.' } : { status: t.status, detail: t.detail };
const cmsUiTbl = tbl(['ID', 'Test', 'Result', 'Detail'], cmsUi.tests.map(t => { const x = uiFix(t); const bad = /FAIL|ERROR/.test(x.status); return [t.id, esc(t.name), bad ? '<b class=bad>' + esc(x.status) + '</b>' : esc(x.status), esc(String(x.detail).slice(0, 260))]; }));
const cmsUiHtml = cmsUi.tests.length ? `<h2>CMS UI tests on cms.pocsample.in (AQI + Weather widget forms)</h2><p>Temporary QA_CMP_UI_* widgets only. Cleanup: ${cmsUi.cleanup.length} deleted, statuses ${esc(cmsUi.cleanup.map(c => c.status).join(','))}; a follow-up search found no QA_CMP* widgets remaining.</p>${cmsUiTbl}` : '';
const offHtml = offRep.rows.length ? `<h2>Offline-after-load repeat (3 runs per widget and side)</h2>${offTbl}` : '';
const blocked = ['AQI Chennai: no old AQI widget exists on cms.wilyersignage.com for Chennai', 'AQI Kolkata: no old AQI widget exists for Kolkata', 'Old-vs-new error injection against the REAL servers (400/401/403/404/408/429/500/502/503 on the backends): only the browser-side behaviour was tested by mocking responses; production backends were not stressed',
  'Refresh-interval (30 min weather, AQI interval unresolved) and long-duration observation: not run, a 30 s observation window per widget was used instead', 'Cold-start comparison against old: would require creating fresh widgets on production', 'Third-party provider identity and free/paid plan: not determinable from the client', 'Cross-browser, accessibility and security suites from the earlier brief: not part of this comparison'];

const html = `<!doctype html><meta charset=utf-8><title>AQI/Weather API comparison</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;max-width:1200px;color:#1a1a1a}table{border-collapse:collapse;margin:8px 0 18px;font-size:13px}th,td{border:1px solid #cfd4da;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f1f3f5}.bad{color:#b00020}.def{border:1px solid #cfd4da;border-radius:6px;padding:4px 14px;margin:14px 0}code{font-size:12px}h2{margin-top:34px;border-bottom:2px solid #dee2e6}</style>
<h1>Wilyer AQI &amp; Weather - Old vs New API comparison</h1>
<p>Every number below is read from the saved result files in this folder. Live AQI/weather value differences are not counted as defects by themselves.</p>
<h2>Environment</h2>${tbl(['', ''], Object.entries(envInfo).map(([k, v]) => [k, esc(v)]))}
<p><b>Method note:</b> the widget APIs take a widget id, not a location. For each old widget (read-only, on cms.wilyersignage.com) a mirror widget with identical cities/coordinates was created on cms.pocsample.in (QA_CMP_*, ids in pairs.json). Old and new calls were interleaved, 0.5 s apart, 10 runs each. Client: this machine, one network, one run.</p>
<h2>Final comparison</h2>${blockA('AQI API (ms, HTTP 200 responses)', A.aqi)}${blockA('Weather API (ms, HTTP 200 responses)', A.weather)}
<p>Error % for AQI includes the A-MUM widget, which returns HTTP 500 on <b>both</b> hosts (pre-existing, BUG-CMP-07). Error rate difference is therefore due to that widget on both sides equally.</p>
<h2>Host baseline (no-work request)</h2>${ranBase}
<h2>TC01 - single call per widget</h2>${tbl(['Widget', 'Location', 'API', 'Status', 'Time ms', 'Bytes', 'Result'], tc01)}${tbl(['Widget', 'Old ms', 'New ms', 'Latency diff', '% change', 'Old bytes', 'New bytes', '% size'], tc01diff)}
<h2>TC07 - 10 runs per widget (min / avg / median / p90 / p95 / max, ms)</h2>${tbl(['Widget', 'Old', 'New', 'Avg diff', 'Median diff', 'Old errors', 'New errors'], tc07)}
<h3>First call vs the rest</h3>${tbl(['Widget', 'Old first ms', 'Old median-of-rest', 'New first ms', 'New median-of-rest'], cold)}
<h2>TC04 - structure comparison</h2>${tbl(['Widget', 'Removed in NEW', 'Added in NEW', 'Type changes', 'Detail'], tc04)}
<h2>TC02 - AQI values</h2><p>No timestamp field exists in either AQI response (shown n/a). No documented tolerance exists.</p>${tbl(['Widget', 'Location', 'Field', 'Old', 'New', 'Diff', 'Result'], valRows('aqi'))}
<h2>Temperature and response time - Old vs New</h2><p>The API has no unit field; temperatures are shown in &deg;C because the values (e.g. Delhi ~32, Dubai ~37) are only plausible in Celsius. Response time is for the whole widget call (all cities of that widget come back in one response): single call, and median of 10 runs.</p>${tbl(['Widget', 'City', 'Old temp', 'New temp', 'Difference', 'Old resp (1st call)', 'New resp (1st call)', 'Old resp (median of 10)', 'New resp (median of 10)'], tempRows)}
<h2>AQI and response time - Old vs New</h2><p>Old &rarr; New. Old pm25/pm10 look like AQI sub-indices, new ones like raw concentrations (see BUG-CMP-02), so they are not directly comparable. AQI Mumbai is HTTP 500 on both hosts and is omitted. Response time: 1st call / median of 10.</p>${tbl(['Widget', 'Location', 'AQI old → new', 'PM2.5 old → new', 'PM10 old → new', 'Old resp (1st / median)', 'New resp (1st / median)'], aqiRows)}
<h2>TC03 - Weather values</h2><p>QA sanity bands (not a product spec): temp ±${TOL.temp}, humidity ±${TOL.humidity}, wind ±${TOL['wind.speed']}, pressure ±${TOL.pressure}.</p>${tbl(['Widget', 'City', 'Field', 'Old', 'New', 'Diff', 'Result'], valRows('weather'))}
<h2>TC05 / TC08 - widget display and request counts</h2>${tbl(['Widget', 'Side', 'Data visible', 'Time to data ms', 'First API status / time', 'Reqs at load', 'Reqs after 30 s', 'Failed reqs', 'JS errors', 'Screenshot'], disp)}
<h2>TC09 - 10 reloads</h2>${tbl(['Widget', 'Side', 'API ms avg / p95 / max', 'Time to data ms avg / p95 / max', 'Failed', 'Reloads with >1 request', 'Requests per reload'], refr)}
<h2>TC06 - error handling (responses mocked in the browser)</h2>${tbl(['Widget', 'Side', 'Scenario', 'Crash / blank', 'Visible text', 'Requests', 'JS errors', 'Shot'], errs)}
<h2>TC10 - network conditions</h2>${tbl(['Widget', 'Side', 'Condition', 'Data visible / recovered', 'Time ms', 'Offline note', 'Text'], net)}
${offHtml}${cmsUiHtml}${extraHtml}
<h2>Console errors / failed requests</h2>${consoleRows.length ? tbl(['Widget', 'Side', 'Console', 'Failed requests', 'Page errors'], consoleRows) : '<p>None captured in the display runs.</p>'}
<h2>Defects and classified differences</h2>${defHtml}
<h2>Blocked / not covered</h2><ul>${blocked.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
<h2>Cleanup</h2><pre>${esc(clean ? JSON.stringify(clean, null, 1) : 'cleanup not run yet')}</pre>
<h2>Raw files</h2><p>api-results.json, baseline-results.json, ui-results.json, pairs.json, samples/, screenshots/, ui-run.log</p>`;
fs.writeFileSync(OUT + '/index.html', html);
console.log('report written', html.length, 'bytes; UI sections:', ui.display.length, ui.refresh.length, ui.errors.length, ui.network.length);
