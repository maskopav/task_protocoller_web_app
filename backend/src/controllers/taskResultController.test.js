import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({ executeQuery: vi.fn() }));
vi.mock("../utils/logger.js", () => ({ logToFile: vi.fn() }));

const { saveTaskResult } = await import("./taskResultController.js");
const { executeQuery } = await import("../db/queryHelper.js");

const call = async (body) => {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  await saveTaskResult({ body }, res);
  return res;
};
const base = { sessionId: 7, protocolTaskId: 3, repeatIndex: 1 };
const sql = (i) => executeQuery.mock.calls[i][0];

describe("saveTaskResult", () => {
  beforeEach(() => executeQuery.mockReset());

  it("inserts a new row by default", async () => {
    await call({ ...base, payload: { a: 1 } });
    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(sql(0)).toMatch(/^INSERT/);
  });

  it("with replace, inserts the first save and overwrites later ones", async () => {
    executeQuery.mockResolvedValueOnce([]);
    await call({ ...base, replace: true, payload: { completed: false, answers: { s1: 1 } } });
    expect(sql(1)).toMatch(/^INSERT/);

    executeQuery.mockReset();
    executeQuery.mockResolvedValueOnce([{ id: 42, payload: '{"completed":false}' }]);
    await call({ ...base, replace: true, payload: { completed: true, answers: { s1: 1, s2: 2 } } });
    expect(sql(1)).toMatch(/^UPDATE/);
    expect(executeQuery.mock.calls[1][1]).toEqual([JSON.stringify({ completed: true, answers: { s1: 1, s2: 2 } }), 42]);
  });

  it("never lets a late partial save overwrite a finished result", async () => {
    executeQuery.mockResolvedValueOnce([{ id: 42, payload: { completed: true } }]);
    const res = await call({ ...base, replace: true, payload: { completed: false } });
    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ success: true, ignored: true });
  });
});
