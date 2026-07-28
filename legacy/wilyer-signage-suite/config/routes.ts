// =============================================================================
//  Route + API-endpoint map for the Wilyer Signage CMS.
// =============================================================================
//  Single source of truth for UI paths and the API URL globs used by the
//  failure-injection layer (page.route). Keeping them here means a backend
//  rename is a one-line change, not a grep-and-replace across 15 spec files.
// =============================================================================

/** UI routes (SPA paths, relative to BASE_URL). */
export const ROUTES = {
  // Auth screens (verified live on cms.wilyersignage.com):
  //   Sign In lives at the site root, NOT /login.
  signIn: '/',
  forgotPassword: '/forget',
  signUp: '/signup',
  login: '/login',
  dashboard: '/dashboard',
  screens: '/screens',
  groups: '/groups',
  clusters: '/clusters',
  library: '/library',
  playlists: '/playlist',
  rollouts: '/content-rollout',
  team: '/team',
  roles: '/team',
  reports: '/reports',
  account: '/account',
  billing: '/billing',
} as const;

/**
 * API endpoint globs for page.route() interception. These are intentionally
 * broad (`**`) so they match regardless of query string or id segment. Tighten
 * a glob only when a test must target one specific call.
 */
export const API = {
  any: '**/api/**',
  login: '**/api/**/login**',
  dashboardStats: '**/api/**/dashboard**',
  screensList: '**/api/**/screen**',
  screenDetail: '**/api/**/screen/**',
  groups: '**/api/**/group**',
  clusters: '**/api/**/cluster**',
  library: '**/api/**/librar**',
  upload: '**/api/**/upload**',
  playlists: '**/api/**/playlist**',
  rollouts: '**/api/**/rollout**',
  team: '**/api/**/user**',
  roles: '**/api/**/role**',
  reports: '**/api/**/report**',
  export: '**/api/**/export**',
  notifications: '**/api/**/notif**',
  account: '**/api/**/account**',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type ApiKey = keyof typeof API;
