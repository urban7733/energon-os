FROM oven/bun:1.3.6 AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS builder

COPY apps/web apps/web
RUN bun --cwd apps/web run build
RUN test -f /app/apps/web/.next/BUILD_ID

FROM oven/bun:1.3.6 AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/bun.lock /app/bun.lock
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web /app/apps/web
RUN test -f /app/apps/web/.next/BUILD_ID
EXPOSE 3000
CMD ["sh", "-c", "bun --cwd apps/web start"]
