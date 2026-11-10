FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update -y && apt-get install -y openssl
COPY . .
RUN sed -i 's#"apps/\*"#"apps/api"#' package.json && npm install --no-audit --no-fund
RUN npm run build -w @mehfil/shared && npm run build -w @mehfil/api

FROM node:22-bookworm-slim
WORKDIR /repo
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /repo /repo
RUN mkdir -p /repo/apps/api/uploads && chown -R node:node /repo/apps/api/uploads
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:4000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
