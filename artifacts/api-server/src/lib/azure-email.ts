import { EmailClient } from "@azure/communication-email";
import type { EmailJob, EmailProvider, ProviderOutcome } from "./email-outbox";
import { EmailConfigurationError } from "./email-outbox";

export const EMAIL_TIMEOUT_MS = 20_000;

export class AzureEmailProvider implements EmailProvider {
  constructor(
    private readonly client: Pick<EmailClient, "beginSend">,
    private readonly endpoint: string,
    private readonly timeoutMs = EMAIL_TIMEOUT_MS,
  ) {}

  checkpoint(operationId: string): string {
    // ACS 1.1.0 / core-lro 2.7.2 serialize {state}. Persist a polling-only
    // checkpoint BEFORE the initial POST, covering crashes before beginSend
    // returns (it performs the POST and a first GET internally).
    return JSON.stringify({
      state: {
        status: "running",
        config: {
          operationLocation: `${this.endpoint.replace(/\/$/, "")}/emails/operations/${operationId}?api-version=2023-03-31`,
          metadata: { mode: "OperationLocation" },
        },
      },
    });
  }

  async step(job: EmailJob, submit: boolean): Promise<ProviderOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let observedStatus: string | undefined;
    let httpStatus: number | undefined;
    let responseMethod: string | undefined;
    try {
      const poller = await this.client.beginSend(job.snapshot, {
        operationId: job.operation_id,
        ...(submit ? {} : { resumeFrom: job.resume_from! }),
        abortSignal: controller.signal,
        requestOptions: { timeout: this.timeoutMs },
        onResponse(response) {
          httpStatus = response.status;
          responseMethod = response.request.method;
          const body = response.parsedBody as { status?: unknown } | undefined;
          if (typeof body?.status === "string") observedStatus = body.status.toLowerCase();
        },
      });
      const state = poller.getOperationState();
      if (state.status === "succeeded") return { status: "succeeded", resumeFrom: poller.toString() };
      if (state.status === "failed" || state.status === "canceled") {
        return { status: "failed", terminal: true, resumeFrom: poller.toString() };
      }
      return { status: "pending", resumeFrom: poller.toString() };
    } catch {
      // beginSend may throw on its first poll, before returning a poller.
      if (observedStatus === "succeeded") return { status: "succeeded" };
      if (observedStatus === "failed" || observedStatus === "canceled") {
        return { status: "failed", terminal: true };
      }
      // Only explicit POST rejection permits another submission. HTTP 5xx,
      // timeout, 409 and all polling errors are ambiguous: GET recovery only.
      if (submit && responseMethod === "POST" && httpStatus === 429) return { status: "transient", resubmit: true };
      if (submit && responseMethod === "POST" && httpStatus && [400, 401, 403, 413, 422].includes(httpStatus)) {
        return { status: "failed", terminal: true };
      }
      return { status: "transient" };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function configuredEmailProvider(): AzureEmailProvider {
  const connection = process.env.ACS_CONNECTION_STRING;
  const endpoint = connection?.match(/(?:^|;)endpoint=([^;]+)/i)?.[1];
  if (!connection || !endpoint) throw new EmailConfigurationError("ACS email is not configured");
  try {
    return new AzureEmailProvider(new EmailClient(connection, { retryOptions: { maxRetries: 0 } }), endpoint);
  } catch {
    throw new EmailConfigurationError("ACS email configuration is invalid");
  }
}
