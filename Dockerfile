FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY artifacts/api-server/package.json artifacts/api-server/
RUN pnpm install --no-frozen-lockfile --ignore-scripts --no-optional

FROM node:20-slim AS build
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

FROM node:20-slim AS runtime
WORKDIR /app
COPY --from=build /app/artifacts/api-server/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.cjs"]
