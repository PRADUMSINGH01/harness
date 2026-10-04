# hf-harness: website trailers, launch films and agent-built videos over HTTP.
#   docker compose up -d --build     then open http://localhost:8100/launch   (API docs: /docs)
FROM node:24-bookworm-slim

# Chrome's runtime libraries, FFmpeg for MP4 renders, fonts for text a site doesn't ship its own
# faces for (Latin, Indic and other scripts, emoji), procps for tearing down Chrome trees, and
# unzip for HyperFrames' browser download.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg procps unzip fontconfig \
      fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 \
      libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \
      libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOME=/home/node \
    HARNESS_PORT=8100 \
    HARNESS_PUBLIC_URL=http://localhost:8100 \
    HYPERFRAMES_NO_TELEMETRY=1

WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first, so source edits don't reinstall them.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# HyperFrames' pinned chrome-headless-shell, downloaded once into the image.
COPY --chown=node:node docker/find-chrome.mjs docker/find-chrome.mjs
RUN node docker/find-chrome.mjs > /home/node/.chrome-path

# The harness, plus the slice of the vendored HyperFrames it reads (see .dockerignore).
COPY --chown=node:node . .
RUN mkdir -p runs quick memory assets/custom

EXPOSE 8100
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
CMD ["node_modules/.bin/tsx", "src/server.ts"]
