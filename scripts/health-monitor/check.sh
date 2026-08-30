#!/usr/bin/env bash
# Daily health monitor for the "micocina" (La Cocina) menu-planner app.
#
# What it does:
#   1. Ensures the PostgreSQL flexible server is running (starts it if stopped).
#   2. Checks the REAL DB-backed health endpoint (/api/healthz).
#   3. Restarts the App Service if unhealthy (clears a stale connection pool).
#   4. Verifies recovery with retries.
#   5. If it still cannot recover, sends an email alert via Azure Communication
#      Services and exits non-zero.
#
# Runs both in GitHub Actions (after `azure/login`) and locally (after `az login`).
# Requires: az, curl. Requires node only when an alert email must be sent.
set -uo pipefail

RG="${RG:-elenagbgpersonal}"
APP="${APP:-micocina}"
PG="${PG:-menu-planner-pg-elena2}"
HEALTH_URL="${HEALTH_URL:-https://${APP}.azurewebsites.net/api/healthz}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
ACS_CONNECTION_STRING="${ACS_CONNECTION_STRING:-}"
ALERT_SENDER="${ALERT_SENDER:-DoNotReply@a386371c-ce60-494f-b8ab-bd686c6f096e.azurecomm.net}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# HTTP status of the DB-backed health endpoint. NOTE: use /api/healthz — the
# SPA catch-all /healthz always returns 200 and is useless for outage detection.
health_code() { curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$HEALTH_URL" || echo "000"; }
db_state() { az postgres flexible-server show -g "$RG" -n "$PG" --query state -o tsv 2>/dev/null | tr -d '[:space:]'; }

send_alert() {
  local reason="$1"
  echo "::error::$reason"
  if [ -z "$ALERT_EMAIL" ] || [ -z "$ACS_CONNECTION_STRING" ]; then
    log "ALERT_EMAIL/ACS_CONNECTION_STRING not set — skipping email."
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    log "node not available — cannot send email."
    return 0
  fi
  local when; when="$(date -u '+%Y-%m-%d %H:%M UTC')"
  ALERT_SUBJECT="⚠️ La Cocina no responde ($when)" \
  ALERT_HTML="<div style='font-family:sans-serif;max-width:640px'>\
<h2 style='color:#c0392b'>⚠️ La app <b>La Cocina</b> ha fallado la comprobación diaria</h2>\
<p><b>Motivo:</b> ${reason}</p>\
<table style='border-collapse:collapse;font-size:14px'>\
<tr><td style='padding:2px 8px;color:#666'>App Service</td><td style='padding:2px 8px'>${APP}</td></tr>\
<tr><td style='padding:2px 8px;color:#666'>Base de datos</td><td style='padding:2px 8px'>${PG}</td></tr>\
<tr><td style='padding:2px 8px;color:#666'>Endpoint</td><td style='padding:2px 8px'><a href='${HEALTH_URL}'>${HEALTH_URL}</a></td></tr>\
<tr><td style='padding:2px 8px;color:#666'>Hora (UTC)</td><td style='padding:2px 8px'>${when}</td></tr>\
</table>\
<p>El monitor intentó arrancar la base de datos y reiniciar la app automáticamente, pero no logró recuperarla. Revisa el estado en el portal de Azure.</p>\
<p style='color:#999;font-size:12px'>La Cocina — Health Monitor</p></div>" \
  ALERT_EMAIL="$ALERT_EMAIL" \
  ACS_CONNECTION_STRING="$ACS_CONNECTION_STRING" \
  ALERT_SENDER="$ALERT_SENDER" \
  ACS_MODULES_BASE="${ACS_MODULES_BASE:-$SCRIPT_DIR/package.json}" \
    node "$SCRIPT_DIR/send-alert.mjs" || log "Email send failed."
}

log "Health monitor start for '$APP'"

# 1) Ensure the database is running.
STATE="$(db_state)"
log "DB state: '${STATE:-unknown}'"
case "$STATE" in
  Ready)
    : ;;
  Stopped|Disabled)
    log "DB is $STATE — starting it..."
    az postgres flexible-server start -g "$RG" -n "$PG" -o none 2>&1 || log "start returned non-zero"
    for i in $(seq 1 24); do
      sleep 10; STATE="$(db_state)"; log "  [$i] DB state: ${STATE:-unknown}"
      [ "$STATE" = "Ready" ] && break
    done ;;
  "")
    log "Could not read DB state (auth or transient) — continuing to health check." ;;
  *)
    log "DB in transient state '$STATE' — waiting to settle..."
    for i in $(seq 1 12); do sleep 10; STATE="$(db_state)"; [ "$STATE" = "Ready" ] && break; done ;;
esac

# 2) Check real health; restart the app if unhealthy.
CODE="$(health_code)"
log "Health check (api/healthz): HTTP $CODE"
if [ "$CODE" = "200" ]; then
  log "App + DB healthy. OK"
  exit 0
fi

log "Unhealthy (HTTP $CODE) — restarting App Service to clear stale pool..."
az webapp restart --name "$APP" -g "$RG" -o none 2>&1 || log "restart returned non-zero"

for i in $(seq 1 12); do
  sleep 15; CODE="$(health_code)"; log "  [$i] post-restart health: HTTP $CODE"
  if [ "$CODE" = "200" ]; then log "Recovered after restart. OK"; exit 0; fi
done

send_alert "El endpoint de salud sigue devolviendo HTTP ${CODE} tras arrancar la base de datos y reiniciar la app."
exit 1
