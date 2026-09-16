import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const {
  getSites,
  getSiteById,
  getSiteConfig,
  createSite,
  updateSite,
  assignProjectToSite,
  removeProjectFromSite,
} = await import('./siteController.js');

// requireAuth populates req.admin from the DB on every request; controllers
// read scoping from there, never from client-supplied query params.
const asAdmin = (id = 2) => ({ query: {}, params: {}, admin: { id, role: 'admin' } });
const asMaster = (id = 1) => ({ query: {}, params: {}, admin: { id, role: 'master' } });

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

// --- accessScope.js fixtures -------------------------------------------------
// Both axes are resolved through executeQuery, so tests declare what
// user_projects / user_sites hold and what deriving through site_projects would
// yield. Dispatching on the SQL keeps them independent of how many scope
// lookups a controller happens to make, and in which order.
const ids = (arr) => arr.map((id) => ({ id }));

// Everything accessScope asks on the way to a controller's own query. Miss one
// and unrelated assertions start counting it as the main call.
const isScopeQuery = (sql) =>
  sql.includes('FROM user_projects WHERE user_id') ||
  sql.includes('FROM user_sites WHERE user_id') ||
  sql.includes('DISTINCT sp.') ||
  sql.includes('AND created_by = ?') ||
  sql.includes('AS flag FROM users');

// Five lookups, told apart by their SQL:
//   ... AND can_edit = 1        -- editable projects
//   DISTINCT sp.project_id      -- projects reached through granted clinics
//   DISTINCT sp.site_id         -- clinics reached through granted projects
//   FROM user_projects WHERE    -- granted projects (any can_edit)
//   FROM user_sites WHERE       -- granted clinics
const scopeAnswer = ({ projects = [], sites = [], viaClinics = [], viaProjects = [], editable = null }) => (sql) => {
  if (sql.includes('can_edit = 1')) return ids(editable ?? projects);
  if (sql.includes('DISTINCT sp.project_id')) return ids(viaClinics);
  if (sql.includes('DISTINCT sp.site_id')) return ids(viaProjects);
  if (sql.includes('FROM user_projects WHERE user_id')) return ids(projects);
  if (sql.includes('FROM user_sites WHERE user_id')) return ids(sites);
  return null;
};

// The controller's own queries, i.e. everything that is not a scope lookup.
const mainCalls = () => executeQuery.mock.calls.filter(([sql]) => !isScopeQuery(sql));

