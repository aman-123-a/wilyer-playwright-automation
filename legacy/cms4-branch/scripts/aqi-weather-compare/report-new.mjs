// Builds reports/aqi-weather-pocsample/index.html: results for cms.pocsample.in ONLY (no old-host data, no old-vs-new bugs).
// Every figure is read from result files collected in earlier runs and filtered to the new side.
import fs from 'fs';
import os from 'os';
import { stats } from './common.mjs';

const SRC = 'reports/aqi-weather-api-comparison', OUT = 'reports/aqi-weather-pocsample';
fs.mkdirSync(OUT, { recursive: true });
const rd = f => { try { return JSON.parse(fs.readFileSync(SRC + '/' + f, 'utf8')); } catch { return null; } };
const api = rd('api-results.json'), base = rd('baseline-results.json'), ui = rd('ui-results.json') || {}, extra = rd('extra-results.json') || {},
  cms = rd('cms-ui-results.json') || { tests: [], cleanup: [] }, off = rd('offline-repeat.json') || { rows: [] };
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const tbl = (h, rows) => `<table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const bad = s => `<b class=bad>${s}</b>`;
const newSide = a => (a || []).filter(x => x.side === 'new');

// ---- API timings (new only)
const np = api.pairs;                                  // each pair has .new
const wt = t => { const runs = np.filter(p => p.type === t).flatMap(p => p.new.runs); const ok = runs.filter(r => r.status === 200); return { st: stats(ok.map(r => r.ms)), total: runs.length, err: runs.length - ok.length, s5: runs.filter(r => r.status >= 500).length, s4: runs.filter(r => r.status >= 400 && r.status < 500).length }; };
const W = wt('weather'), A = wt('aqi');
const aggRow = (n, x) => [n, x.st.avg, x.st.median, x.st.p90, x.st.p95, x.st.max, ((x.err / x.total) * 100).toFixed(1) + '%', x.s4, x.s5, `${x.st.n} / ${x.total}`];
const perWidget = np.map(p => [p.key, esc(p.label), p.new.stats ? `${p.single.new.status}` : p.single.new.status, p.single.new.ms, p.single.new.bytes,
  p.new.stats ? `${p.new.stats.min} / ${p.new.stats.avg} / ${p.new.stats.median} / ${p.new.stats.p90} / ${p.new.stats.p95} / ${p.new.stats.max}` : 'no 200 responses', `${p.new.errors}/${p.new.runs.length}`,
  p.new.stats ? stats(p.new.runs.slice(1).filter(r => r.status === 200).map(r => r.ms)).median : 'n/a']);

// ---- structure of the new response (required fields present in every 200 response)
const paths = (o, p = '', s = new Set()) => { if (Array.isArray(o)) o.slice(0, 1).forEach(x => paths(x, p + '[]', s)); else if (o && typeof o === 'object') for (const k in o) paths(o[k], p + '.' + k, s); else s.add(p + ':' + (o === null ? 'null' : typeof o)); return s; };
const structFor = type => { const sets = np.filter(p => p.type === type && p.new.stats).map(p => { try { return paths(JSON.parse(fs.readFileSync(`${SRC}/samples/cmp-new-${p.key}.json`, 'utf8'))); } catch { return null; } }).filter(Boolean); if (!sets.length) return []; return [...sets[0]].filter(k => sets.every(s => s.has(k)) && !/^\.(data|path|_id|folderId)/.test(k)); };
const wStruct = structFor('weather'), aStruct = structFor('aqi');

// ---- weather / AQI values (new)
const wVals = np.filter(p => p.type === 'weather').flatMap(p => p.values.filter(v => v.field === 'temp').map(v => {
  const g = f => p.values.find(x => x.city === v.city && x.field === f)?.new;
  return [p.key, esc(v.city), `${v.new} °C`, g('humidity') ?? 'n/a', g('wind.speed') ?? 'n/a', g('pressure') ?? 'n/a', esc(g('condition') ?? 'n/a'), `${g('sunrise')} / ${g('sunset')}`, g('forecast.length') ?? 'n/a', g('timestamp(dt)') ?? 'n/a', `${p.single.new.ms} ms / ${p.new.stats.median} ms`];
}));
const aVals = np.filter(p => p.type === 'aqi' && p.new.stats).flatMap(p => [...new Set(p.values.filter(v => v.field === 'aqi').map(v => v.city))].map(c => {
  const g = f => p.values.find(x => x.city === c && x.field === f)?.new;
  return [p.key, esc(c), g('aqi'), g('pm25'), g('pm10'), g('o3'), g('no2'), g('so2'), g('co'), g('nh3'), 'none in response', `${p.single.new.ms} ms / ${p.new.stats.median} ms`];
}));

// ---- display / reload / errors / network (new side only)
const disp = newSide(ui.display).map(d => [d.key, d.dataVisible ? 'yes' : bad('NO'), d.timeToDataVisibleMs ?? 'n/a', d.firstApi?.status ?? 'none', d.requestsAtLoad, d.requestsAfter30s, d.failed.length, d.pageErrors.length, `<a href="../aqi-weather-api-comparison/screenshots/display-${d.key}-new.png">shot</a>`]);
const refr = newSide(ui.refresh).map(r => [r.key, r.apiStats ? `${r.apiStats.avg} / ${r.apiStats.p95} / ${r.apiStats.max}` : 'n/a', r.dataStats ? `${r.dataStats.avg} / ${r.dataStats.p95} / ${r.dataStats.max}` : 'n/a', r.failed, r.runs.map(x => x.requests).join(',')]);
const errs = newSide(ui.errors).map(e => [e.key, esc(e.scenario), e.blank ? bad('BLANK PAGE') : 'text shown', e.pageErrors.length, `<a href="../aqi-weather-api-comparison/${esc(e.screenshot.replace('reports/aqi-weather-api-comparison/', ''))}">shot</a>`]);
const netRows = newSide(ui.network).map(n => [n.key, esc(n.condition), n.dataVisible ?? n.recovered, n.timeMs ?? n.recoveryMs, n.stillShownWhileOffline === undefined ? '' : String(n.stillShownWhileOffline)]);
const offRows = off.rows.filter(r => r.side === 'new').map(r => [r.key, r.run, r.visibleBeforeOffline, r['t+1s'], r['t+3s'], r['t+8s'], r['t+15s']]);
const offBlank = off.rows.filter(r => r.side === 'new' && !r['t+15s']).length + newSide(ui.network).filter(n => n.stillShownWhileOffline === false).length;
const offTotal = off.rows.filter(r => r.side === 'new').length + newSide(ui.network).filter(n => n.stillShownWhileOffline !== undefined).length;

// ---- extra (mocked in browser, new side)
const bandRows = field => [...new Set((extra.aqiBoundary || []).map(x => x.value))].map(v => { const x = extra.aqiBoundary.find(y => y.side === 'new' && y.varied === field && y.value === v); return [v, x ? esc(x.label || (x.blank ? 'BLANK' : '(none)')) : '']; });
const missRows = w => [...new Set((extra.missing || []).filter(x => x.widget === w).map(x => x.case))].map(c => { const x = (extra.missing || []).find(y => y.widget === w && y.case === c && y.side === 'new'); return x ? [esc(c), x.blank ? bad('BLANK PAGE') : esc(x.text.slice(0, 80)), x.jsErrors.length] : null; }).filter(Boolean);
const xssRows = newSide(extra.xss).map(x => [x.widget, esc(x.payload), x.xssExecuted ? bad('EXECUTED') : 'not executed', x.blank ? bad('BLANK') : 'rendered', x.rawTagVisibleAsText ? 'shown as plain text' : '-']);
const secRows = newSide(extra.secrets).filter(x => x.pattern).map(x => [esc(x.bundle), x.pattern, x.hits]);
const secApi = newSide(extra.secrets).filter(x => x.check).map(x => [x.status, x.unexpectedParamsStatus, String(x.sameBodyWithUnexpectedParams), esc(x.corsAllowOrigin)]);
const reqRows = newSide(extra.requestCount).map(x => [x.widget, `${x.windowSeconds} s`, x.requests, esc((x.statuses || []).join(',')), x.atSeconds.join(', ')]);
const cmsRows = cms.tests.map(t => { const fix = /^UI-04/.test(t.id); const st = fix ? 'PASS (server-side)' : t.status; const dt = fix ? 'Client sent the request, server rejected with HTTP 400; no widget created (original test criterion expected the UI to block first).' : t.detail; return [t.id, esc(t.name), /FAIL|ERROR/.test(st) ? bad(esc(st)) : esc(st), esc(String(dt).slice(0, 230))]; });
const cmsConsole = cms.tests.find(t => t.id === 'UI-99');

// ---- bugs (new environment only)
const ev = (a, b) => a && b ? `${a}` : '';
const firstCalls = np.filter(p => p.new.stats).map(p => `${p.key}: ${p.single.new.ms} ms vs median ${stats(p.new.runs.slice(1).filter(r => r.status === 200).map(r => r.ms)).median} ms`).join('; ');
const am = np.find(p => p.key === 'A-MUM');
const bugs = [
  ['PS-01', 'P2', 'UI / data', 'AQI status word does not follow the headline number', 'Headline number is PM2.5, but the status word is driven by the overall `aqi` field. Mocked boundary test: varying pm25 from 0 to 999.5 never changed the word (always "Good"); varying aqi moved it through Good / Moderate / Watch Level / Unhealthy / Very Unhealthy / Hazardous. Real example on the player: Rajiv Chowk showed 52.24 labelled "Hazardous" (API aqi 312, pm25 52.24).', 'extra-results.json aqiBoundary; reports/aqi-weather/player/seq/f7-c15b.png'],
  ['PS-02', 'P2', 'UI', 'Widget shows a completely blank page on any API failure', `${newSide(ui.errors).filter(e => e.blank).length} of ${newSide(ui.errors).length} injected scenarios (400/401/403/404/408/429/500/502/503, network abort, hung request, empty body, {} , malformed JSON) ended in an empty page for Weather and AQI. No fallback text, no JS error.`, 'ui-results.json errors; screenshots/err-*-new-*.png'],
  ['PS-03', 'P2', 'CMS', 'Weather widget can be saved with no location; AQI rejects the same input', (() => { const a = cms.tests.find(t => t.id === 'UI-05-weather'), b = cms.tests.find(t => t.id === 'UI-05-aqi'), c = cms.tests.find(t => t.id === 'UI-10-weather'); return `Name only, empty location: Weather -> ${esc((a?.detail || '').slice(0, 40))}; AQI -> ${esc((b?.detail || '').slice(0, 40))}. Typed junk text (no autocomplete pick) on Weather -> ${esc((c?.detail || '').slice(0, 40))}, text silently discarded, saved with city: [].`; })(), 'cms-ui-results.json UI-05, UI-10'],
  ['PS-04', 'P2', 'UI / data', 'AQI widget shows "Hazardous" when the aqi value is missing, "Good" when it is null', 'Mocked responses: aqi missing -> "Hazardous"; aqi = "abc" -> "Hazardous"; aqi = null -> "Good"; aqi = -1 -> "Good". Absent or invalid data is presented as a health status.', 'extra-results.json missing'],
  ['PS-05', 'P3', 'UI', 'Missing or null AQI PM2.5 is displayed as 0', 'pm25 null, pm25 object missing, iaqi {} and iaqi missing all render "0" instead of n/a.', 'extra-results.json missing'],
  ['PS-06', 'P3', 'UI', 'Weather widget goes blank when wind or todayData is missing', 'Mocked response without `wind` or without `todayData` produced an empty page (whole widget lost for one missing block). Missing humidity just drops that row; weather[] empty renders without the condition.', 'extra-results.json missing'],
  ['PS-07', 'P3', 'UI', 'Weather shows "° C" with no number when temp is null or missing', 'Temperature value is blank but the unit is still drawn.', 'extra-results.json missing'],
  ['PS-08', 'P3', 'UI', 'Weather widget blank with a 5000-character city name', 'Single run, mocked response. AQI rendered. Needs a repeat to confirm.', 'extra-results.json xss'],
  ['PS-09', 'P3', 'CMS', 'Weather widget name has no length limit', 'A 600-character name was accepted (HTTP 200). AQI blocked the same input in the UI.', 'cms-ui-results.json UI-12-weather'],
  ['PS-10', 'P3', 'API', 'AQI widget without coordinates returns HTTP 500 from readPublic', am ? `HTTP ${am.single.new.status}, ${am.single.new.bytes} bytes (${esc(am.newErrorBody)}). Reachable only if a widget is created without coordinates (the CMS form rejects it with 400), so low exposure.` : '', 'api-results.json A-MUM'],
  ['PS-11', 'P3', 'Data', 'PM2.5 equals PM10 exactly for "Wilyer Private Limited"', 'Both 157.86 in the readPublic response for the AQI widget on the player (looks like one value copied to the other).', 'samples/new-6abe3cfa36f9ebeed640c15b.json'],
  ['PS-12', 'P3', 'Performance', 'First call to a freshly created widget is slow (about 2.0 to 2.8 s)', `Every new widget: ${firstCalls}. Later calls settle at about 0.36 to 0.42 s. Cause unconfirmed (probably cold cache).`, 'api-results.json'],
  ['PS-13', 'P3', 'UI, intermittent', 'Widget went blank after the network dropped', `${offBlank} of ${offTotal} offline-after-load checks ended blank (the rest kept their data). Consistent with PS-02 (a failed refresh blanks the widget) hitting a timing window.`, 'offline-repeat.json; ui-results.json network'],
  ['PS-14', 'Info', 'Traffic', 'AQI widget polls the API about every 10 s per widget; weather only twice in 3 minutes', `AQI: ${(newSide(extra.requestCount).find(x => x.widget === 'aqi') || {}).requests} requests in 180 s (about 5.8 per minute per widget). Weather: ${(newSide(extra.requestCount).find(x => x.widget === 'weather') || {}).requests}. Every widget also makes 2 requests on first load. Worth confirming 10 s is intended.`, 'extra-results.json requestCount'],
];

const html = `<!doctype html><meta charset=utf-8><title>AQI/Weather - cms.pocsample.in</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;max-width:1200px;color:#1a1a1a}table{border-collapse:collapse;margin:8px 0 18px;font-size:13px}th,td{border:1px solid #cfd4da;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f1f3f5}.bad{color:#b00020}h2{margin-top:34px;border-bottom:2px solid #dee2e6}code{font-size:12px}</style>
<h1>Wilyer AQI &amp; Weather widgets - cms.pocsample.in test report</h1>
<p>Scope: <b>cms.pocsample.in only</b> (CMS UI and its API <code>v3-5api.pocsample.in</code>, widget player pages on <code>widget-test.signagecloud.in</code>). No old-host data is used. Every number is read from saved result files; nothing is estimated.</p>
<h2>Environment</h2>${tbl(['', ''], [['Run date', esc(api.startedAt)], ['Machine', esc(`${os.type()} ${os.release()}`)], ['Browser', 'Playwright Chromium, headless'], ['Network', 'one office connection, single run'], ['Credentials', 'local gitignored .env, not in any report'],
  ['Test data', '8 + 2 + 7 temporary QA_CMP_* widgets created and deleted by id; a final search found none left'], ['Locations', 'Delhi, Mumbai, Bengaluru, Chennai, Kolkata (+ Gurugram, Jaipur, Visakhapatnam, Dubai in multi-city widgets); AQI Chennai/Kolkata not tested']])}
