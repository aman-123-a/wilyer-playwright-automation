export const credentials = {
  email: (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || ''),
  password: (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || '')
};