describe('getSites', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  const siteRows = [{ id: 1, name: 'Paris', description: 'd', is_active: 1, project_count: 2 }];

  const mockSites = (scope, rows = siteRows) => {
    const answer = scopeAnswer(scope);
    executeQuery.mockImplementation(async (sql) => answer(sql) ?? rows);
  };

  it('scopes to the resolved site ids and never selects the access token', async () => {
    mockSites({ sites: [1] });

    const res = makeRes();
    await getSites(asAdmin(2), res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE s.id IN (?)');
    expect(sql).not.toContain('access_token');
    expect(sql).not.toContain('s.*');
    expect(params.at(-1)).toEqual([1]);
    expect(res.json).toHaveBeenCalled();
  });

  it('ignores a spoofed userId/role in the query string', async () => {
    mockSites({ sites: [1] });

    const res = makeRes();
    // An admin asking to be treated as a master must still be scoped.
    await getSites({ query: { userId: '1', role: 'master' }, admin: { id: 2, role: 'admin' } }, res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE s.id IN (?)');
    expect(params.at(-1)).toEqual([1]);
  });

  it('derives sites from the granted projects when no site was specified', async () => {
    // Ticking only a project must hand over that project's clinics.
    mockSites({ projects: [7], sites: [], viaProjects: [1, 2] });

    const res = makeRes();
    await getSites(asAdmin(2), res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE s.id IN (?)');
    expect(params.at(-1)).toEqual([1, 2]);
  });

  it('unions a direct clinic grant with the clinics reached through projects', async () => {
    // This is the case that broke three times: two clinics of your own used to
    // read as "the master limited me to these two" and hid everything the
    // projects reached. Now they simply add.
    mockSites({ projects: [7], sites: [6, 8], viaProjects: [1, 2, 3] });

    const res = makeRes();
    await getSites(asAdmin(2), res);

    expect(mainCalls()[0][1].at(-1)).toEqual([6, 8, 1, 2, 3]);
  });

  it('returns an empty list when the admin has no grant on either axis', async () => {
    mockSites({});

    const res = makeRes();
    await getSites(asAdmin(2), res);

    expect(res.json).toHaveBeenCalledWith([]);
    expect(mainCalls()).toHaveLength(0);
  });

  it('counts only the projects the caller may see', async () => {
    mockSites({ projects: [7], sites: [1] });

    const res = makeRes();
    await getSites(asAdmin(2), res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('AND sp.project_id IN (?)');
    expect(params[0]).toEqual([7]);
  });

  it('returns all sites for master role', async () => {
    executeQuery.mockResolvedValueOnce([]);

    const res = makeRes();
    await getSites(asMaster(), res);

    const [sql] = executeQuery.mock.calls[0];
    expect(sql).not.toContain('user_sites');
    expect(sql).toContain('LEFT JOIN site_projects');
  });

  it('scopes the ?project_id= listing for a non-master', async () => {
    mockSites({ projects: [7], sites: [1] }, []);

    const res = makeRes();
    await getSites({ query: { project_id: '7' }, admin: { id: 2, role: 'admin' } }, res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE sp.project_id = ? AND s.id IN (?)');
    expect(sql).not.toContain('access_token');
    expect(params).toEqual(['7', [1]]);
  });

  it('returns nothing for ?project_id= naming a project the caller cannot see', async () => {
    mockSites({ projects: [7], sites: [1] });

    const res = makeRes();
    await getSites({ query: { project_id: '99' }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.json).toHaveBeenCalledWith([]);
    expect(mainCalls()).toHaveLength(0);
  });

  it('strips the access token from rows returned to a non-master', async () => {
    mockSites({ sites: [1] }, [{ id: 1, name: 'Paris', access_token: SITE_TOKEN, config_json: null }]);

    const res = makeRes();
    await getSites(asAdmin(2), res);

    const [payload] = res.json.mock.calls[0];
    expect(payload[0]).not.toHaveProperty('access_token');
    expect(JSON.stringify(payload)).not.toContain(SITE_TOKEN);
  });

  it('keeps the access token for a master', async () => {
    executeQuery.mockResolvedValueOnce([
      { id: 1, name: 'Paris', access_token: SITE_TOKEN, config_json: null },
    ]);

    const res = makeRes();
    await getSites(asMaster(), res);

    const [payload] = res.json.mock.calls[0];
    expect(payload[0].access_token).toBe(SITE_TOKEN);
  });
});

describe('getSiteById', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  const siteRecord = { id: 5, name: 'London', access_token: SITE_TOKEN, config_json: null };

  const mockSite = (scope, { projects = [], protocols = [], owns = false } = {}) => {
    const answer = scopeAnswer(scope);
    executeQuery.mockImplementation(async (sql) => {
      const scoped = answer(sql);
      if (scoped) return scoped;
      // ownsRecord, behind the can_manage flag on the response.
      if (sql.includes('AND created_by = ?')) return owns ? [{ 1: 1 }] : [];
      if (sql.includes('FROM sites WHERE id')) return [siteRecord];
      if (sql.includes('FROM site_projects sp')) return projects;
      if (sql.includes('FROM v_site_protocols')) return protocols;
      throw new Error(`Unexpected query: ${sql}`);
    });
  };

  it('404s for a site the admin cannot reach, without leaking its existence', async () => {
    mockSite({ sites: [1] }); // site 5 is not in scope

    const res = makeRes();
    await getSiteById({ params: { id: '5' }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Site not found' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(SITE_TOKEN);
  });

  it('reaches a site derived from a granted project', async () => {
    mockSite({ projects: [7], viaProjects: [5] }, { projects: [{ id: 7, name: 'Project A' }] });

    const res = makeRes();
    await getSiteById({ params: { id: '5' }, admin: { id: 2, role: 'admin' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.name).toBe('London');
    expect(payload).not.toHaveProperty('access_token');
  });

  it('narrows the nested project and protocol lists to the visible projects', async () => {
    mockSite({ projects: [7], sites: [5] });

    const res = makeRes();
    await getSiteById({ params: { id: '5' }, admin: { id: 2, role: 'admin' } }, res);

    const nested = mainCalls().filter(([sql]) => !sql.includes('FROM sites WHERE id'));
    expect(nested).toHaveLength(2);
    for (const [sql, params] of nested) {
      expect(sql).toContain('IN (?)');
      expect(params).toEqual(['5', [7]]);
    }
  });

  it('serves an empty site when the admin can see no project on it', async () => {
    mockSite({ sites: [5] }); // explicit site, nothing to derive projects from

    const res = makeRes();
    await getSiteById({ params: { id: '5' }, admin: { id: 2, role: 'admin' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.projects).toEqual([]);
    expect(payload.protocols).toEqual([]);
  });

  it('skips the scope lookups for a master and returns the token', async () => {
    executeQuery
      .mockResolvedValueOnce([siteRecord])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = makeRes();
    await getSiteById({ params: { id: '5' }, admin: { id: 1, role: 'master' } }, res);

    expect(executeQuery.mock.calls.some(([sql]) => isScopeQuery(sql))).toBe(false);
    const [payload] = res.json.mock.calls[0];
    expect(payload.access_token).toBe(SITE_TOKEN);
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
      { body: { name: 'Paris', description: 'desc', config_json: '{"a": 1}' }, admin: { id: 1, role: 'master' } },
      res
    );

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, site_id: 5 });

    const params = executeQuery.mock.calls[0][1];
    expect(params[0]).toBe('Paris');
    expect(params[2]).toMatch(/^[0-9a-f]{32}$/);
    expect(params[3]).toBe('{"a":1}');
    expect(params.at(-1)).toBe(1); // created_by comes from the session
  });

  it('rejects invalid config_json without touching the database', async () => {
    const res = makeRes();
    await createSite({ body: { name: 'Paris', config_json: '{not json' }, admin: { id: 1, role: 'master' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('rejects a missing name', async () => {
    const res = makeRes();
    await createSite({ body: { name: '  ' }, admin: { id: 1, role: 'master' } }, res);

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
    await updateSite({ params: { id: '1' }, body, admin: { id: 1, role: 'master' } }, res);
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
    await assignProjectToSite({ params: { id: 1 }, body: { project_id: 2 }, admin: { id: 1, role: 'master' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// --- delegated write rights --------------------------------------------------
// A master can hand out three things independently: the right to change a
// project (user_projects.can_edit), the right to create projects
// (users.can_create_projects), and — implied by the first — the right to create
// clinics. Ownership (created_by) is what stops any of that from reaching
// records that were already there.
describe('delegated write rights', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  // editable = rows of user_projects carrying can_edit; owns = created_by match
  const mockRights = ({ editable = [], owns = false, mayCreate = false, extra } = {}) => {
    executeQuery.mockImplementation(async (sql, params) => {
      if (sql.includes('can_edit = 1')) return ids(editable);
      if (sql.includes('DISTINCT sp.')) return [];
      if (sql.includes('FROM user_projects WHERE user_id')) return ids(editable);
      if (sql.includes('FROM user_sites WHERE user_id')) return [];
      if (sql.includes('can_create_sites')) return [{ flag: mayCreate ? 1 : 0 }];
      if (sql.includes('AND created_by = ?')) return owns ? [{ 1: 1 }] : [];
      if (extra) {
        const hit = extra(sql, params);
        if (hit !== undefined) return hit;
      }
      return [];
    });
  };

  describe('createSite', () => {
    const body = { name: 'New Clinic' };

    it('refuses an admin without the create-sites right', async () => {
      mockRights({ editable: [7], mayCreate: false });

      const res = makeRes();
      await createSite({ body, admin: { id: 2, role: 'admin' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO sites'))).toBe(false);
    });

    it('allows an admin the master granted the right to', async () => {
      mockRights({
        editable: [],
        mayCreate: true,
        extra: (sql) => (sql.includes('INSERT INTO sites') ? { insertId: 5 } : undefined),
      });

      const res = makeRes();
      await createSite({ body, admin: { id: 2, role: 'admin' } }, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      const insert = executeQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO sites'));
      expect(insert[1].at(-1)).toBe(2); // created_by is the creator
    });

    it('grants the creator an explicit, revocable assignment', async () => {
      mockRights({
        editable: [],
        mayCreate: true,
        extra: (sql) => (sql.includes('INSERT INTO sites') ? { insertId: 5 } : undefined),
      });

      const res = makeRes();
      await createSite({ body, admin: { id: 2, role: 'admin' } }, res);

      const grant = executeQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO user_sites'));
      expect(grant).toBeTruthy();
      expect(grant[1]).toEqual([2, 5]);
    });

    it('writes no assignment for a master, who sees every clinic anyway', async () => {
      executeQuery.mockResolvedValue({ insertId: 5 });

      const res = makeRes();
      await createSite({ body, admin: { id: 1, role: 'master' } }, res);

      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO user_sites'))).toBe(false);
    });
  });

  describe('updateSite', () => {
    const body = { name: 'Renamed' };

    it('refuses a clinic the admin did not create', async () => {
      mockRights({ editable: [7], owns: false });

      const res = makeRes();
      await updateSite({ params: { id: '5' }, body, admin: { id: 2, role: 'admin' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('UPDATE sites'))).toBe(false);
    });

    it('lets the creator archive their own clinic', async () => {
      // "Archive instead of delete": is_active = 0 through the normal update.
      mockRights({
        editable: [7],
        owns: true,
        extra: (sql) => (sql.includes('UPDATE sites') ? { affectedRows: 1 } : undefined),
      });

      const res = makeRes();
      await updateSite(
        { params: { id: '5' }, body: { name: 'Mine', is_active: 0 }, admin: { id: 2, role: 'admin' } },
        res
      );

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('UPDATE sites'))).toBe(true);
    });

    it('ignores an access token sent by a non-master', async () => {
      // The token is never shown to them, so a value here can only be a mistake
      // or an attempt; IFNULL turns the null into "leave it alone".
      mockRights({
        editable: [7],
        owns: true,
        extra: (sql) => (sql.includes('UPDATE sites') ? { affectedRows: 1 } : undefined),
      });

      const res = makeRes();
      await updateSite(
        {
          params: { id: '5' },
          body: { name: 'Mine', access_token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          admin: { id: 2, role: 'admin' },
        },
        res
      );

      const update = executeQuery.mock.calls.find(([sql]) => sql.includes('UPDATE sites'));
      expect(update[1]).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    it('still lets a master set the token', async () => {
      executeQuery.mockResolvedValue({ affectedRows: 1 });

      const res = makeRes();
      await updateSite(
        {
          params: { id: '5' },
          body: { name: 'Mine', access_token: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
          admin: { id: 1, role: 'master' },
        },
        res
      );

      const update = executeQuery.mock.calls.find(([sql]) => sql.includes('UPDATE sites'));
      expect(update[1]).toContain('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    });
  });

  describe('assignProjectToSite / removeProjectFromSite', () => {
    it('refuses wiring a project the admin cannot edit', async () => {
      mockRights({ editable: [7], owns: true });

      const res = makeRes();
      await assignProjectToSite(
        { params: { id: '5' }, body: { project_id: 99 }, admin: { id: 2, role: 'admin' } },
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO site_projects'))).toBe(false);
    });

    it('refuses wiring to a clinic the admin did not create', async () => {
      mockRights({ editable: [7], owns: false });

      const res = makeRes();
      await assignProjectToSite(
        { params: { id: '5' }, body: { project_id: 7 }, admin: { id: 2, role: 'admin' } },
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows own project onto own clinic', async () => {
      mockRights({ editable: [7], owns: true });

      const res = makeRes();
      await assignProjectToSite(
        { params: { id: '5' }, body: { project_id: 7 }, admin: { id: 2, role: 'admin' } },
        res
      );

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO site_projects'))).toBe(true);
    });

    it('refuses detaching a clinic that was already there', async () => {
      // The whole point of the ownership rule: a pre-existing clinic cannot be
      // unhooked from a project by anyone but a master.
      mockRights({ editable: [7], owns: false });

      const res = makeRes();
      await removeProjectFromSite(
        { params: { id: '5', projectId: '7' }, admin: { id: 2, role: 'admin' } },
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('DELETE FROM site_projects'))).toBe(false);
    });

    it('lets a master detach anything', async () => {
      executeQuery.mockResolvedValue({});

      const res = makeRes();
      await removeProjectFromSite(
        { params: { id: '5', projectId: '7' }, admin: { id: 1, role: 'master' } },
        res
      );

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(executeQuery.mock.calls.some(([sql]) => sql.includes('DELETE FROM site_projects'))).toBe(true);
    });
  });
});
