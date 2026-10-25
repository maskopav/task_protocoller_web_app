import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/connection.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../utils/accessScope.js', () => ({ getVisibleProjectIds: vi.fn() }));

const pool = (await import('../db/connection.js')).default;
const { getVisibleProjectIds } = await import('../utils/accessScope.js');
const router = (await import('./mappings.js')).default;
const handler = router.stack.find((l) => l.route?.path === '/').route.stack[0].handle;

const run = async (admin, tables) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ admin, query: { tables } }, res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  pool.query.mockResolvedValue([[{ id: 1 }]]);
});

describe('GET /mappings scoping (spec section 4)', () => {
  it('limits projects and protocols to the studies a non-master sees', async () => {
    getVisibleProjectIds.mockResolvedValue([3, 4]);
    await run({ id: 9, role: 'admin' }, 'projects,protocols,tasks');
    const sqls = pool.query.mock.calls;
    expect(sqls[0]).toEqual(['SELECT * FROM `projects` WHERE `id` IN (?)', [[3, 4]]]);
    expect(sqls[1]).toEqual(['SELECT * FROM `protocols` WHERE `project_id` IN (?)', [[3, 4]]]);
    expect(sqls[2][0]).toBe('SELECT * FROM `tasks`');
  });

  it('returns empty lists without querying when nothing is visible', async () => {
    getVisibleProjectIds.mockResolvedValue([]);
    const res = await run({ id: 9, role: 'admin' }, 'projects,protocols');
    expect(pool.query).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ projects: [], protocols: [] });
  });

  it('leaves master unscoped', async () => {
    await run({ id: 1, role: 'master' }, 'projects');
    expect(getVisibleProjectIds).not.toHaveBeenCalled();
    expect(pool.query.mock.calls[0][0]).toBe('SELECT * FROM `projects`');
  });
});
