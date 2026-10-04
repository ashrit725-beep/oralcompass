# syntax=docker/dockerfile:1
# OralCompass: one container serving the API under /api and the built web app at / (api/app/server.py). See docs/DEPLOY.md.

# ---------- stage 1: build the web app ----------
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# A production bundle: no VITE_DEV_AUTH, so the browser sends no X-Dev-User header and is identified by the session cookie.
RUN npm run build

# ---------- stage 2: the Python runtime ----------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    ORALCOMPASS_ENV=production \
    ORALCOMPASS_STORE=sqlite \
    ORALCOMPASS_DB_PATH=/data/oralcompass.db \
    ORALCOMPASS_DATA_DIR=/data/uploads
WORKDIR /app
COPY api/requirements.txt api/requirements.txt
RUN pip install -r api/requirements.txt
COPY engine/ engine/
COPY api/app/ api/app/
COPY fixtures/ fixtures/
COPY tools/advice_lint.py tools/advice_lint.py
COPY --from=web /src/web/dist web/dist
COPY scripts/docker-entrypoint.sh /usr/local/bin/oralcompass-entrypoint
RUN useradd --system --uid 10001 --user-group --home-dir /app --shell /usr/sbin/nologin oralcompass \
    && mkdir -p /data/uploads \
    && chown -R 10001:10001 /data \
    && chmod 700 /data/uploads \
    && chmod 755 /usr/local/bin/oralcompass-entrypoint
VOLUME ["/data"]
USER 10001:10001
WORKDIR /app/api
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT', '8000'), timeout=4)" || exit 1
ENTRYPOINT ["/usr/local/bin/oralcompass-entrypoint"]
