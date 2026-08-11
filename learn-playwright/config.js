// Shared constants + credentials. Keeping them in one place so tests read cleanly.
export const CREDS = {
  email: process.env.CMS_EMAIL || (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || ''),
  password: process.env.CMS_PASSWORD || (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || ''),
};

// Backend API (the SPA talks to this host).
export const API_BASE = 'https://cms.wilyersignage.com/v3/cms';

// The folder we test inside:  India > uttarpradesh > Noida
export const NOIDA_FOLDER_ID = '6a4f5e62472a0f8e8390871f';

// A couple of known image file IDs (landscape + portrait) for building media sets.
// NOTE: if these ever 400 with "files do not belong to you", fetch fresh ones with
// listImageFiles() in utils/api.js instead of hardcoding.
export const SAMPLE_FILES = {
  landscape: '6a3b5e21958c97bed7868e2c', // image_3 (1862x990)
  portrait: '6a3b5e05958c97bed7868de2',  // corrugation_factory (2760x3320)
};
