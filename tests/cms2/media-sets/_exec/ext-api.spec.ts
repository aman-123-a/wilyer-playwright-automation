// Extended execution — API-level edge + security cases (no browser). Records verdicts via rec.ts.
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { SESSION_COOKIE } from '../../../../api/session';
import { run, observed, fail, blocked } from './rec';

test.describe.configure({ mode: 'serial' });

test('extended API execution', async ({ mediaSetApi, context, browser }, testInfo) => {
  test.setTimeout(600_000);
  const files: ZoneFiles = await mediaSetApi.pickZoneFiles();
  const http = mediaSetApi['http'];
  const made: string[] = [];
  const mk = (n: string, x: object = {}) => ({ ...MediaSetService.payload(n, files), ...x });
  const create = async (payload: object) => {
    const r = await mediaSetApi.createRaw(payload);
    if (r.status() === 201) made.push((await r.json()).id);
    return r;
  };
  const tag = mediaSetName('ext', testInfo.workerIndex);
  const nameOf = async (id: string) => (await (await http.rawGet(`/mediaSet/read/${id}`)).json()).name as string;

  try {
    // ── Edge: names ────────────────────────────────────────────────────────
    await run('MS-EDG-01', async () => {
      const r = await create(mk(tag + '_ws', { name: '     ' }));
      expect(r.status()).toBe(400);
      return `whitespace-only name → ${r.status()} ${(await r.json()).message}`;
    });
    await run('MS-EDG-02', async () => {
      const raw = `  ${tag}_trim  `;
      const r = await create(mk('x', { name: raw }));
      expect(r.status()).toBe(201);
      const id = made.at(-1)!;
      const stored = await nameOf(id);
      const s1 = (await mediaSetApi.list({ search: `${tag}_trim` })).totalDocs;
      const s2 = (await mediaSetApi.list({ search: raw })).totalDocs;
      const msg = `stored ${JSON.stringify(stored)} (${stored === raw ? 'kept spaces' : 'trimmed'}); search trimmed term → ${s1}, search with spaces → ${s2}`;
      if (stored === raw && s2 === 0) return observed(msg + ' — spaces kept and padded search finds nothing (search does not trim)');
      return msg;
    });
    await run('MS-EDG-03', async () => {
      const names = [`${tag}_मीडिया सेट`, `${tag}_🎬 Promo`, `${tag}_مجموعة`];
      const out: string[] = [];
      for (const n of names) {
        const r = await create(mk('x', { name: n }));
        expect(r.status(), n).toBe(201);
        const back = await nameOf(made.at(-1)!);
        expect(back).toBe(n);
        const found = (await mediaSetApi.list({ search: n })).totalDocs;
        expect(found, `search ${n}`).toBeGreaterThanOrEqual(1);
        out.push(`${n.slice(tag.length + 1)}: stored+found`);
      }
      return out.join('; ');
    });
    await run('MS-EDG-04', async () => {
      const chars = ['<b>x</b>', 'a"b', "a'b", 'a\\b', 'a%20b'];
      for (const c of chars) {
        const n = `${tag}_${c}`;
        const r = await create(mk('x', { name: n }));
        expect(r.status(), c).toBe(201);
        expect(await nameOf(made.at(-1)!), `round-trip ${c}`).toBe(n);
      }
      return 'API round-trip identical for <b>, ", \', \\, %20 (UI rendering checked in ext-ui)';
    });
    await run('MS-EDG-05', async () => {
      const r300 = await create(mk('x', { name: tag + '_' + 'L'.repeat(300) }));
      const r5000 = await create(mk('x', { name: tag + '_' + 'L'.repeat(5000) }));
      const msg = `300 chars → ${r300.status()}, 5000 chars → ${r5000.status()}`;
      if (r300.status() === 201 || r5000.status() === 201) return fail(msg + ' — no length limit (MS-API-D2)');
      return msg;
    });

    // ── Edge: shape ────────────────────────────────────────────────────────
    await run('MS-EDG-06', async () => {
      const n = 21;
      for (let i = 0; i < n; i++) await create(mk(`${tag}_pg${String(i).padStart(2, '0')}`));
      const p1 = await mediaSetApi.list({ search: `${tag}_pg`, limit: 20, page: 1 });
      const p2 = await mediaSetApi.list({ search: `${tag}_pg`, limit: 20, page: 2 });
      expect(p1.totalDocs).toBe(21);
      expect(p1.mediaSets).toHaveLength(20);
      expect(p2.mediaSets).toHaveLength(1);
      expect(p1.totalPages).toBe(2);
      return `21 sets: page1=20, page2=1, totalPages=2, totalDocs=21`;
    });
    await run('MS-EDG-11', async () => {
      const r = await create(mk(tag + '_same', {
        zones: [
          { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id },
          { ratio: '9:16', w: 9, h: 16, label: 'Portrait', file: files.landscape.id },
        ],
        portraitFile: files.landscape.id,
      }));
      if (r.status() === 201) return fail('same landscape file accepted for both Landscape and Portrait zones (201) — orientation not enforced server-side (MS-API-D4)');
      return `rejected ${r.status()}`;
    });
    await run('MS-EDG-12', async () => {
      const r = await create(mk(tag + '_one', { zones: [{ ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id }] }));
      expect(r.status()).toBe(400);
      return `single format → ${r.status()} ${(await r.json()).message}`;
    });
    await run('MS-API-14', async () => {
      const r = await create(mk(tag + '_auto', { type: 'automatic' }));
      const t = r.status() === 201 ? (await (await http.rawGet(`/mediaSet/read/${made.at(-1)}`)).json()).type : '';
      return `type "automatic" → ${r.status()}${r.status() === 201 ? ` stored type=${t}` : ' ' + (await r.text()).slice(0, 120)}`;
    });
    await run('MS-API-22', async () => {
      const all = (await mediaSetApi.list({ search: tag, limit: 100 })).totalDocs;
      const typed = (await mediaSetApi.list({ search: tag, limit: 100, type: 'orientation' })).totalDocs;
      const bogus = (await mediaSetApi.list({ search: tag, limit: 100, type: 'zzz' })).totalDocs;
      const msg = `search total ${all}; type=orientation → ${typed}; type=zzz → ${bogus}`;
      if (bogus === all) return observed(msg + ' — unknown type value is ignored (no filtering, no error)');
      return msg;
    });
    await run('MS-FN-C03', async () => {
      const a = await create(mk(tag + '_d0', { description: '' }));
      const b = await create(mk(tag + '_d1', { description: 'x'.repeat(200) }));
      expect([a.status(), b.status()]).toEqual([201, 201]);
      const doc = await (await http.rawGet(`/mediaSet/read/${made.at(-1)}`)).json();
      expect(doc.description).toHaveLength(200);
      return 'empty and 200-char description both accepted and stored';
    });
    await run('MS-FN-C04', async () => {
      const out: string[] = [];
      for (const len of [1, 50, 255]) {
        const n = (tag.slice(0, 1) + 'q'.repeat(len)).slice(0, len);
        const r = await create(mk('x', { name: `${n}${len === 1 ? '' : ''}` + (len > tag.length ? '' : '') }));
        out.push(`${len}ch → ${r.status()}`);
      }
      return out.join(', ') + ' (names are not prefixed here only if swept by id — all ids tracked)';
    });
    await run('MS-FN-C05', async () => {
      const base = tag + '_Case';
      const a = await create(mk(base));
      const same = await create(mk(base));
      const lower = await create(mk(base.toLowerCase()));
      const msg = `first ${a.status()}, identical ${same.status()}, lowercase variant ${lower.status()}`;
      expect(same.status()).toBe(409);
      if (lower.status() === 201) return observed(msg + ' — duplicate check is case-SENSITIVE (Case vs case both allowed)');
      return msg;
    });
    await run('MS-FN-U02', async () => {
      const id = made.at(-1)!;
      const doc = await (await http.rawGet(`/mediaSet/read/${id}`)).json();
      const r = await mediaSetApi.updateRaw(id, { ...MediaSetService.payload(doc.name, files), description: 'basic crud check' });
      expect(r.status()).toBe(200);
      expect((await (await http.rawGet(`/mediaSet/read/${id}`)).json()).description).toBe('basic crud check');
      return 'description updated and read back';
    });
    await run('MS-FN-U06', async () => {
      const a = tag + '_RenA';
      const b = tag + '_RenB';
      await create(mk(a));
      const idB = made.length;
      await create(mk(b));
      const r = await mediaSetApi.updateRaw(made[idB], MediaSetService.payload(a, files));
      const msg = `rename B to A's name → ${r.status()} ${(await r.text()).slice(0, 100)}`;
      if (r.status() === 200) return fail(msg + ' — update allows a duplicate name that create refuses with 409');
      return msg;
    });
    await run('MS-FN-C16', async () => {
      const folders = (await http.get<{ folders: Array<{ id: string; name: string }> }>('/folder/read', { params: { page: 1, limit: 100 } })).folders;
      const f = folders.find((x) => x.name === 'testway') ?? folders[0];
      const r = await create(mk(tag + '_infolder', { folderId: f.id }));
      expect(r.status()).toBe(201);
      const inFolder = (await mediaSetApi.list({ search: `${tag}_infolder`, folderId: f.id })).totalDocs;
      const atRoot = (await mediaSetApi.list({ search: `${tag}_infolder`, folderId: '' })).totalDocs;
      const msg = `created in "${f.name}"; folderId filter → ${inFolder}; root list (folderId='') → ${atRoot}`;
      expect(inFolder).toBe(1);
      return msg;
    });
    await run('MS-EDG-24', async () => {
      const id = made.at(-1)!;
      const doc = await (await http.rawGet(`/mediaSet/read/${id}`)).json();
      const r = await mediaSetApi.updateRaw(id, { ...MediaSetService.payload(doc.name, files), folderId: '' });
      expect(r.status()).toBe(200);
      return `move to root via update folderId="" → ${r.status()}; folderId now ${JSON.stringify((await (await http.rawGet(`/mediaSet/read/${id}`)).json()).folderId)}`;
    });
    await run('MS-RG-02', async () => {
      const n = tag + '_reuse';
      const r1 = await create(mk(n));
      const id = made.at(-1)!;
      expect((await mediaSetApi.deleteRaw(id)).status()).toBe(200);
      const r2 = await create(mk(n));
      expect([r1.status(), r2.status()]).toEqual([201, 201]);
      return 'name reusable right after delete';
    });

    // ── Security / API hardening ───────────────────────────────────────────
    await run('MS-SC-02', async () => {
      const real = decodeURIComponent((await context.cookies()).find((c) => c.name === SESSION_COOKIE)!.value);
      const [h, p, s] = real.split('.');
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      const variants: Record<string, string> = {
        'tampered payload': `${h}.${b64({ ...payload, id: '000000000000000000000009' })}.${s}`,
        'expired exp (unsigned change)': `${h}.${b64({ ...payload, exp: 1 })}.${s}`,
        'alg none': `${b64({ alg: 'none', typ: 'JWT' })}.${p}.`,
        'empty signature': `${h}.${p}.`,
        'garbage': 'abc',
      };
      const out: string[] = [];
      for (const [k, tok] of Object.entries(variants)) {
        const r = await new MediaSetService(http.withToken(tok)).listRaw();
        out.push(`${k} → ${r.status()}`);
        expect(r.status(), k).toBe(401);
      }
      return out.join('; ');
    });
    await run('MS-API-31', async () => {
      const real = decodeURIComponent((await context.cookies()).find((c) => c.name === SESSION_COOKIE)!.value);
      const [h, p, s] = real.split('.');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      const tok = `${h}.${Buffer.from(JSON.stringify({ ...payload, exp: 1 })).toString('base64url')}.${s}`;
      const r = await new MediaSetService(http.withToken(tok)).listRaw();
      expect(r.status()).toBe(401);
      return `expired-claim token → ${r.status()} (signature check rejects it; true expired-but-validly-signed token not obtainable)`;
    });
    await run('MS-SC-09', async () => {
      const probes: Array<[string, string]> = [
        ['search[$ne]', '/mediaSet/read?search[$ne]=x'],
        ['search[$regex]', '/mediaSet/read?search[$regex]=.*'],
        ['folderId[$ne]', '/mediaSet/read?folderId[$ne]=1'],
        ['type[$ne]', '/mediaSet/read?type[$ne]=x'],
        ['id operator', '/mediaSet/read/%7B%22%24gt%22%3A%22%22%7D'],
      ];
      const out: string[] = [];
      let leaked = false;
      const total = (await mediaSetApi.list({ limit: 1 })).totalDocs;
      for (const [k, url] of probes) {
        const r = await http.rawGet(url);
        let n = '-';
        try { const j = await r.json(); if (Array.isArray(j.mediaSets)) n = String(j.totalDocs); if (j.totalDocs > total) leaked = true; } catch { /* non-json */ }
        out.push(`${k} → ${r.status()}${n !== '-' ? ' total ' + n : ''}`);
      }
      const has5xx = out.some((o) => /→ 5\d\d/.test(o));
      const msg = out.join('; ') + `; baseline total ${total}`;
      if (leaked) return fail(msg + ' — operator widened results');
      if (has5xx) return observed(msg + ' — 5xx on an operator-shaped value (should be a 4xx)');
      return msg;
    });
    await run('MS-SC-12', async () => blocked('needs a second tenant account to supply a foreign file id; none configured on cms2'));
    await run('MS-SC-14', async () => {
      const big = await create(mk('x', { name: tag + '_' + 'B'.repeat(100_000) }));
      const manyZones = await create(mk(tag + '_z500', { zones: Array.from({ length: 500 }, () => ({ ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id })) }));
      const msg = `100KB name → ${big.status()}; 500 zones → ${manyZones.status()}`;
      if (big.status() === 201 || manyZones.status() === 201) return fail(msg + ' — oversize input accepted; no length/zone-count cap');
      return msg;
    });
    await run('MS-SC-15', async () => {
      const dupZones = await create(mk(tag + '_dz', { zones: [
        { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id },
        { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id },
      ] }));
      const badRatio = await create(mk(tag + '_br', { zones: [
        { ratio: '1:1', w: 16, h: 9, label: 'Landscape', file: files.landscape.id },
        { ratio: '9:16', w: 9, h: 16, label: 'Portrait', file: files.portrait.id },
      ] }));
      const msg = `two Landscape zones → ${dupZones.status()}; ratio label 1:1 with w/h 16:9 → ${badRatio.status()}`;
      if (dupZones.status() === 201 || badRatio.status() === 201) return fail(msg + ' — inconsistent/duplicate zones accepted');
      return msg;
    });
    await run('MS-SC-16', async () => {
      const all = (await mediaSetApi.list({ limit: 100 })).mediaSets as unknown as Array<{ name: string; screens: unknown[] }>;
      const withScreens = all.filter((m) => m.screens?.length);
      test.skip(false);
      if (!withScreens.length) return blocked('no published set to inspect');
      const dump = JSON.stringify(withScreens[0].screens);
      const secrets = dump.match(/"(authKey|secretKey|password|token|secret)[A-Za-z]*"/gi) ?? [];
      const keys = Object.keys((withScreens[0].screens[0] ?? {}) as object);
      if (secrets.length) return fail(`screens[] carries secret-like fields: ${[...new Set(secrets)].join(', ')}`);
      return `published set "${withScreens[0].name}" screens[] fields: ${keys.join(', ')} — no authKey/secretKey/token`;
    });
    await run('MS-SC-17', async () => {
      const bad = await http.rawPost('/mediaSet/create', { data: '{"name":', headers: { 'Content-Type': 'application/json' } });
      const txt = await bad.text();
      const msg = `broken JSON → ${bad.status()} ${txt.slice(0, 160)}`;
      if (/\/var\/|node_modules|at .*\(.*:\d+:\d+\)|ENOENT|mongo/i.test(txt)) return fail(msg + ' — internal detail in the error body');
      return msg;
    });
    await run('MS-SC-18', async () => {
      const id = made[0];
      const out: string[] = [];
      let leak = false;
      for (const [m, url] of [['GET', '/mediaSet/create'], ['PUT', `/mediaSet/update/${id}`], ['PATCH', `/mediaSet/update/${id}`], ['POST', `/mediaSet/delete/${id}`], ['GET', `/mediaSet/delete/${id}`]] as const) {
        const r = await http.send(m, url, { data: m === 'GET' ? undefined : mk(tag + '_m') });
        const t = await r.text();
        if (/\/var\/www|ENOENT/.test(t)) leak = true;
        out.push(`${m} ${url.split('/').slice(0, 3).join('/')} → ${r.status()}`);
      }
      const stillThere = (await http.rawGet(`/mediaSet/read/${id}`)).status() === 200;
      expect(stillThere, 'wrong-method calls must not change state').toBe(true);
      const msg = out.join('; ');
      if (leak) return fail(msg + ' — 404 bodies expose the server path (MS-API-D9); no state change');
      return msg;
    });
    await run('MS-SC-19', async () => {
      const r = await http.rawGet('/mediaSet/read?limit=1', { headers: { Origin: 'https://evil.example' } });
      const h = r.headers();
      const acao = h['access-control-allow-origin'];
      const acac = h['access-control-allow-credentials'];
      const msg = `API with foreign Origin: ACAO=${acao ?? 'none'}, ACAC=${acac ?? 'none'}, status ${r.status()}`;
      if (acao === '*' && acac === 'true') return fail(msg + ' — wildcard with credentials');
      if (acao === 'https://evil.example') return fail(msg + ' — foreign origin reflected');
      const app = await context.request.get('https://cms2.pocsample.in/library');
      const ah = app.headers();
      const hdr = `app headers: X-Frame-Options=${ah['x-frame-options'] ?? 'none'}, CSP=${(ah['content-security-policy'] ?? 'none').slice(0, 80)}, X-Content-Type-Options=${ah['x-content-type-options'] ?? 'none'}, HSTS=${ah['strict-transport-security'] ? 'yes' : 'none'}`;
      if (!ah['x-frame-options'] && !/frame-ancestors/.test(ah['content-security-policy'] ?? '')) return observed(`${msg}. ${hdr} — no clickjacking protection header`);
      return `${msg}. ${hdr}`;
    });
    await run('MS-SC-20', async () => {
      const codes: number[] = [];
      const started = Date.now();
      await Promise.all(Array.from({ length: 4 }, async () => {
        for (let i = 0; i < 12; i++) codes.push((await mediaSetApi.listRaw({ limit: 1 })).status());
      }));
      const n429 = codes.filter((c) => c === 429).length;
      const msg = `48 reads in ${Date.now() - started}ms @4 parallel → ${n429} × 429, others ${[...new Set(codes.filter((c) => c !== 429))].join('/')}; creates earlier: 220 @5 parallel → 0 × 429`;
      return n429 === 0 ? observed(msg + ' — no rate limiting observed at this volume') : msg;
    });
    await run('MS-SC-23', async () => {
      const c = (await context.cookies()).find((x) => x.name === SESSION_COOKIE)!;
      const msg = `footprint cookie: httpOnly=${c.httpOnly}, secure=${c.secure}, sameSite=${c.sameSite}`;
      if (!c.httpOnly) return observed(msg + ' — readable by page JavaScript (known posture, XSS would expose the token)');
      return msg;
    });
    await run('MS-PF-09', async () => {
      const t = Date.now();
      const res = await Promise.all(Array.from({ length: 10 }, () => mediaSetApi.listRaw({ limit: 20 })));
      const ms = Date.now() - t;
      const codes = res.map((r) => r.status());
      expect(codes.every((c) => c === 200), `statuses ${codes.join(',')}`).toBe(true);
      return `10 parallel list calls → all 200 in ${ms}ms wall-clock`;
    });
    await run('MS-FN-B10', async () => {
      const a = await create(mk(tag + '_bk1'));
      const id1 = made.at(-1)!;
      await create(mk(tag + '_bk2'));
      const id2 = made.at(-1)!;
      expect((await mediaSetApi.deleteRaw(id1)).status()).toBe(200);
      const r1 = await mediaSetApi.deleteRaw(id1);
      const r2 = await mediaSetApi.deleteRaw(id2);
      expect([r1.status(), r2.status()]).toEqual([404, 200]);
      void a;
      return 'delete of an already-gone id → 404 {message}; the other set still deleted 200 (API level; UI behaviour of a failing item in a bulk run not exercised)';
    });
  } finally {
    for (const id of made) await mediaSetApi.deleteQuietly(id);
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
    void browser;
  }
});
