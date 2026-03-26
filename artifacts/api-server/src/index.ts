import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Keep server alive even if a route throws an unhandled error
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — server stays up");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — server stays up");
});

seedIfEmpty().then(() => {
  app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
});
