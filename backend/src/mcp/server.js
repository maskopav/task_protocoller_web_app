// src/mcp/server.js
//
// One stateless McpServer per HTTP request (docs/mcp/01_spec.md D2): the
// request's req.admin is bound into every tool, so a tool can never act as
// anyone else, and nothing is kept between requests.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callHandler } from "./callHandler.js";
import { readTools } from "./tools/read.js";
import { logToFile } from "../utils/logger.js";

export const SERVER_INFO = { name: "task-protocoller", version: "1.0.0" };

const INSTRUCTIONS =
  "Task Protocoller: studies, clinics, protocols and voice/video recordings of a clinical research platform. " +
  "Terms: study = project, clinic = site, recording = upload session, computer = recording device. " +
  "You act as one user and see exactly what that user sees in the web app. " +
  "Participants appear only as patient code and visit number; never ask for or write other identifying details.";

/** All v1 tool definitions. Exported for tests (tools/list parity). */
export function allTools(deps = { call: callHandler }) {
  return [...readTools(deps)];
}

function toolResult(r) {
  if (r.status >= 200 && r.status < 300) {
    return { content: [{ type: "text", text: JSON.stringify(r.body ?? null) }] };
  }
  const error = r.status >= 500 ? "internal" : (r.body?.error ?? "error");
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error, status: r.status }) }] };
}

export function buildMcpServer(admin, deps = { call: callHandler }) {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  for (const tool of allTools(deps)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input, annotations: tool.annotations },
      async (args) => {
        let r;
        try {
          r = await tool.run(admin, args ?? {});
        } catch (err) {
          logToFile("ERROR", "mcp_call", { tool: tool.name, userId: admin.id, tokenId: admin.tokenId, status: 500, code: err?.code ?? err?.name ?? "Error" });
          return toolResult({ status: 500 });
        }
        // One line per call; never the arguments or the result (01_spec.md section 7).
        logToFile("INFO", "mcp_call", {
          tool: tool.name, userId: admin.id, tokenId: admin.tokenId, status: r.status,
          ...(r.status >= 400 ? { code: r.status >= 500 ? "internal" : (r.body?.error ?? "error") } : {}),
        });
        return toolResult(r);
      }
    );
  }
  return server;
}
