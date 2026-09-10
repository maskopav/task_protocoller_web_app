// scripts/createTenant.js — one-time setup CLI: registers a new consuming
// app as a tenant and prints its API key + link-signing secret. Neither is
// ever shown again (only the key's hash is stored) — save them immediately
// into the consuming app's own .env.
//
// Usage: npm run tenant:create -- "Task Protocoller Pilot"
import "dotenv/config";
import pool from "../src/db/connection.js";
import { createTenant } from "../src/services/bookingService.js";

const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run tenant:create -- \"<tenant name>\"");
  process.exit(1);
}

const { tenantId, rawApiKey, linkSigningSecret } = await createTenant(name);

console.log("✅ Tenant created — save these now, they will not be shown again:\n");
console.log(`  BOOKING_SERVICE_TENANT_ID=${tenantId}`);
console.log(`  BOOKING_SERVICE_API_KEY=${rawApiKey}`);
console.log(`  BOOKING_SERVICE_LINK_SIGNING_SECRET=${linkSigningSecret}\n`);

await pool.end();
