// =============================================================================
//  API layer barrel — one import site for the generic client and every module
//  service. Tests should depend on this, not on individual file paths, so
//  services can be reorganised without touching specs.
// =============================================================================

export { HttpClient, ApiError, isRedactedHeader } from './HttpClient';
export type { HttpMethod, QueryParams, RequestOptions, HttpLogEntry, HttpClientOptions } from './HttpClient';

export { BaseService, MAX_PAGE_LIMIT } from './BaseService';
export type { Paginated, ListQuery } from './BaseService';

export { SESSION_COOKIE, tokenFromContext, decodeJwt, isExpired } from './session';
export type { JwtPayload } from './session';

export { CampaignService, CampaignApi } from './services/CampaignService';
export type {
  Campaign,
  CampaignItem,
  CampaignFileRef,
  CampaignList,
  CampaignPayload,
} from './services/CampaignService';
