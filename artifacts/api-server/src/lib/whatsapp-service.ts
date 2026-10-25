import { pool } from "@workspace/db";
import { logger } from "./logger";
import { claimWhatsAppJob, initializeWhatsApp, processWhatsAppCommand } from "./whatsapp-store";
import { processWhatsAppJob } from "./whatsapp-worker";
import { downloadWhatsAppMedia, sendWhatsAppReply, whatsappConfig, type WhatsAppConfig } from "./whatsapp";
import { readShoppingListImage, UnreadableImageError } from "./whatsapp-image";

/** Photo of a handwritten list → products, read by the Azure OpenAI vision model. */
function photoReader(config: WhatsAppConfig) {
  return async (mediaId: string): Promise<string[] | null> => {
    try {
      return await readShoppingListImage(await downloadWhatsAppMedia(config, mediaId));
    } catch (error) {
      if (error instanceof UnreadableImageError) return null;
      throw error;
    }
  };
}

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
          process: job => processWhatsAppCommand(job, photoReader(config)),
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
