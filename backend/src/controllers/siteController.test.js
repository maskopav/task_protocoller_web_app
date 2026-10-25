import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));
// Access rules are tested in accessScope.test.js; here they are inputs.
vi.mock('../utils/accessScope.js', () => ({
  getVisibleSiteIds: vi.fn(),
  getVisibleProjectIds: vi.fn(),
  getEditableProjectIds: vi.fn(),
  canCreateSites: vi.fn(),
  ownsRecord: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const { getVisibleSiteIds, getVisibleProjectIds, getEditableProjectIds, canCreateSites, ownsRecord } =
  await import('../utils/accessScope.js');
const {
  getSites,
  getSiteById,
  getSiteConfig,
  createSite,
  updateSite,
  groupReceives,
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

// 10 (en) and 11 (cs) are language variants of one protocol group; 12 is a
// different group. The ext config merges variants into one entry.
const protocolRow = (id) => ({
  id,
  protocol_group_id: id === 12 ? 2 : 1,
  name: `Protocol ${id === 12 ? 12 : 10}`,
  language_id: id === 11 ? 2 : 1,
  version: 1,
  is_current: 1,
  updated_at: '2026-09-10 09:30:00',
  randomization: '{"strategy":"none"}',
  required_identifiers: '["external_id"]',
  use_audio_guide: 1,
  recordings_file_name: null,
  instructions_pdf_url: null,
});

const mockConfigQueries = (siteRow) => {
  executeQuery.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM sites WHERE access_token')) return siteRow ? [siteRow] : [];
    if (sql.includes('FROM v_site_protocols')) return spineRows;
    if (sql.includes('FROM tasks t JOIN task_types')) return [{ id: 2, category: 'syllableRepeating', type: 'voice' }];
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

describe('getSiteConfig', () => {
  beforeEach(() => {
    executeQuery.mockReset();
  });

  it('returns the desktop-app config with variants merged and each protocol naming its project', async () => {
    mockConfigQueries({ id: 1, name: 'Paris', config_json: '{"defaultLanguage":"cs","useCalibration":false}', is_active: 1, updated_at: '2026-09-01 10:00:00' });

    const res = makeRes();
    await getSiteConfig({ params: { token: SITE_TOKEN } }, res);

    expect(res.status).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];

    expect(payload).not.toHaveProperty('site');
    expect(payload).toMatchObject({
      schemaVersion: 1,
      configVersion: '2026-09-10.093000',
      defaultLanguage: 'cs',
      languages: ['cs', 'en'],
      useCalibration: false,
      enableEditor: false,
    });
    expect(payload).not.toHaveProperty('projects');
    // 10 (en) + 11 (cs) merged under Project A; one protocol under Project B
    expect(payload.protocols.map((p) => p.project)).toEqual(['Project A', 'Project B']);

    const protocol = payload.protocols[0];
    expect(protocol.name).toBe('Protocol 10');
    expect(protocol.recordingsFileName).toContain('${taskIndex}');
    expect(protocol.patientFields.map((f) => f.name)).toEqual(['patient_code']); // legacy external_id
    expect(protocol.tasks).toEqual([
      expect.objectContaining({ type: 'VOCAL', subtype: 'SYLLABLES', titleKey: 'p1_t1_title', length: 3, nrepetition: 1, canRepeat: true, canSkip: false, showIndicator: true, recordVideo: false }),
    ]);
    for (const lang of ['cs', 'en']) {
      expect(payload.strings[lang]).toHaveProperty('p1_t1_title');
      for (const k of protocol.tasks[0].instructionKeys) expect(payload.strings[lang]).toHaveProperty(k);
    }
    // native-only fields never leave the server
    expect(JSON.stringify(payload)).not.toMatch(/"(task_id|language_id|global_contents|randomization|info_text)"/);
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

  describe('implicit device registration', () => {
    const SITE = { id: 7, name: 'Paris', config_json: null, is_active: 1, updated_at: '2026-09-01 10:00:00' };
    const deviceCalls = () => executeQuery.mock.calls.filter(([sql]) => sql.includes('INTO devices'));
    // existingSite: the site_id the device already has (undefined = no such device).
    const withDevices = (onDevice = async () => [], existingSite) => {
      mockConfigQueries(SITE);
      const base = executeQuery.getMockImplementation();
      executeQuery.mockImplementation(async (sql, params) => {
        if (sql.includes('INTO devices')) return onDevice(sql, params);
        if (sql.includes('FROM devices WHERE installation_id')) return existingSite === undefined ? [] : [{ site_id: existingSite }];
        return base(sql, params);
      });
    };

    it('upserts the device with site, version and the served configVersion', async () => {
      withDevices();
      const res = makeRes();
      await getSiteConfig({ params: { token: SITE_TOKEN }, query: { installationId: 'dev-ABC-1', appVersion: '1.4.2' } }, res);

      const config = res.json.mock.calls[0][0];
      expect(deviceCalls()).toHaveLength(1);
      expect(deviceCalls()[0][1]).toEqual(['dev-ABC-1', 7, '1.4.2', config.configVersion]);
    });

    it('never takes over a device that belongs to another site', async () => {
      withDevices(undefined, 99);
      const res = makeRes();
      await getSiteConfig({ params: { token: SITE_TOKEN }, query: { installationId: 'dev-ABC-1' } }, res);
      expect(deviceCalls()).toHaveLength(0);
      expect(res.json).toHaveBeenCalled(); // the config is still served
    });

    it('does not touch devices without an installationId', async () => {
      withDevices();
      await getSiteConfig({ params: { token: SITE_TOKEN }, query: {} }, makeRes());
      expect(deviceCalls()).toHaveLength(0);
    });

    it('ignores an invalid installationId and an invalid appVersion', async () => {
      withDevices();
      const res = makeRes();
      await getSiteConfig({ params: { token: SITE_TOKEN }, query: { installationId: 'bad id!', appVersion: 'x' } }, res);
      expect(deviceCalls()).toHaveLength(0);
      expect(res.json).toHaveBeenCalled();

      executeQuery.mockReset();
      withDevices();
      await getSiteConfig({ params: { token: SITE_TOKEN }, query: { installationId: 'dev1', appVersion: 'a\nb' } }, makeRes());
      expect(deviceCalls()[0][1][2]).toBeNull();
    });

    it('does not register a device for an unknown token', async () => {
      mockConfigQueries(null);
      await getSiteConfig({ params: { token: 'nope' }, query: { installationId: 'dev1' } }, makeRes());
      expect(deviceCalls()).toHaveLength(0);
    });

    it('still serves the config when the device upsert fails', async () => {
      withDevices(async () => { throw new Error('db down'); });
      const res = makeRes();
      await getSiteConfig({ params: { token: SITE_TOKEN }, query: { installationId: 'dev1' } }, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0]).toHaveProperty('configVersion');
    });
  });
});


const scope = ({ sites = [], projects = [], editable = [], owns = false, canCreate = false } = {}) => {
  getVisibleSiteIds.mockResolvedValue(sites);
  getVisibleProjectIds.mockResolvedValue(projects);
  getEditableProjectIds.mockResolvedValue(editable);
  ownsRecord.mockResolvedValue(owns);
  canCreateSites.mockResolvedValue(canCreate);
};

describe('getSites', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    scope();
  });

  const rows = [{ id: 1, name: 'Paris', description: 'd', is_active: 1, project_count: 2, created_by: 2, access_token: SITE_TOKEN }];

  it('scopes a non-master to the visible clinics and never selects the access token', async () => {
    scope({ sites: [1], projects: [4] });
    executeQuery.mockResolvedValue(rows);
    const res = makeRes();
    await getSites(asAdmin(2), res);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('WHERE s.id IN (?)');
    expect(sql).not.toContain('access_token');
    expect(sql).not.toContain('s.*');
    expect(params).toEqual([[4], [1]]);
  });

  it('ignores a spoofed userId/role in the query string', async () => {
    scope({ sites: [1] });
    executeQuery.mockResolvedValue(rows);
    const res = makeRes();
    await getSites({ query: { userId: '1', role: 'master' }, admin: { id: 2, role: 'admin' } }, res);
    expect(executeQuery.mock.calls[0][0]).toContain('WHERE s.id IN (?)');
  });

  it('returns an empty list when the user sees no clinic', async () => {
    const res = makeRes();
    await getSites(asAdmin(2), res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('?project_id= for a study the caller cannot see yields nothing', async () => {
    scope({ sites: [1], projects: [4] });
    const res = makeRes();
    await getSites({ ...asAdmin(2), query: { project_id: '9' } }, res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('strips the token for a non-master, flags ownership and hides created_by', async () => {
    scope({ sites: [1], projects: [] });
    executeQuery.mockResolvedValue(rows);
    const res = makeRes();
    await getSites(asAdmin(2), res);
    const [site] = res.json.mock.calls[0][0];
    expect(site).not.toHaveProperty('access_token');
    expect(site).not.toHaveProperty('created_by');
    expect(site).toMatchObject({ is_owner: true, can_edit: true });
  });

  it('a non-owner non-master cannot edit', async () => {
    scope({ sites: [1] });
    executeQuery.mockResolvedValue(rows);
    const res = makeRes();
    await getSites(asAdmin(3), res);
    expect(res.json.mock.calls[0][0][0]).toMatchObject({ is_owner: false, can_edit: false });
  });

  it('master gets everything including the token, without scope lookups', async () => {
    executeQuery.mockResolvedValue(rows);
    const res = makeRes();
    await getSites(asMaster(), res);
    expect(getVisibleSiteIds).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0][0]).toMatchObject({ access_token: SITE_TOKEN, can_edit: true });
  });
});

describe('groupReceives', () => {
  it('groups by study, then by protocol, merging language variants', () => {
    const rows = [
      { project_id: 1, project_name: 'A', protocol_id: 10, protocol_name: 'Speech', protocol_version: 2, language_code: 'cs' },
      { project_id: 1, project_name: 'A', protocol_id: 11, protocol_name: 'Speech', protocol_version: 2, language_code: 'en' },
      { project_id: 1, project_name: 'A', protocol_id: 12, protocol_name: 'Video', protocol_version: 1, language_code: 'en' },
      { project_id: 2, project_name: 'B', protocol_id: 13, protocol_name: 'Speech', protocol_version: 1, language_code: 'en' },
    ];
    expect(groupReceives(rows)).toEqual([
      { project_id: 1, project_name: 'A', protocols: [
        { protocol_id: 10, name: 'Speech', version: 2, languages: ['cs', 'en'] },
        { protocol_id: 12, name: 'Video', version: 1, languages: ['en'] },
      ] },
      { project_id: 2, project_name: 'B', protocols: [{ protocol_id: 13, name: 'Speech', version: 1, languages: ['en'] }] },
    ]);
  });
});

describe('getSiteById', () => {
  const site = { id: 1, name: 'Paris', access_token: SITE_TOKEN, config_json: null, is_active: 1, created_by: 2 };
  const mockSite = (projects = [], protocols = []) => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM sites WHERE id')) return [site];
      if (sql.includes('FROM site_projects sp')) return projects;
      if (sql.includes('FROM v_site_protocols')) return protocols;
      throw new Error(`Unexpected query: ${sql}`);
    });
  };
  const call = async (req) => {
    const res = makeRes();
    await getSiteById({ ...req, params: { id: '1' } }, res);
    return res;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    scope();
  });

  it('404 not_found for a clinic the admin cannot see, without leaking its existence', async () => {
    scope({ sites: [2] });
    mockSite();
    const res = await call(asAdmin(2));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'not_found' });
  });

  it('returns projects with can_edit and receives[] grouped by study', async () => {
    scope({ sites: [1], projects: [4, 5], editable: [4], owns: false });
    mockSite(
      [
        { id: 4, name: 'Mine', is_active: 1, created_by: 2, assigned_at: 't' },
        { id: 5, name: 'Received', is_active: 1, created_by: 9, assigned_at: 't' },
      ],
      [{ project_id: 4, project_name: 'Mine', protocol_id: 10, protocol_name: 'P', protocol_version: 1, language_code: 'en' }],
    );
    const res = await call(asAdmin(2));
    const body = res.json.mock.calls[0][0];
    expect(body.projects.map((p) => [p.id, p.can_edit, p.is_owner])).toEqual([[4, true, true], [5, false, false]]);
    expect(body.receives).toEqual([
      { project_id: 4, project_name: 'Mine', protocols: [{ protocol_id: 10, name: 'P', version: 1, languages: ['en'] }] },
    ]);
    expect(body).not.toHaveProperty('access_token');
    expect(body).not.toHaveProperty('protocols');
  });

  it('narrows the nested lists to the visible studies', async () => {
    scope({ sites: [1], projects: [4] });
    mockSite();
    await call(asAdmin(2));
    const nested = executeQuery.mock.calls.filter(([sql]) => sql.includes('site_projects sp') || sql.includes('v_site_protocols'));
    for (const [sql, params] of nested) {
      expect(sql).toContain('IN (?)');
      expect(params[1]).toEqual([4]);
    }
  });

  it('serves empty lists when the admin sees no study on the clinic', async () => {
    scope({ sites: [1], projects: [] });
    mockSite();
    const res = await call(asAdmin(2));
    expect(res.json.mock.calls[0][0]).toMatchObject({ projects: [], receives: [] });
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });

  it('master skips the scope lookups, gets the token and can edit every study', async () => {
    mockSite([{ id: 4, name: 'S', is_active: 1, created_by: 9, assigned_at: 't' }]);
    const res = await call(asMaster());
    expect(getVisibleSiteIds).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.access_token).toBe(SITE_TOKEN);
    expect(body.projects[0]).toMatchObject({ can_edit: true });
    expect(body.can_manage).toBe(true);
  });
});

