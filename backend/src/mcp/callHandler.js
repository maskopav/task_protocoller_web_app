// src/mcp/callHandler.js
//
// Runs an existing Express controller for an MCP tool, so the tool inherits
// every permission rule inside it (docs/mcp/03_guidelines.md rule 1).
// `admin` is always req.admin from patAuth, never anything from tool input.
import { logToFile } from "../utils/logger.js";

/**
 * @param {(req, res) => any} handler   an (req, res) controller
 * @param {{admin: object, params?: object, query?: object, body?: object}} input
 * @returns {Promise<{status: number, body: any}>}
 */
export function callHandler(handler, { admin, params = {}, query = {}, body = {} }) {
  return new Promise((resolve) => {
    let settled = false;
    let statusCode = 200;
    const settle = (status, payload) => {
      if (settled) return;
      settled = true;
      resolve({ status, body: payload });
    };
    const notJson = () => { throw new Error("mcp_non_json_response"); };
    const res = {
      status(code) { statusCode = code; return res; },
      json(payload) { settle(statusCode, payload); return res; },
      end() { settle(statusCode, null); return res; },
      send(payload) {
        if (payload !== undefined && typeof payload !== "object") notJson();
        settle(statusCode, payload ?? null);
        return res;
      },
      set() { return res; },
      setHeader() { return res; },
      type() { return res; },
      get headersSent() { return settled; },
      download: notJson,
      sendFile: notJson,
      attachment: notJson,
      write: notJson,
      pipe: notJson,
    };
    const req = { admin, params, query, body, headers: {}, method: "GET", path: "/" };

    Promise.resolve()
      .then(() => handler(req, res))
      .then(() => { if (!settled) settle(500, { error: "internal" }); })
      .catch((err) => {
        // Codes only: messages can quote values (03_guidelines.md rule 4).
        logToFile("ERROR", "mcp handler failed", { userId: admin?.id ?? null, code: err?.code ?? err?.name ?? "Error" });
        settle(500, { error: "internal" });
      });
  });
}
