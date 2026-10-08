/**
 * Application-level constants: routes, storage-state paths, status labels,
 * and the email subject patterns used by the notification workflow.
 *
 * Keeping these here (rather than scattered string literals across tests)
 * means a UI/route change is a one-line edit, not a find-and-replace.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** Relative application routes (joined onto BASE_URL by the page objects). */
export const ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  library: '/library',
  upload: '/library', // upload is launched from the Library module
  approvals: '/approvals', // Checker pending-approvals queue
  notifications: '/notifications',
} as const;

/** Storage-state files for authenticated session reuse (created in global setup). */
export const STORAGE_STATE = {
  maker: path.join(root, '.auth', 'maker.json'),
  checker: path.join(root, '.auth', 'checker.json'),
  authDir: path.join(root, '.auth'),
} as const;

/** Approval status labels as rendered by the CMS. */
export const STATUS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  escalated: 'Escalated',
} as const;

/**
 * Email subject keyword patterns for each notification type.
 * Patterns are case-insensitive substrings; adjust to match the real
 * templates once observed against the running system.
 */
export const EMAIL_SUBJECTS = {
  pending: /pending|awaiting approval|submitted for approval/i,
  approval: /approved|approval/i,
  rejection: /rejected|rejection|declined/i,
  escalation: /escalat/i,
} as const;

/** API endpoint fragments used by the network monitor for matching. */
export const API_PATTERNS = {
  upload: /\/(upload|file|media|library)/i,
  notification: /\/(notification|notify|email)/i,
  approval: /\/(approve|approval|review|reject)/i,
} as const;

export type RouteKey = keyof typeof ROUTES;
export type StatusLabel = (typeof STATUS)[keyof typeof STATUS];
