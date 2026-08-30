// Sends a single alert email through Azure Communication Services.
// Reads everything from env vars so it can be driven by check.sh:
//   ACS_CONNECTION_STRING  ACS connection string
//   ALERT_EMAIL            recipient address
//   ALERT_SENDER           verified sender address
//   ALERT_SUBJECT          email subject
//   ALERT_HTML             email HTML body
//   ACS_MODULES_BASE       path to a file whose sibling node_modules contains
//                          @azure/communication-email (installed ad-hoc in CI)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const base = process.env.ACS_MODULES_BASE;
if (!base) {
  console.error("ACS_MODULES_BASE not set");
  process.exit(2);
}
const require = createRequire(pathToFileURL(base));
const { EmailClient } = require("@azure/communication-email");

const conn = process.env.ACS_CONNECTION_STRING;
const to = process.env.ALERT_EMAIL;
const sender = process.env.ALERT_SENDER;
const subject = process.env.ALERT_SUBJECT || "Alerta La Cocina";
const html = process.env.ALERT_HTML || "<p>Fallo detectado en La Cocina.</p>";

if (!conn || !to || !sender) {
  console.error("Missing ACS_CONNECTION_STRING / ALERT_EMAIL / ALERT_SENDER");
  process.exit(2);
}

const client = new EmailClient(conn);
const poller = await client.beginSend({
  senderAddress: sender,
  content: { subject, html },
  recipients: { to: [{ address: to }] },
});
const result = await poller.pollUntilDone();
console.log("ACS email:", JSON.stringify({ id: result.id, status: result.status, to }));
if (result.status !== "Succeeded") process.exit(1);
