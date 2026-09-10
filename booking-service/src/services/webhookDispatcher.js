// src/services/webhookDispatcher.js — best-effort notification to a
// tenant's registered webhook(s) on booking create/reschedule/cancel, so a
// consuming app can react without polling. Never blocks or fails the
// triggering request: call this without awaiting, or await + ignore errors.
import { executeQuery } from "../db/queryHelper.js";
import { signHmac } from "../utils/linkSigning.js";
import { logToFile } from "../utils/logger.js";

export async function dispatchWebhookEvent(tenantId, event, data) {
  try {
    const hooks = await executeQuery(`SELECT url, secret FROM webhooks WHERE tenant_id = ?`, [tenantId]);
    if (hooks.length === 0) return;

    const body = JSON.stringify({ event, data, sentAt: new Date().toISOString() });

    await Promise.all(
      hooks.map(async (hook) => {
        try {
          const signature = signHmac(hook.secret, body);
          await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Booking-Signature": signature,
            },
            body,
          });
        } catch (err) {
          logToFile("WARN", "Webhook delivery failed", { url: hook.url, event, error: err.message });
        }
      })
    );
  } catch (err) {
    logToFile("ERROR", "Webhook dispatch lookup failed", { tenantId, event, error: err.message });
  }
}
