FROM oven/bun:1.3.6 AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/sdk-typescript/package.json packages/sdk-typescript/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS builder

COPY apps/web apps/web
RUN bun run --cwd apps/web build
RUN test -f /app/apps/web/.next/BUILD_ID

FROM oven/bun:1.3.6 AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/bun.lock /app/bun.lock
COPY --from=builder /app/node_modules /app/node_modules
# Next.js writes its runtime cache under .next; everything else stays root-owned.
COPY --from=builder --chown=bun:bun /app/apps/web /app/apps/web
RUN test -f /app/apps/web/.next/BUILD_ID
# The oven/bun image ships an unprivileged `bun` user.
USER bun
EXPOSE 3000
CMD ["sh", "-c", "bun run --cwd apps/web start"]
