FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# runnerはDebian slim（glibc）を使用
# step CLI の標準Linuxバイナリ（ELF/glibc）はAlpine(musl)では動かないため
FROM node:20-slim AS runner
ENV NODE_ENV=production

# step CLIをインストール（step-caとのトークン生成に使用）
# GitHub releasesから取得し、findで実行ファイルを探してインストール
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && wget -q https://github.com/smallstep/cli/releases/download/v0.27.4/step_linux_amd64.tar.gz -O /tmp/step.tar.gz \
    && tar xzf /tmp/step.tar.gz -C /tmp \
    && find /tmp -name step -type f -executable | head -1 | xargs -I{} mv {} /usr/local/bin/step \
    && chmod +x /usr/local/bin/step \
    && rm -rf /tmp/step*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
