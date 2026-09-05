FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app ./app
COPY server ./server
COPY db ./db
COPY deploy ./deploy
ENV NODE_ENV=production TAXIBO_PYTHON=/usr/bin/python3 TAXIBO_CUE_SERVER=/app/deploy/hde/cue_engine.py TAXIBO_HDE_ROUTES=/app/deploy/hde/routes.json
USER node
CMD ["node", "deploy/start.js"]
