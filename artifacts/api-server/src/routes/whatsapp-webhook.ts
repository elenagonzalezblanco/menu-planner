import { Router, raw, type IRouter } from "express";
import { extractWhatsAppMessages, validMetaSignature, whatsappConfig, type IncomingWhatsAppMessage, type WhatsAppConfig } from "../lib/whatsapp";
import { enqueueWhatsApp } from "../lib/whatsapp-store";
import { whatsappReady } from "../lib/whatsapp-service";

export function createWhatsAppWebhook(deps: {
  config: () => WhatsAppConfig | undefined;
  ready: () => boolean;
  enqueue: (messages: IncomingWhatsAppMessage[]) => Promise<void>;
}): IRouter {
  const router = Router();
  router.get("/webhook", (req, res) => {
    const config = deps.config();
    if (!config) return res.sendStatus(503);
    if (req.query["hub.mode"] !== "subscribe" || req.query["hub.verify_token"] !== config.verifyToken
      || typeof req.query["hub.challenge"] !== "string") return res.sendStatus(403);
    return res.type("text/plain").send(req.query["hub.challenge"]);
  });
  router.post("/webhook", raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
    const config = deps.config();
    if (!config || !deps.ready()) return res.sendStatus(503);
    if (!Buffer.isBuffer(req.body) || !validMetaSignature(req.body, req.get("x-hub-signature-256"), config.appSecret)) {
      return res.sendStatus(403);
    }
    let payload: unknown;
    try { payload = JSON.parse(req.body.toString("utf8")); } catch { return res.sendStatus(400); }
    const messages = extractWhatsAppMessages(payload, config.phoneNumberId);
    try {
      await deps.enqueue(messages);
      return res.sendStatus(200);
    } catch {
      req.log?.error("WhatsApp webhook could not persist messages");
      return res.sendStatus(503);
    }
  });
  return router;
}

export default createWhatsAppWebhook({ config: whatsappConfig, ready: whatsappReady, enqueue: enqueueWhatsApp });
