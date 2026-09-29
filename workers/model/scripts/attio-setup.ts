/**
 * Idempotently create the Model Access list attributes and stage options in Attio.
 *
 * Usage (Node 22.18 or later runs TypeScript directly):
 *   ATTIO_API_TOKEN=... node scripts/attio-setup.ts            create what is missing
 *   ATTIO_API_TOKEN=... node scripts/attio-setup.ts --dry-run  report only
 *
 * The token needs list configuration read-write scope. It is read from the environment and never
 * printed.
 */

import { reconcileModelAccess, type AttioApi } from './attio-schema.ts';

// No @types/node dependency: read the two process fields this script needs.
const proc = (globalThis as unknown as {
  process: { env: Record<string, string | undefined>; argv: string[]; exitCode?: number };
}).process;

const BASE = 'https://api.attio.com/v2';

async function main(): Promise<void> {
  const token = proc.env.ATTIO_API_TOKEN;
  if (!token) {
    console.error('ATTIO_API_TOKEN is not set in the environment.');
    proc.exitCode = 1;
    return;
  }
  const dryRun = proc.argv.includes('--dry-run');

  const api: AttioApi = async (method, path, body) => {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: r.status, json };
  };

  const report = await reconcileModelAccess(api, dryRun);
  const verb = dryRun ? 'would create' : 'created';
  console.log(`attributes ${verb}: ${report.created.join(', ') || 'none'}`);
  console.log(`attributes already present: ${report.existing.join(', ') || 'none'}`);
  console.log(`stage options ${verb}: ${report.optionsCreated.join(', ') || 'none'}`);
  for (const w of report.warnings) console.warn(`warning: ${w}`);
}

main().catch((err) => {
  console.error((err as Error).message);
  proc.exitCode = 1;
});
