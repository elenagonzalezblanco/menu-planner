FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/menu-semanal/package.json artifacts/menu-semanal/
RUN pnpm install --no-frozen-lockfile

# --- Build backend ---
FROM node:20-slim AS build-server
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/lib/db/node_modules ./lib/db/node_modules
COPY --from=deps /app/lib/api-zod/node_modules ./lib/api-zod/node_modules
COPY --from=deps /app/lib/integrations-openai-ai-server/node_modules ./lib/integrations-openai-ai-server/node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY . .
WORKDIR /app/artifacts/api-server
RUN pnpm build

# --- Build frontend ---
FROM node:20-slim AS build-client
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/lib/api-client-react/node_modules ./lib/api-client-react/node_modules
COPY --from=deps /app/lib/api-zod/node_modules ./lib/api-zod/node_modules
COPY --from=deps /app/artifacts/menu-semanal/node_modules ./artifacts/menu-semanal/node_modules
COPY . .
WORKDIR /app/artifacts/menu-semanal
ENV VITE_API_URL=""
RUN pnpm build
# Pre-compress large assets for faster serving
RUN find dist/assets -type f \( -name "*.js" -o -name "*.css" \) -exec gzip -k -9 {} \;

# --- Runtime ---
FROM node:20-slim AS runtime
WORKDIR /app
COPY --from=build-server /app/artifacts/api-server/dist ./dist
COPY --from=build-client /app/artifacts/menu-semanal/dist ./client
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.cjs"]
