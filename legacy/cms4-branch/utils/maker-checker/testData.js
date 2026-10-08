// Central test data — keep all environment & credentials in one place
import path from 'path';

export const BASE_URL = process.env.BASE_URL || 'https://cms.pocsample.in';

export const MAKER = {
  email: process.env.MAKER_EMAIL || 'amankumarbsrbsr@gmail.com',
  password: process.env.MAKER_PASSWORD || '12345',
  role: 'maker',
};

export const CHECKER = {
  email: process.env.CHECKER_EMAIL || 'aman@wilyer.com',
  password: process.env.CHECKER_PASSWORD || '12345',
  role: 'checker',
};

// File paths used by upload scenarios — reuse the existing sample fixture
export const FILES = {
  validImage:   path.resolve('data/sample.jpg'),
  invalidType:  path.resolve('data/sample.exe'),   // generated on demand by tests
};

// Generates unique but short names. The CMS truncates playlist labels at ~20
// chars in the card view, so we hard-cap the prefix to keep the full name
// visible (otherwise getByText(name, exact) can't match the truncated label).
export const uniqueName = (prefix = 'PL') => {
  const suffix = `${Date.now().toString(36).slice(-4)}_${Math.floor(Math.random() * 1000)}`;
  const maxPrefix = Math.max(2, 18 - suffix.length - 1);
  return `${prefix.slice(0, maxPrefix)}_${suffix}`;
};

// Duplicate-name fixture (stable so we can hit the duplicate branch twice)
export const DUPLICATE_NAME = 'DUP_PLAYLIST_FIXTURE';

// Folder that hosts all automation playlists. Required by the CMS: every
// playlist must live under a folder before it can be created.
export const DEFAULT_FOLDER = process.env.PLAYLIST_FOLDER || 'test2';

// Canonical statuses surfaced by the CMS
export const STATUS = {
  DRAFT:     'Draft',
  SUBMITTED: 'Submitted',
  APPROVED:  'Approved',
  REJECTED:  'Rejected',
};
