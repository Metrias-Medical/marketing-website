import { describe, expect, it } from 'vitest';
import { ATTRIBUTES, reconcileModelAccess, STAGE_OPTIONS, type AttioApi } from '../scripts/attio-schema';

/** In-memory Attio list config. */
function fakeAttio(initial: { list?: boolean; attributes?: { api_slug: string; type: string }[]; options?: string[] } = {}) {
  const state = {
    list: initial.list ?? true,
    attributes: [...(initial.attributes || [])],
    options: [...(initial.options || [])],
    posts: [] as { path: string; body: any }[],
  };
  const api: AttioApi = async (method, path, body) => {
    if (method === 'POST') state.posts.push({ path, body });
    if (path === '/lists/model_access') return { status: state.list ? 200 : 404, json: {} };
    if (path === '/lists/model_access/attributes') {
      if (method === 'GET') return { status: 200, json: { data: state.attributes } };
      const d = (body as any).data;
      state.attributes.push({ api_slug: d.api_slug, type: d.type });
      return { status: 200, json: { data: d } };
    }
    if (path === '/lists/model_access/attributes/stage/options') {
      if (method === 'GET') return { status: 200, json: { data: state.options.map((title) => ({ title })) } };
      state.options.push((body as any).data.title);
      return { status: 200, json: {} };
    }
    return { status: 404, json: {} };
  };
  return { api, state };
}

describe('scripts/attio-setup reconcile', () => {
  it('creates every attribute with the right type and all stage options on an empty list', async () => {
    const { api, state } = fakeAttio();
    const report = await reconcileModelAccess(api);
    expect(report.created.sort()).toEqual(ATTRIBUTES.map((a) => a.api_slug).sort());
    expect(state.attributes.find((a) => a.api_slug === 'stage')?.type).toBe('select');
    expect(state.attributes.find((a) => a.api_slug === 'requested_at')?.type).toBe('timestamp');
    expect(state.attributes.find((a) => a.api_slug === 'visit_count')?.type).toBe('number');
    expect(state.attributes.find((a) => a.api_slug === 'final_scenario')?.type).toBe('text');
    expect(state.options).toEqual(STAGE_OPTIONS);
    const firstPost = state.posts[0].body.data;
    expect(firstPost).toMatchObject({ is_required: false, is_unique: false, is_multiselect: false, config: {} });
  });

  it('is idempotent', async () => {
    const { api, state } = fakeAttio();
    await reconcileModelAccess(api);
    const posts = state.posts.length;
    const second = await reconcileModelAccess(api);
    expect(state.posts).toHaveLength(posts);
    expect(second.created).toEqual([]);
    expect(second.optionsCreated).toEqual([]);
  });

  it('only fills gaps and warns on a type mismatch', async () => {
    const { api, state } = fakeAttio({
      attributes: [
        { api_slug: 'stage', type: 'select' },
        { api_slug: 'visit_count', type: 'text' },
      ],
      options: ['Requested', 'Verified'],
    });
    const report = await reconcileModelAccess(api);
    expect(report.existing.sort()).toEqual(['stage', 'visit_count']);
    expect(report.optionsCreated).toEqual(['Viewed', 'Engaged', 'Revoked']);
    expect(report.warnings[0]).toMatch(/visit_count/);
    expect(state.posts.some((p) => p.body?.data?.api_slug === 'stage')).toBe(false);
  });

  it('dry run writes nothing', async () => {
    const { api, state } = fakeAttio();
    const report = await reconcileModelAccess(api, true);
    expect(state.posts).toHaveLength(0);
    expect(report.created).toHaveLength(ATTRIBUTES.length);
    expect(report.optionsCreated).toEqual(STAGE_OPTIONS);
  });

  it('fails clearly when the list does not exist', async () => {
    const { api } = fakeAttio({ list: false });
    await expect(reconcileModelAccess(api)).rejects.toThrow(/not found/);
  });
});
