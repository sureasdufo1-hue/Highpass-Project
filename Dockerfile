FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

FROM gcr.io/distroless/nodejs24-debian12:nonroot

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HIPASS_STORE=postgres

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
COPY src ./src
COPY public ./public
COPY db ./db

EXPOSE 3000
CMD ["scripts/start-postgres.js"]
