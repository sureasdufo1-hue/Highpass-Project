FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9eeb7f5887d0e239e78264b06f7f11d2e14be534050481803a9e4728fcdd278e

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HIPASS_STORE=postgres

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
COPY src ./src
COPY test/fixtures/phr ./test/fixtures/phr
COPY public ./public
COPY db ./db
COPY config ./config
COPY services/privacy-inference ./services/privacy-inference

EXPOSE 3000
CMD ["scripts/start-postgres.js"]