<h2>Bug list</h2>${tbl(['ID', 'Sev', 'Area', 'Bug', 'Evidence summary', 'Files'], bugs.map(b => [b[0], b[1], b[2], esc(b[3]), b[4], esc(b[5])]))}
<h2>API response time (readPublic, 10 runs per widget, 0.5 s apart)</h2>${tbl(['', 'Avg ms', 'Median', 'p90', 'p95', 'Max', 'Error %', '4xx', '5xx', 'n 200 / all'], [aggRow('Weather', W), aggRow('AQI (incl. A-MUM, which is HTTP 500)', A)])}
${tbl(['Widget', 'Location', 'Status', '1st call ms', 'Bytes', 'min / avg / median / p90 / p95 / max', 'Errors', 'Median excl. 1st call'], perWidget)}
${base ? `<p>Host floor for a no-work request (unknown id, HTTP 400): median ${base.new.stats.median} ms, p95 ${base.new.stats.p95} ms, n=${base.new.stats.n}.</p>` : ''}
<h2>Response structure (fields present in every 200 response)</h2><details><summary>Weather (${wStruct.length} field paths)</summary><code>${wStruct.map(esc).join('<br>')}</code></details><details><summary>AQI (${aStruct.length} field paths)</summary><code>${aStruct.map(esc).join('<br>')}</code></details>
<p>Note: neither AQI nor weather response carries a unit field. Temperatures are shown in &deg;C because the values are only plausible in Celsius. The AQI response has no timestamp.</p>
<h2>Weather data returned</h2>${tbl(['Widget', 'City', 'Temp', 'Humidity', 'Wind speed', 'Pressure', 'Condition', 'Sunrise / sunset', 'Forecast entries', 'dt', 'Resp 1st call / median'], wVals)}
<h2>AQI data returned</h2>${tbl(['Widget', 'Location', 'AQI', 'PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO', 'NH3', 'Timestamp', 'Resp 1st call / median'], aVals)}
<h2>Widget display and request counts</h2>${tbl(['Widget', 'Data visible', 'Time to data ms', 'API status', 'Requests at load', 'Requests after 30 s', 'Failed requests', 'JS errors', 'Shot'], disp)}
<h2>10 reloads</h2>${tbl(['Widget', 'API ms avg / p95 / max', 'Time to data ms avg / p95 / max', 'Failed', 'Requests per reload'], refr)}
<h2>Request count, 3-minute window</h2>${tbl(['Widget', 'Window', 'readPublic requests', 'Statuses', 'At seconds'], reqRows)}
<h2>Error handling (responses mocked in the browser)</h2>${tbl(['Widget', 'Scenario', 'Result', 'JS errors', 'Shot'], errs)}
<h2>Network conditions</h2>${tbl(['Widget', 'Condition', 'Data visible / recovered', 'Time ms', 'Still shown while offline'], netRows)}
<h3>Offline-after-load repeat</h3>${tbl(['Widget', 'Run', 'Data before offline', '+1 s', '+3 s', '+8 s', '+15 s'], offRows)}
<h2>AQI status word bands (mocked values)</h2><p>Left: overall <code>aqi</code> varied (pm25 fixed 50). Right: <code>pm25</code> varied (aqi fixed 50).</p>${tbl(['aqi value', 'Status word'], bandRows('aqi'))}${tbl(['pm25 value', 'Status word'], bandRows('pm25'))}
<h2>Missing / null fields - AQI</h2>${tbl(['Case', 'Rendered', 'JS errors'], missRows('aqi'))}
<h2>Missing / null fields - Weather</h2>${tbl(['Case', 'Rendered', 'JS errors'], missRows('weather'))}
<h2>XSS and very long input</h2>${tbl(['Widget', 'Payload', 'Script', 'Page', 'Tag display'], xssRows)}
<h2>Security checks</h2><p>Widget bundle credential scan (values never stored):</p>${tbl(['Bundle', 'Pattern', 'Hits'], secRows)}<p>readPublic with no login, and with unexpected parameters (<code>lat, lng, city, foo, limit</code>):</p>${tbl(['Status', 'With unexpected params', 'Same body', 'CORS allow-origin'], secApi)}
<p>readPublic is reachable without login and returns the same body when extra parameters are added. CORS is open to any origin. Whether that is intended for player pages is a question for the dev team.</p>
<h2>CMS UI tests</h2>${tbl(['ID', 'Test', 'Result', 'Detail'], cmsRows)}
${cmsConsole ? `<p>Console during CMS flows: ${esc(cmsConsole.detail)}</p>` : ''}
<h2>Not tested / blocked</h2><ul><li>AQI for Chennai and Kolkata</li><li>Real 4xx/5xx/timeout from the live backend (only browser-side mocking was used, to avoid stressing servers)</li><li>Weather refresh at its 30-minute interval and long-duration observation</li><li>Third-party provider identity, plan and rate limits (server-side, not visible)</li><li>Cross-browser (Firefox, WebKit) and accessibility checks</li><li>Player behaviour after restart on a real screen (only a one-time look at the test box earlier)</li></ul>`;
fs.writeFileSync(OUT + '/index.html', html);
console.log('written', OUT + '/index.html', html.length, 'bytes; bugs', bugs.length);
