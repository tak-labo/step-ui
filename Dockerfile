FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production

# step CLIをインストール（step-caとのトークン生成に使用）
RUN wget -q https://dl.smallstep.com/gh-release/cli/docs-ca-install/v0.27.4/step_linux_amd64.tar.gz -O /tmp/step.tar.gz \
    && tar xzf /tmp/step.tar.gz -C /tmp \
    && mv /tmp/step_0.27.4/bin/step /usr/local/bin/step \
    && rm -rf /tmp/step*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
