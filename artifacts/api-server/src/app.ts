import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ---------- Serve frontend static files ----------
const clientDir = path.resolve(
  process.env.NODE_ENV === "production" ? "./client" : "../../artifacts/menu-semanal/dist"
);
app.use(express.static(clientDir));
// SPA catch-all: any non-API route returns index.html
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

export default app;
