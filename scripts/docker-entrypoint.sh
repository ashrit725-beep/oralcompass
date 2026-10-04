#!/bin/sh
# OralCompass container entrypoint.
# The app always runs as the unprivileged `oralcompass` user (uid 10001). Platforms that mount volumes owned by root (Railway documents
# this and suggests RAILWAY_RUN_UID=0) start the container as root: in that case only, the data directories on the volume are created and
# handed to uid 10001, and the server is exec'd with root dropped (setpriv). The image's default USER is already oralcompass.
set -eu
set -f    # no globbing: the command below carries a literal '*'

# No session secret given (e.g. a judge runs `docker run` with no env): make a random one for this run so the app starts.
# Visitor sessions then end when the container restarts; set ORALCOMPASS_SESSION_SECRET to keep them (docs/DEPLOY.md).
SECRET_NOW="${ORALCOMPASS_SESSION_SECRET:-}"
if [ "${#SECRET_NOW}" -lt 32 ]; then
  ORALCOMPASS_SESSION_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  export ORALCOMPASS_SESSION_SECRET
  echo "oralcompass: ORALCOMPASS_SESSION_SECRET was not set; using a random one for this run (sessions end at restart)." >&2
fi

DB_DIR="$(dirname "${ORALCOMPASS_DB_PATH:-/data/oralcompass.db}")"
UPLOADS="${ORALCOMPASS_DATA_DIR:-/data/uploads}"
CMD="uvicorn app.server:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips * --no-access-log"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DB_DIR" "$UPLOADS"
  chown -R 10001:10001 "$DB_DIR" "$UPLOADS"
  chmod 700 "$UPLOADS"
  # shellcheck disable=SC2086
  exec setpriv --reuid=10001 --regid=10001 --clear-groups $CMD
fi

mkdir -p "$DB_DIR" "$UPLOADS" 2>/dev/null || true
if ! [ -w "$DB_DIR" ] || ! [ -w "$UPLOADS" ]; then
  echo "oralcompass: $DB_DIR or $UPLOADS is not writable by uid $(id -u). Mount the volume with that owner, or (Railway) set RAILWAY_RUN_UID=0 so the entrypoint can hand it over before dropping root." >&2
  exit 1
fi
# shellcheck disable=SC2086
exec $CMD
