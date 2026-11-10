FROM node:22-bookworm-slim AS build
WORKDIR /repo
ARG NEXT_PUBLIC_API_ORIGIN
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_LEGAL_NAME
ARG NEXT_PUBLIC_SUPPORT_EMAIL
COPY . .
RUN sed -i 's#"apps/\*"#"apps/web"#' package.json && npm install --no-audit --no-fund
RUN npm run build -w @mehfil/shared && npm run build -w @mehfil/web

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
