# syntax=docker/dockerfile:1

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY src ./src
COPY styles ./styles
COPY scripts ./scripts
# tsconfig.json is required at runtime: Bun reads its `paths` to resolve
# the `@/` import aliases used across src/ and scripts/ (server boot and
# the migrate script both rely on them).
COPY package.json tsconfig.json ./
EXPOSE 3010
CMD ["bun", "start"]
