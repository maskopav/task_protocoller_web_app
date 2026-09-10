import crypto from "crypto";

// Same pattern as task_protocoller_web_app/backend/src/utils/tokenGenerator.js
// — deliberately duplicated, not imported, since the two packages must stay
// independently deployable.
export function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}
