import { pool } from "@workspace/db";
import { logger } from "./logger";
import { claimWhatsAppJob, initializeWhatsApp, processWhatsAppCommand } from "./whatsapp-store";
import { processWhatsAppJob } from "./whatsapp-worker";
import { sendWhatsAppReply, whatsappConfig } from "./whatsapp";

let ready = false;
export const whatsappReady = (): boolean => ready;

export async function initializeWhatsAppService(): Promise<void> {
  await initializeWhatsApp();
  ready = true;
}

export function startWhatsAppWorker(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  async function tick(): Promise<void> {
    let worked = false;
    try {
      const config = whatsappConfig();
      if (config) {
        worked = await processWhatsAppJob({
          claim: claimWhatsAppJob,
          process: processWhatsAppCommand,
          send: (phone, reply) => sendWhatsAppReply(config, phone, reply),
          async delivered(id) {
            await pool.query("UPDATE whatsapp_messages SET state = 'delivered', updated_at = now() WHERE id = $1", [id]);
          },
        });
      }
    } catch {
      // Do not log sender numbers, message contents, link codes or access tokens.
      logger.error("WhatsApp worker failed; persisted job will retry, up to five attempts");
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), worked ? 100 : 2000);
      timer.unref();
    }
  }
  if (!ready) throw new Error("WhatsApp storage must initialize before worker starts");
  if (!whatsappConfig()) logger.warn("WhatsApp is disabled: missing or invalid configuration");
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
