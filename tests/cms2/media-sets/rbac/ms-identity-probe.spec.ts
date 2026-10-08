// Probe: what the Media Sets maker/checker identities can actually do on this environment.
// Prints claims only — never credentials or tokens.
import { test, expect } from '../../../../fixtures/test-fixtures';
import { HttpClient, MediaSetService } from '../../../../api';
import { loginAs } from '../../../../helpers/rbac/identities';
import { msCredentials, type MsRole } from '../../../../helpers/rbac/mediaSetIdentities';

for (const role of ['maker', 'checker'] as MsRole[]) {
  test(`PROBE ${role}: login, claims, media-set list access`, async ({ browser, context }) => {
    const creds = msCredentials(role);
    test.skip(!creds, `MS_${role.toUpperCase()}_* not set in .env`);
    const ctx = await browser.newContext({ storageState: undefined });
    const out = await loginAs(await ctx.newPage(), creds!);
    await ctx.close();
    expect(out.identity, `login failed: ${out.reason}`).not.toBeNull();
    const c = out.identity!.claims as Record<string, unknown>;
    const { exp, iat, ...safe } = c;
    console.log(`[${role}] mediaSets=${JSON.stringify((safe as any).access?.mediaSets ?? (safe as any).mediaSets)} restricted=${(safe as any).isRestrictedAccess} keys=${Object.keys(safe).join(",")}`);
    const svc = new MediaSetService(new HttpClient(context.request, { token: out.identity!.token }));
    const list = await svc.listRaw({ limit: 5 });
    console.log(`[${role}] GET /mediaSet/read → ${list.status()}`);
  });
}
