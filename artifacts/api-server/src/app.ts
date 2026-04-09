import path from "path";
import { createGzip, createDeflate } from "zlib";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Gzip/deflate compression middleware (built-in zlib, no external dep)
app.use((req: Request, res: Response, next: NextFunction) => {
  const accept = req.headers["accept-encoding"] || "";
  if (/\bgzip\b/.test(accept as string)) {
    const origEnd = res.end.bind(res);
    const origWrite = res.write.bind(res);
    const chunks: Buffer[] = [];
    res.write = function (chunk: any, ...args: any[]) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    } as any;
    res.end = function (chunk?: any, ...args: any[]) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const buf = Buffer.concat(chunks);
      // Only compress text-like responses > 1KB
      const ct = res.getHeader("content-type") as string || "";
      if (buf.length > 1024 && /text|json|javascript|css|html|xml|svg/.test(ct)) {
        res.removeHeader("content-length");
        res.setHeader("content-encoding", "gzip");
        res.setHeader("vary", "Accept-Encoding");
        const gz = createGzip();
        gz.on("data", (d: Buffer) => origWrite(d));
        gz.on("end", () => origEnd());
        gz.end(buf);
      } else {
        origEnd(buf);
      }
    } as any;
  }
  next();
});

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
// Hashed assets (JS/CSS) — cache for 1 year
app.use(
  "/assets",
  express.static(path.join(clientDir, "assets"), {
    maxAge: "365d",
    immutable: true,
  })
);
// Other static files (index.html, manifest, etc.) — short cache
app.use(express.static(clientDir, { maxAge: "10m" }));
// SPA catch-all: any non-API route returns index.html
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

export default app;
