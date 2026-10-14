export interface BootstrapEvent {
  event: "initializing" | "retry-scheduled" | "worker-started" | "seed-failed" | "seed-completed" | "stopped";
  attempt: number;
  delayMs?: number;
}

interface BootstrapDependencies {
  migrate: () => Promise<void>;
  initializeOutbox: () => Promise<void>;
  startWorker: () => () => void;
  seed: (isStopped: () => boolean) => Promise<void>;
  log: (event: BootstrapEvent) => void;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}

export function bootstrapRetryDelay(attempt: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 5));
}

export function startEmailBootstrap(deps: BootstrapDependencies): () => void {
  let stopped = false;
  let attempt = 0;
  let cancelRetry: (() => void) | undefined;
  let stopWorker: (() => void) | undefined;
  const schedule = deps.schedule ?? ((callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => clearTimeout(timer);
  });

  async function initialize(): Promise<void> {
    if (stopped || stopWorker) return;
    cancelRetry = undefined;
    attempt++;
    deps.log({ event: "initializing", attempt });
    try {
      await deps.migrate();
      if (stopped) return;
      await deps.initializeOutbox();
      if (stopped) return;
      stopWorker = deps.startWorker();
    } catch {
      if (stopped) return;
      const delayMs = bootstrapRetryDelay(attempt);
      deps.log({ event: "retry-scheduled", attempt, delayMs });
      cancelRetry = schedule(() => void initialize(), delayMs);
      return;
    }
    deps.log({ event: "worker-started", attempt });
    // Seed failures must never re-enter initialization or start another worker.
    try {
      if (stopped) return;
      await deps.seed(() => stopped);
      if (!stopped) deps.log({ event: "seed-completed", attempt });
    } catch {
      if (!stopped) deps.log({ event: "seed-failed", attempt });
    }
  }

  void initialize();
  return () => {
    if (stopped) return;
    stopped = true;
    cancelRetry?.();
    stopWorker?.();
    deps.log({ event: "stopped", attempt });
  };
}
