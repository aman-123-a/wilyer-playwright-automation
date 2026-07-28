// =============================================================================
//  Module registry — the single source of truth that makes the suite reusable
//  across every CMS module. To onboard a new module or fix a drifted locator,
//  edit ONE row here; the POM, helpers and specs are all data-driven from it.
//
//  `searchApi` regexes were taken from the live API audit
//  (reports/api-audit/api-report.json) — these are the real list/search calls
//  each module fires:
//    Screens   GET /v3/cms/screen/read?...&search=
//    Groups    GET /v3/cms/group/read?search=
//    Clusters  GET /v3/cms/cluster/read?search=
//    Library   GET /v3/cms/file/read?...&search=
//    Playlists GET /v3/cms/playlist/read?...&search=
//    Team      GET /v3/cms/team/read?search=
//    Roles     GET /v3/cms/role/read?search=
//
//  Members / Logs routes were not exercised by the audit — their route +
//  searchApi below are best-effort and flagged `unverified: true`. Update from
//  the live app, then drop the flag.
// =============================================================================

export interface ModuleConfig {
  /** Stable key for env-filtering (SEARCH_MODULES=groups,team). */
  key: string;
  /** Human label used in test titles. */
  name: string;
  /** Canonical route (sidebar links use icon-glyphs that break anchored names). */
  route: string;
  /** Regex matching the module's list/search XHR (used to await + mock). */
  searchApi: RegExp;
  /** CSS selector for a single result row — the count/visibility hook. */
  rowSelector: string;
  /** Set when route/api are unconfirmed against the live build. */
  unverified?: boolean;
}

const ALL: ModuleConfig[] = [
  { key: 'screens',   name: 'Screens',   route: '/screens',   searchApi: /\/cms\/screen\/read/i,   rowSelector: 'a[href^="/screen-settings/"]' },
  { key: 'groups',    name: 'Groups',    route: '/groups',    searchApi: /\/cms\/group\/read/i,    rowSelector: 'table tbody tr' },
  { key: 'clusters',  name: 'Clusters',  route: '/clusters',  searchApi: /\/cms\/cluster\/read/i,  rowSelector: 'table tbody tr' },
  { key: 'library',   name: 'Library',   route: '/library',   searchApi: /\/cms\/file\/read/i,     rowSelector: 'a[href^="/file-details"], [class*="card" i]' },
  { key: 'playlists', name: 'Playlists', route: '/playlists', searchApi: /\/cms\/playlist\/read/i, rowSelector: 'a[href^="/playlist-settings/"]' },
  { key: 'team',      name: 'Team',      route: '/team',      searchApi: /\/cms\/team\/read/i,     rowSelector: 'table tbody tr' },
  { key: 'members',   name: 'Members',   route: '/members',   searchApi: /\/cms\/(member|team)\/read/i, rowSelector: 'table tbody tr', unverified: true },
  { key: 'roles',     name: 'Roles',     route: '/roles',     searchApi: /\/cms\/role\/read/i,     rowSelector: 'table tbody tr', unverified: true },
  { key: 'logs',      name: 'Logs',      route: '/logs',      searchApi: /\/cms\/(log|audit|activity)\/read/i, rowSelector: 'table tbody tr', unverified: true },
];

/** Optional env filter: SEARCH_MODULES=groups,team narrows the run. */
const only = (process.env.SEARCH_MODULES ?? '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const MODULES: ModuleConfig[] = only.length
  ? ALL.filter((m) => only.includes(m.key))
  : ALL;

export default MODULES;
