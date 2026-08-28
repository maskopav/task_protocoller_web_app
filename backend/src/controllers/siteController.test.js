import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const {
  getSites,
  getSiteConfig,
  createSite,
  updateSite,
  assignProjectToSite,
} = await import('./siteController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const SITE_TOKEN = 'paris000paris000paris000paris000';

// Paris inherits protocol 10+11 via project 1 and protocol 12 via project 2 —
// the multi-project case from the newshare proposal (Paris = 3 protocols).
const spineRows = [
  { project_id: 1, project_name: 'Project A', protocol_id: 10, language_code: 'en' },
  { project_id: 1, project_name: 'Project A', protocol_id: 11, language_code: 'cs' },
  { project_id: 2, project_name: 'Project B', protocol_id: 12, language_code: 'en' },
];

const protocolRow = (id) => ({
  id,
  protocol_group_id: 1,
  name: `Protocol ${id}`,
  language_id: 1,
  version: 1,
  is_current: 1,
  randomization: '{"strategy":"none"}',
  required_identifiers: '[]',
  use_audio_guide: 1,
});

const mockConfigQueries = (siteRow) => {
  executeQuery.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM sites WHERE access_token')) return siteRow ? [siteRow] : [];
    if (sql.includes('FROM v_site_protocols')) return spineRows;
    if (sql.includes('FROM protocols WHERE id')) return [protocolRow(params[0])];
    if (sql.includes('FROM protocol_contents')) return [
      { protocol_task_id: null, content_type: 'consent', text_html: '<p>consent</p>' },
    ];
    if (sql.includes('FROM protocol_tasks')) return [
      { id: 100, task_id: 2, task_order: 1, params: '{"duration":3}' },
    ];
    throw new Error(`Unexpected query: ${sql}`);
  });
};

describe('getSites', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it('scopes to the user via user_sites and never selects the access token', async () => {
    executeQuery.mockResolvedValueOnce([
      { id: 1, name: 'Paris', description: 'd', is_active: 1, project_count: 2 },
    ]);

    const res = makeRes();
    await getSites({ query: { userId: '2', role: 'admin' } }, res);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('JOIN user_sites');
    expect(sql).not.toContain('access_token');
    expect(sql).not.toContain('s.*');
    expect(params).toEqual(['2']);
    expect(res.json).toHaveBeenCalled();
  });

  it('returns all sites for master role', async () => {
    executeQuery.mockResolvedValueOnce([]);

    const res = makeRes();
    await getSites({ query: { userId: '1', role: 'master' } }, res);

    const [sql] = executeQuery.mock.calls[0];
    expect(sql).not.toContain('user_sites');
    expect(sql).toContain('LEFT JOIN site_projects');
  });
});

describe('getSiteConfig', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it('returns the native config shape with protocols grouped by project', async () => {
    mockConfigQueries({ id: 1, name: 'Paris', config_json: '{"defaultLanguage":"fr"}', is_active: 1 });

    const res = makeRes();
    await getSiteConfig({ params: { token: SITE_TOKEN } }, res);

    expect(res.status).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];

    expect(payload.site).toEqual({ name: 'Paris', config_json: { defaultLanguage: 'fr' } });
    expect(payload.projects).toHaveLength(2);
    expect(payload.projects[0].protocols).toHaveLength(2);
    expect(payload.projects[1].protocols).toHaveLength(1);

    const protocol = payload.projects[0].protocols[0];
    expect(protocol).toMatchObject({
      id: 10,
      name: 'Protocol 10',
      language_code: 'en',
      randomization: { strategy: 'none' },
      required_identifiers: [],
      consent_text: '<p>consent</p>',
    });
    expect(protocol.tasks).toEqual([
      { id: 100, task_id: 2, task_order: 1, params: { duration: 3 }, contents: [] },
    ]);
  });

  it('never leaks the access token in the response body', async () => {
    mockConfigQueries({ id: 1, name: 'Paris', config_json: null, is_active: 1 });

    const res = makeRes();
    await getSiteConfig({ params: { token: SITE_TOKEN } }, res);

    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain(SITE_TOKEN);
  });

  it('returns 404 for an unknown token', async () => {
    mockConfigQueries(null);

    const res = makeRes();
    await getSiteConfig({ params: { token: 'nope' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 for a deactivated site', async () => {
    mockConfigQueries({ id: 1, name: 'Paris', config_json: null, is_active: 0 });

    const res = makeRes();
    await getSiteConfig({ params: { token: SITE_TOKEN } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('createSite', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it('generates a 32-hex access token and stores normalized config_json', async () => {
    executeQuery.mockResolvedValueOnce({ insertId: 5 });

    const res = makeRes();
    await createSite(
      { body: { name: 'Paris', description: 'desc', config_json: '{"a": 1}' }, admin: { id: 7 } },
      res
    );

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, site_id: 5 });

    const params = executeQuery.mock.calls[0][1];
    expect(params[0]).toBe('Paris');
    expect(params[2]).toMatch(/^[0-9a-f]{32}$/);
    expect(params[3]).toBe('{"a":1}');
    expect(params.at(-1)).toBe(7);
  });

  it('rejects invalid config_json without touching the database', async () => {
    const res = makeRes();
    await createSite({ body: { name: 'Paris', config_json: '{not json' }, admin: { id: 7 } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('rejects a missing name', async () => {
    const res = makeRes();
    await createSite({ body: { name: '  ' }, admin: { id: 7 } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('updateSite', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  // The payload SiteManagementPage's activate/deactivate button posts: no token,
  // no contact fields. Nothing here may clobber them.
  const base = { name: 'Paris', description: 'd', config_json: null, is_active: 1 };
  const call = async (body) => {
    const res = makeRes();
    await updateSite({ params: { id: '1' }, body, admin: { id: 7 } }, res);
    return res;
  };

  it('leaves the access token untouched when the payload omits it', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 1 });

    const res = await call(base);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/access_token\s*=\s*IFNULL\(\?, access_token\)/);
    expect(params[4]).toBeNull();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts the seeded non-hex token', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 1 });

    const res = await call({ ...base, access_token: SITE_TOKEN });

    expect(res.status).not.toHaveBeenCalled();
    expect(executeQuery.mock.calls[0][1][4]).toBe(SITE_TOKEN);
  });

  it('rejects a too-short token without touching the database', async () => {
    const res = await call({ ...base, access_token: 'abc' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('rejects an invalid entry in the comma-separated contact emails', async () => {
    const res = await call({ ...base, contact_emails: 'a@b.org, nope' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('blames the token, not the name, on a duplicate-token collision', async () => {
    executeQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), {
      code: 'ER_DUP_ENTRY',
      sqlMessage: "Duplicate entry 'x' for key 'sites.access_token'",
    }));

    const res = await call({ ...base, access_token: 'london00london00london00london00' });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toMatch(/token/i);
  });
});

describe('assignProjectToSite', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it('maps a duplicate assignment to a 400', async () => {
    executeQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));

    const res = makeRes();
    await assignProjectToSite({ params: { id: 1 }, body: { project_id: 2 } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});