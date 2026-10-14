import { pool } from "@workspace/db";
import { configuredEmailProvider } from "./azure-email";
import { EmailRepository, processEmail, type EmailProvider } from "./email-outbox";
import { logger } from "./logger";

export const emailRepository = new EmailRepository({
  query: (text, values) => {
    // pg supports per-query query_timeout at runtime, but its QueryConfig
    // declaration omits it. Keep the structurally typed configuration intact.
    const config = { text, values, query_timeout: 15_000 };
    return pool.query(config);
  },
});
let ready = false;
export function emailOutboxReady(): boolean { return ready; }

export async function initializeEmailOutbox(): Promise<void> {
  await emailRepository.initialize();
  ready = true;
}

export function startEmailWorker(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  // Resolve configuration lazily so an absent ACS configuration doesn't prevent
  // the planner starting; queued jobs still become visibly failed.
  let provider: EmailProvider | undefined;
  const lazyProvider: EmailProvider = {
    checkpoint(id) { provider ??= configuredEmailProvider(); return provider.checkpoint(id); },
    step(job, submit) { provider ??= configuredEmailProvider(); return provider.step(job, submit); },
  };
  async function tick(): Promise<void> {
    let worked = false;
    try {
      worked = await processEmail(emailRepository, lazyProvider, fields => {
        if (["worker-attempt-error", "configuration-error", "failed", "attempts-exhausted", "transient"].includes(fields.event)) {
          logger.warn(fields, "Email delivery needs attention");
        } else {
          logger.info(fields, "Email delivery progress");
        }
      });
    } catch {
      logger.error("Email worker database operation failed; will retry");
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), worked ? 100 : 2_000);
      timer.unref();
    }
  }
  if (!ready) throw new Error("Email outbox must initialize before worker starts");
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
