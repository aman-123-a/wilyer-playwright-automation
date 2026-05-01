import { APIRequestContext, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'https://v3-5api.pocsample.in';

export interface AuthSession {
  token: string;
}

export async function loginApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<AuthSession> {
  // Path observed via browser network tab — confirm against your backend spec.
  const res = await request.post(`${API_BASE}/v3/cms/auth/login`, {
    data: { email, password },
  });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { token?: string; accessToken?: string };
  const token = body.token ?? body.accessToken;
  if (!token) throw new Error('no token in login response');
  return { token };
}

export async function listRolesApi(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/v3/cms/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function deleteRoleApi(
  request: APIRequestContext,
  token: string,
  roleId: string,
) {
  return request.delete(`${API_BASE}/v3/cms/roles/${roleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
