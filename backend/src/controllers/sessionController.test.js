import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
}));
vi.mock("../db/connection.js", () => ({
  default: { query: vi.fn(), getConnection: vi.fn() },
}));

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// ALLOW_PROTOCOL_RERUN (src/config/constants.js) is read from process.env at
// module-load time, so each test needs a fresh import after setting the env
// var -- vi.resetModules() forces constants.js to re-evaluate. The mocked db
// modules are NOT re-instantiated by resetModules() though (Vitest keeps the
// same vi.fn() across it for statically vi.mock()'d modules), so their call
// history has to be cleared explicitly here rather than relied on to reset.
async function loadInitSession() {
  const { executeQuery } = await import("../db/queryHelper.js");
  const { default: pool } = await import("../db/connection.js");
  const { initSession } = await import("./sessionController.js");
  executeQuery.mockReset();
  pool.query.mockReset();
  pool.getConnection.mockReset();
  return { initSession, executeQuery, pool };
}

describe("initSession — resuming an already-completed session", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ALLOW_PROTOCOL_RERUN;
  });
  afterEach(() => {
    delete process.env.ALLOW_PROTOCOL_RERUN;
  });

  // The bug this guards against: BookingStep.jsx marks sessions.completed=1
  // the moment a participant reaches the follow-up booking step (see
  // bookingController's 409 gate, which requires completed_at to be set) --
  // well before they've actually picked a slot. If reopening the link after
  // that point doesn't hit this "already completed" shortcut, initSession
  // falls all the way through to inserting a brand-new session, silently
  // wiping the participant's entire completed protocol and restarting them
  // at task 1 instead of dropping them back into the booking step.
  it("hands back the existing completed session (pointing at the booking step) instead of starting a new run", async () => {
    const { initSession, executeQuery, pool } = await loadInitSession();
    executeQuery
      .mockResolvedValueOnce([{ id: 42 }]) // token -> participant_protocol_id
      .mockResolvedValueOnce([{ // completed session lookup
        id: 900, current_task_index: 7, progress: "[]", task_order: "[1,2,3]",
      }]);
    const req = { body: { token: "tok", taskOrder: [1, 2, 3] }, headers: {}, socket: {} };
    const res = makeRes();

    await initSession(req, res);

    expect(res.body).toMatchObject({ success: true, sessionId: 900, currentTaskIndex: 7, resumed: true, completed: true });
    expect(pool.getConnection).not.toHaveBeenCalled(); // no new session inserted
    expect(executeQuery).toHaveBeenCalledTimes(2); // never reached the incomplete-session lookup
  });

  // Documents the intentional opt-in escape hatch: explicitly setting
  // ALLOW_PROTOCOL_RERUN=true (internal testing only, per constants.js) skips
  // the shortcut above on purpose, so a genuinely completed run can be
  // deliberately restarted.
  it("with ALLOW_PROTOCOL_RERUN=true, starts a fresh session instead of resuming the completed one", async () => {
    process.env.ALLOW_PROTOCOL_RERUN = "true";
    const { initSession, executeQuery, pool } = await loadInitSession();
    executeQuery
      .mockResolvedValueOnce([{ id: 42 }]) // token -> participant_protocol_id
      .mockResolvedValueOnce([]); // no incomplete session within the resume window (completed-session check is skipped entirely when rerun is on)
    const connMock = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValue([{}]), // session_environments insert
      commit: vi.fn(),
      release: vi.fn(),
    };
    pool.getConnection.mockResolvedValueOnce(connMock);
    pool.query.mockResolvedValueOnce([{ insertId: 999 }]); // sessions insert -- goes through pool.query, not connection.query
    const req = { body: { token: "tok", taskOrder: [1, 2, 3] }, headers: {}, socket: {} };
    const res = makeRes();

    await initSession(req, res);

    expect(pool.getConnection).toHaveBeenCalled();
    expect(res.body).toMatchObject({ success: true, sessionId: 999 });
  });

  it("still resumes a genuinely incomplete session within the resume window, unaffected by the completed-session shortcut", async () => {
    const { initSession, executeQuery, pool } = await loadInitSession();
    executeQuery
      .mockResolvedValueOnce([{ id: 42 }]) // token -> participant_protocol_id
      .mockResolvedValueOnce([]) // no completed session
      .mockResolvedValueOnce([{ // incomplete session within window
        id: 901, current_task_index: 3, progress: "[]", task_order: "[1,2,3]",
      }]);
    pool.query.mockResolvedValueOnce([{}]);
    const req = { body: { token: "tok", taskOrder: [1, 2, 3] }, headers: {}, socket: {} };
    const res = makeRes();

    await initSession(req, res);

    expect(res.body).toMatchObject({ success: true, sessionId: 901, currentTaskIndex: 3, resumed: true });
    expect(res.body.completed).toBeUndefined();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
