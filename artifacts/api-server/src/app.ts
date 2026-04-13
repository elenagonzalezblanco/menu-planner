import path from "path";
import { existsSync } from "fs";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Security headers (hides X-Powered-By, adds HSTS, X-Content-Type-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // CSP would break inline styles in React
  crossOriginEmbedderPolicy: false, // Allow cross-origin resources (Google Fonts)
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow fonts/assets to load
}));

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

const ALLOWED_ORIGINS = [
  "https://micocina.azurewebsites.net",
  "https://menu-planner.purplesky-7900e9da.spaincentral.azurecontainerapps.io",
  "https://elenagonzalezblanco.github.io",
];
if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000");
}
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ---------- Serve frontend static files ----------
const clientDir = path.resolve(
  process.env.NODE_ENV === "production" ? "./client" : "../../artifacts/menu-semanal/dist"
);

// Serve pre-compressed .gz files for assets when client supports gzip
app.get("/assets/{*path}", (req, res, next) => {
  if (!/\bgzip\b/.test(req.headers["accept-encoding"] || "")) return next();
  const gzPath = path.join(clientDir, req.path + ".gz");
  if (!existsSync(gzPath)) return next();
  const ext = path.extname(req.path);
  const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css" };
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Content-Type", types[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Vary", "Accept-Encoding");
  res.sendFile(gzPath);
});

app.use(express.static(clientDir, {
  setHeaders(res, filePath) {
    // Hashed assets (JS/CSS in /assets/) — immutable, cache 1 year
    if (filePath.includes("/assets/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
}));
// SPA catch-all: any non-API route returns index.html
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

export default app;