describe('createSite', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    scope({ canCreate: true });
  });
  const master = { id: 1, role: 'master' };
  const call = async (body, admin = master) => {
    const res = makeRes();
    await createSite({ body, admin }, res);
    return res;
  };

  it('generates a 32-hex access token, stores the known settings only, answers 201', async () => {
    executeQuery.mockResolvedValueOnce({ insertId: 4 });
    const res = await call({
      name: 'Olomouc University Hospital',
      config_json: { defaultLanguage: 'cs', bogus: 1 },
    });
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO sites');
    expect(params[0]).toBe('Olomouc University Hospital');
    expect(params[2]).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(params[3])).toEqual({ defaultLanguage: 'cs' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, site_id: 4 });
  });

  it('rejects an empty or missing name with 400 invalid_name', async () => {
    for (const name of [undefined, '', '   ']) {
      executeQuery.mockReset();
      const res = await call({ name });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid_name' });
      expect(executeQuery).not.toHaveBeenCalled();
    }
  });

  it('rejects invalid config_json and badly typed settings without touching the database', async () => {
    const bad = await call({ name: 'Paris', config_json: '{nope' });
    expect(bad.json.mock.calls[0][0].error).toBe('invalid_config');
    const typed = await call({ name: 'Paris', config_json: { useCalibration: 'yes' } });
    expect(typed.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('403 for a non-master without can_create_sites; allowed with it, creator gets assigned', async () => {
    scope({ canCreate: false });
    const denied = await call({ name: 'Paris' }, { id: 2, role: 'admin' });
    expect(denied.status).toHaveBeenCalledWith(403);
    expect(executeQuery).not.toHaveBeenCalled();

    scope({ canCreate: true });
    executeQuery.mockResolvedValueOnce({ insertId: 8 }).mockResolvedValueOnce({});
    await call({ name: 'Paris' }, { id: 2, role: 'admin' });
    expect(executeQuery.mock.calls[1]).toEqual([expect.stringContaining('INSERT INTO user_sites'), [2, 8]]);
  });

  it('409 name_taken / token_taken on a duplicate', async () => {
    executeQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY', sqlMessage: "for key 'sites.name'" }));
    const name = await call({ name: 'Paris' });
    expect(name.status).toHaveBeenCalledWith(409);
    expect(name.json).toHaveBeenCalledWith({ error: 'name_taken' });

    executeQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY', sqlMessage: "for key 'sites.access_token'" }));
    const token = await call({ name: 'Paris2', access_token: SITE_TOKEN });
    expect(token.json).toHaveBeenCalledWith({ error: 'token_taken' });
  });
});

describe('updateSite (PATCH)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    scope({ sites: [1], owns: true });
  });
  const master = { id: 1, role: 'master' };
  const call = async (body, admin = master) => {
    const res = makeRes();
    await updateSite({ params: { id: '1' }, body, admin }, res);
    return res;
  };

  it('updates only the fields that are present', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 1 });
    const res = await call({ is_active: false, country: 'CZ' });
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toMatch(/SET is_active = \?, country = \?, updated_at/);
    expect(sql).not.toContain('access_token');
    expect(params).toEqual([0, 'CZ', 1, '1']);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('an empty string clears a text field', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 1 });
    await call({ contact_persons: '' });
    expect(executeQuery.mock.calls[0][1][0]).toBeNull();
  });

  it('master can rotate the token', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 1 });
    await call({ access_token: SITE_TOKEN });
    expect(executeQuery.mock.calls[0][0]).toContain('access_token = ?');
    expect(executeQuery.mock.calls[0][1][0]).toBe(SITE_TOKEN);
  });

  it('the creator (non-master) cannot rotate the token: it is ignored', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 1 });
    await call({ name: 'Paris', access_token: SITE_TOKEN }, { id: 2, role: 'admin' });
    expect(executeQuery.mock.calls[0][0]).not.toContain('access_token');
  });

  it('rejects a too-short token, a bad email, a bad name and an empty patch', async () => {
    expect((await call({ access_token: 'abc' })).json).toHaveBeenCalledWith({ error: 'invalid_token' });
    expect((await call({ contact_emails: 'a@b.org, nope' })).json.mock.calls[0][0].error).toBe('invalid_email');
    expect((await call({ name: '' })).json).toHaveBeenCalledWith({ error: 'invalid_name' });
    expect((await call({})).json).toHaveBeenCalledWith({ error: 'no_changes' });
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('404 for a clinic out of scope, 403 for a visible clinic the user did not create', async () => {
    scope({ sites: [2] });
    const hidden = await call({ name: 'x' }, { id: 2, role: 'admin' });
    expect(hidden.status).toHaveBeenCalledWith(404);

    scope({ sites: [1], owns: false });
    const denied = await call({ name: 'x' }, { id: 2, role: 'admin' });
    expect(denied.status).toHaveBeenCalledWith(403);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('404 when a master patches a missing clinic; 409 token_taken on collision', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 0 });
    expect((await call({ name: 'x' })).status).toHaveBeenCalledWith(404);

    executeQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), {
      code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'x' for key 'sites.access_token'",
    }));
    const res = await call({ access_token: 'london00london00london00london00' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'token_taken' });
  });
});
