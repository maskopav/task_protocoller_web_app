import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const { getProtocolsByProjectId, getProtocolById, saveProtocol } =
  await import('./protocolController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const ids = (arr) => arr.map((id) => ({ id }));

// Everything accessScope asks on the way to a controller's own query. Miss one
// and unrelated assertions start counting it as the main call.
const isScopeQuery = (sql) =>
  sql.includes('FROM user_projects WHERE user_id') ||
  sql.includes('FROM user_sites WHERE user_id') ||
  sql.includes('DISTINCT sp.') ||
  sql.includes('AND created_by = ?') ||
  sql.includes('AS flag FROM users');

// projects = explicit user_projects (the editable axis),
// viaClinics = what a clinic-only grant would imply (visible, not editable).
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

const mainCalls = () => executeQuery.mock.calls.filter(([sql]) => !isScopeQuery(sql));

beforeEach(() => {
  executeQuery.mockReset();
  executeTransaction.mockReset();
});

describe('getProtocolsByProjectId', () => {
  const mock = (scope, rows = []) => {
    const answer = scopeAnswer(scope);
    executeQuery.mockImplementation(async (sql) => answer(sql) ?? rows);
  };

  it('leaves the listing unfiltered for a master', async () => {
    executeQuery.mockResolvedValueOnce([]);

    const res = makeRes();
    await getProtocolsByProjectId({ query: {}, admin: { id: 1, role: 'master' } }, res);

    const [sql] = executeQuery.mock.calls[0];
    expect(sql).not.toContain('WHERE');
  });

  it('scopes the unfiltered listing for a non-master', async () => {
    // Protocols.jsx fetches with no project_id and filters client-side, so this
    // is the call that would otherwise leak every project's protocols.
    mock({ projects: [7] });

    const res = makeRes();
    await getProtocolsByProjectId({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE project_id IN (?)');
    expect(params).toEqual([[7]]);
  });

  it('combines an explicit project_id with the scope', async () => {
    mock({ projects: [7, 8] });

    const res = makeRes();
    await getProtocolsByProjectId({ query: { project_id: '7' }, admin: { id: 2, role: 'admin' } }, res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE project_id = ? AND project_id IN (?)');
    expect(params).toEqual(['7', [7, 8]]);
  });

  it('includes protocols of a project reached only through a clinic', async () => {
    // Read access is inherited; only the write path is restricted.
    mock({ projects: [], viaClinics: [7] });

    const res = makeRes();
    await getProtocolsByProjectId({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    expect(mainCalls()[0][1]).toEqual([[7]]);
  });

  it('returns an empty list when nothing is in scope', async () => {
    mock({});

    const res = makeRes();
    await getProtocolsByProjectId({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    expect(res.json).toHaveBeenCalledWith([]);
    expect(mainCalls()).toHaveLength(0);
  });
});

describe('getProtocolById', () => {
  const assembleQueries = (scope, { owned = true } = {}) => {
    const answer = scopeAnswer(scope);
    executeQuery.mockImplementation(async (sql) => {
      const scoped = answer(sql);
      if (scoped) return scoped;
      if (sql.includes('FROM protocols WHERE id')) return [{
        id: 10, protocol_group_id: 1, name: 'P', language_id: 1, version: 1,
        is_current: 1, randomization: '{}', required_identifiers: '[]', use_audio_guide: 1,
      }];
      if (sql.includes('FROM protocol_contents')) return [];
      if (sql.includes('FROM protocol_tasks')) return [];
      if (sql.includes('FROM project_protocols')) return owned ? [{ 1: 1 }] : [];
      if (sql.includes('JOIN languages l')) return [{ code: 'en', protocol_id: 10 }];
      throw new Error(`Unexpected query: ${sql}`);
    });
  };

  it('404s for a protocol outside the caller scope, without confirming it exists', async () => {
    assembleQueries({ projects: [7] }, { owned: false });

    const res = makeRes();
    await getProtocolById({ params: { id: '10' }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Protocol not found' });
  });

  it('serves a protocol of a project reached through a clinic', async () => {
    assembleQueries({ projects: [], viaClinics: [7] });

    const res = makeRes();
    await getProtocolById({ params: { id: '10' }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].id).toBe(10);
  });

  it('skips the ownership lookup for a master', async () => {
    assembleQueries({ projects: [] });

    const res = makeRes();
    await getProtocolById({ params: { id: '10' }, admin: { id: 1, role: 'master' } }, res);

    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('FROM project_protocols'))).toBe(false);
    expect(res.json.mock.calls[0][0].id).toBe(10);
  });
});

describe('saveProtocol', () => {
  const body = {
    name: 'P', language_id: [1], project_id: 7, tasks: [{ task_id: 2 }],
    created_by: 99, updated_by: 99,
  };

  it('refuses a project the caller only reaches through a clinic', async () => {
    // The heart of the rule: a protocol is shared by every clinic on its
    // project, so inherited read access must not let it be rewritten.
    const answer = scopeAnswer({ projects: [], viaClinics: [7] });
    executeQuery.mockImplementation(async (sql) => answer(sql) ?? []);

    const res = makeRes();
    await saveProtocol({ body, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('refuses a project the caller has no grant on at all', async () => {
    const answer = scopeAnswer({ projects: [8] });
    executeQuery.mockImplementation(async (sql) => answer(sql) ?? []);

    const res = makeRes();
    await saveProtocol({ body, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('allows a project held through an explicit grant', async () => {
    const answer = scopeAnswer({ projects: [7] });
    executeQuery.mockImplementation(async (sql) => {
      const scoped = answer(sql);
      if (scoped) return scoped;
      if (sql.includes('FROM projects WHERE id')) return [{ is_active: 1 }];
      return [];
    });
    executeTransaction.mockResolvedValue(123);

    const res = makeRes();
    await saveProtocol({ body, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(executeTransaction).toHaveBeenCalled();
  });

  it('does not consult the scope for a master', async () => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM projects WHERE id')) return [{ is_active: 1 }];
      return [];
    });
    executeTransaction.mockResolvedValue(123);

    const res = makeRes();
    await saveProtocol({ body, admin: { id: 1, role: 'master' } }, res);

    expect(executeQuery.mock.calls.some(([sql]) => isScopeQuery(sql))).toBe(false);
    expect(executeTransaction).toHaveBeenCalled();
  });

  // Authorising project_id alone left the edit path free to operate on any
  // group: passing another project's protocol_group_id retired its live version
  // (is_current = 0), dropping it out of v_site_protocols for every clinic on
  // that project. The group and the target project must match.
  describe('cross-project group guard', () => {
    const editBody = { ...body, protocol_group_id: 5, editingMode: true };

    // groupOwners = the project_ids project_protocols reports for that group
    const mockGroup = (groupOwners, { projects = [7] } = {}) => {
      const answer = scopeAnswer({ projects });
      executeQuery.mockImplementation(async (sql) => {
        const scoped = answer(sql);
        if (scoped) return scoped;
        if (sql.includes('FROM projects WHERE id')) return [{ is_active: 1 }];
        if (sql.includes('protocol_group_id = ?')) {
          return groupOwners.map((project_id) => ({ project_id }));
        }
        return [];
      });
    };

    it('refuses a group that belongs to another project', async () => {
      mockGroup([1]); // group 5 lives in project 1; the caller is saving to 7

      const res = makeRes();
      await saveProtocol({ body: editBody, admin: { id: 2, role: 'admin' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(executeTransaction).not.toHaveBeenCalled();
    });

    it('refuses it for a master too — this is an integrity check', async () => {
      mockGroup([1]);

      const res = makeRes();
      await saveProtocol({ body: editBody, admin: { id: 1, role: 'master' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(executeTransaction).not.toHaveBeenCalled();
    });

    it('allows a group that does belong to the target project', async () => {
      mockGroup([7]);
      executeTransaction.mockResolvedValue(123);

      const res = makeRes();
      await saveProtocol({ body: editBody, admin: { id: 2, role: 'admin' } }, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(executeTransaction).toHaveBeenCalled();
    });

    it('allows a group shared by several projects', async () => {
      mockGroup([1, 7]);
      executeTransaction.mockResolvedValue(123);

      const res = makeRes();
      await saveProtocol({ body: editBody, admin: { id: 2, role: 'admin' } }, res);

      expect(executeTransaction).toHaveBeenCalled();
    });

    it('lets a brand-new group through', async () => {
      mockGroup([]); // nothing recorded yet — nothing to hijack
      executeTransaction.mockResolvedValue(123);

      const res = makeRes();
      await saveProtocol({ body: editBody, admin: { id: 2, role: 'admin' } }, res);

      expect(executeTransaction).toHaveBeenCalled();
    });
  });

  it('still refuses an archived project ahead of any write', async () => {
    const answer = scopeAnswer({ projects: [7] });
    executeQuery.mockImplementation(async (sql) => {
      const scoped = answer(sql);
      if (scoped) return scoped;
      if (sql.includes('FROM projects WHERE id')) return [{ is_active: 0 }];
      return [];
    });

    const res = makeRes();
    await saveProtocol({ body, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });
});
