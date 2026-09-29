/**
 * Model Access list schema and an idempotent reconciler for it. Pure logic, no Node APIs, so the
 * test suite can run it against a stubbed Attio. The Node entry point is scripts/attio-setup.ts.
 */

export const LIST = 'model_access';
export const LIST_ID = '5c5502ff-1ef1-40e7-92c9-18f874f4209d';

export const STAGE_OPTIONS = ['Requested', 'Verified', 'Viewed', 'Engaged', 'Revoked'];

export interface AttributeSpec {
  api_slug: string;
  title: string;
  type: 'select' | 'timestamp' | 'number' | 'text';
  description: string;
}

export const ATTRIBUTES: AttributeSpec[] = [
  { api_slug: 'stage', title: 'Stage', type: 'select', description: 'Model gate funnel stage, set by the metrias-model Worker.' },
  { api_slug: 'requested_at', title: 'Requested at', type: 'timestamp', description: 'Last access-link request.' },
  { api_slug: 'verified_at', title: 'Verified at', type: 'timestamp', description: 'Last successful magic-link click.' },
  { api_slug: 'last_viewed_at', title: 'Last viewed at', type: 'timestamp', description: 'Last time the viewer loaded the model.' },
  { api_slug: 'visit_count', title: 'Visit count', type: 'number', description: 'Days with at least one visit.' },
  { api_slug: 'engaged_seconds', title: 'Engaged seconds', type: 'number', description: 'Total visible-tab seconds on the model.' },
  { api_slug: 'final_scenario', title: 'Final scenario', type: 'text', description: 'Scenario the viewer last left the model on.' },
  { api_slug: 'request_source', title: 'Request source', type: 'text', description: 'Source slug of the access request.' },
  { api_slug: 'utm_source', title: 'UTM source', type: 'text', description: 'First-touch utm_source at request time.' },
  { api_slug: 'utm_campaign', title: 'UTM campaign', type: 'text', description: 'First-touch utm_campaign at request time.' },
];

export interface ApiResult {
  status: number;
  json: any;
}

export type AttioApi = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<ApiResult>;

export interface ReconcileReport {
  created: string[];
  existing: string[];
  optionsCreated: string[];
  warnings: string[];
}

/**
 * Create any missing Model Access attributes and stage options. Safe to run repeatedly: it only
 * creates what is absent and never modifies or deletes anything. With dryRun it only reports.
 */
export async function reconcileModelAccess(api: AttioApi, dryRun = false): Promise<ReconcileReport> {
  const report: ReconcileReport = { created: [], existing: [], optionsCreated: [], warnings: [] };

  const list = await api('GET', `/lists/${LIST}`);
  if (list.status === 404) throw new Error(`List "${LIST}" not found. Create it in Attio (parent object: people) first.`);
  if (list.status >= 300) throw new Error(`Could not read list "${LIST}": ${list.status} ${JSON.stringify(list.json)}`);

  const attrs = await api('GET', `/lists/${LIST}/attributes`);
  if (attrs.status >= 300) throw new Error(`Could not list attributes: ${attrs.status} ${JSON.stringify(attrs.json)}`);
  const bySlug = new Map<string, any>((attrs.json?.data || []).map((a: any) => [a.api_slug, a]));

  for (const spec of ATTRIBUTES) {
    const found = bySlug.get(spec.api_slug);
    if (found) {
      report.existing.push(spec.api_slug);
      if (found.type !== spec.type) {
        report.warnings.push(`${spec.api_slug} exists with type ${found.type}, expected ${spec.type}; left unchanged.`);
      }
      continue;
    }
    report.created.push(spec.api_slug);
    if (dryRun) continue;
    const r = await api('POST', `/lists/${LIST}/attributes`, {
      data: {
        title: spec.title,
        description: spec.description,
        api_slug: spec.api_slug,
        type: spec.type,
        is_required: false,
        is_unique: false,
        is_multiselect: false,
        config: {},
      },
    });
    if (r.status >= 300) throw new Error(`Creating ${spec.api_slug} failed: ${r.status} ${JSON.stringify(r.json)}`);
  }

  // Stage options. A freshly created select has none; in a dry run of a missing stage, all would be created.
  const stageMissing = report.created.includes('stage');
  let have = new Set<string>();
  if (!(dryRun && stageMissing)) {
    const opts = await api('GET', `/lists/${LIST}/attributes/stage/options`);
    if (opts.status >= 300) throw new Error(`Could not list stage options: ${opts.status} ${JSON.stringify(opts.json)}`);
    have = new Set((opts.json?.data || []).map((o: any) => o.title));
  }
  for (const title of STAGE_OPTIONS) {
    if (have.has(title)) continue;
    report.optionsCreated.push(title);
    if (dryRun) continue;
    const r = await api('POST', `/lists/${LIST}/attributes/stage/options`, { data: { title } });
    if (r.status >= 300) throw new Error(`Creating stage option ${title} failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return report;
}
