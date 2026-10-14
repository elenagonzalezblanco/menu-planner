import type { WhatsAppJob } from "./whatsapp-store";

export interface WhatsAppWorkerDependencies {
  claim: () => Promise<WhatsAppJob | undefined>;
  process: (job: WhatsAppJob) => Promise<string>;
  send: (phone: string, reply: string) => Promise<void>;
  delivered: (id: string) => Promise<void>;
}

export async function processWhatsAppJob(deps: WhatsAppWorkerDependencies): Promise<boolean> {
  const job = await deps.claim();
  if (!job) return false;
  const reply = job.reply ?? await deps.process(job);
  await deps.send(job.phone, reply);
  await deps.delivered(job.id);
  return true;
}
