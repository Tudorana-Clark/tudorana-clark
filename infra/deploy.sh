#!/usr/bin/env bash
# Build images in ACR and create/update the two Container Apps. Idempotent; safe to re-run.
#   Usage: infra/deploy.sh            (both)   |   infra/deploy.sh api|web
#
# Two modes:
#   • With .secrets/app-secrets.json (your machine): creates apps if needed and (re)writes their secrets.
#   • Without it (GitHub Actions): code-only. Ships a new image and plain settings; the apps keep the
#     secrets they already hold, so no app secret ever lives in GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."

RG=${RG:-rg-tudoranaclark}
APP=${APP:-tudoranaclark}
API_APP="ca-${APP}-api"
WEB_APP="ca-${APP}-web"
TARGET=${1:-all}
TAG=${IMAGE_TAG:-$(date -u +%Y%m%d%H%M%S)}
SECRETS_FILE=.secrets/app-secrets.json
# Brand photo URLs (env vars override the committed defaults).
set -a; [[ -f infra/site.env ]] && source infra/site.env; set +a

if [[ -f $SECRETS_FILE ]]; then MODE=full; else MODE=code-only; fi
echo "› Deploy mode: $MODE"

out() { az deployment group show -g "$RG" -n platform --query "properties.outputs.$1.value" -o tsv; }
secret() { python3 -c "import json,sys;print(json.load(open('$SECRETS_FILE'))[sys.argv[1]])" "$1"; }
build() { # name context [build-args...]
  local name=$1 ctx=$2; shift 2
  local logs=(--no-logs); [[ -n ${CI:-} ]] && logs=()   # show build logs in CI for debugging
  az acr build -r "$ACR" -t "$name:$TAG" -t "$name:latest" "$ctx" "${logs[@]}" -o none "$@"
}

ACR=$(out acrName); LOGIN=$(out acrLoginServer); ENV_NAME=$(out envName)
IDENTITY=$(out identityId); CLIENT_ID=$(out identityClientId)
DOMAIN=$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query properties.defaultDomain -o tsv)
SITE_URL=${SITE_URL:-"https://${WEB_APP}.${DOMAIN}"}

upsert() { # name image ingress port min max cpu mem secrets... -- env...
  local name=$1 image=$2 ingress=$3 port=$4 min=$5 max=$6 cpu=$7 mem=$8; shift 8
  local secrets=() envs=(); local in_env=0
  for a in "$@"; do [[ $a == "--" ]] && { in_env=1; continue; }; ((in_env)) && envs+=("$a") || secrets+=("$a"); done
  if az containerapp show -g "$RG" -n "$name" -o none 2>/dev/null; then
    if ((${#secrets[@]})); then az containerapp secret set -g "$RG" -n "$name" --secrets "${secrets[@]}" -o none; fi
    az containerapp update -g "$RG" -n "$name" --image "$image" --min-replicas "$min" --max-replicas "$max" \
      --cpu "$cpu" --memory "$mem" --set-env-vars "${envs[@]}" -o none
  elif [[ $MODE == code-only ]]; then
    echo "✗ $name doesn't exist yet. Run infra/deploy.sh once from a machine with $SECRETS_FILE." >&2
    exit 1
  else
    az containerapp create -g "$RG" -n "$name" --environment "$ENV_NAME" --image "$image" \
      --registry-server "$LOGIN" --registry-identity "$IDENTITY" --user-assigned "$IDENTITY" \
      --ingress "$ingress" --target-port "$port" --transport auto \
      --min-replicas "$min" --max-replicas "$max" --cpu "$cpu" --memory "$mem" \
      --scale-rule-name http --scale-rule-type http --scale-rule-http-concurrency 50 \
      --secrets "${secrets[@]}" --env-vars "${envs[@]}" -o none
  fi
}

if [[ $TARGET == all || $TARGET == api ]]; then
  echo "› Building API image ($TAG)"
  build api ./api
  echo "› Deploying $API_APP (internal ingress — not reachable from the internet)"
  args=()
  if [[ $MODE == full ]]; then
    args+=("admin-api-key=$(secret ADMIN_API_KEY)" "indexnow-key=$(secret INDEXNOW_KEY)" "resend-api-key=$(secret RESEND_API_KEY)")
  fi
  args+=(-- ENVIRONMENT=production STORAGE_BACKEND=cosmos LOG_LEVEL=INFO
    "SITE_URL=$SITE_URL" "AZURE_CLIENT_ID=$CLIENT_ID"
    "COSMOS_ENDPOINT=$(out cosmosEndpoint)" "STORAGE_ACCOUNT=$(out storageAccount)" "MEDIA_BASE_URL=$(out mediaBaseUrl)"
    "OPENAI_ENDPOINT=$(out openAiEndpoint)" "OPENAI_DEPLOYMENT=$(out openAiDeployment)"
    "IMAGE_ENDPOINT=$(out imageEndpoint)" "IMAGE_DEPLOYMENT=$(out imageDeployment)"
    "CLAUDE_RESOURCE=$(out foundryResource)" "CLAUDE_DEPLOYMENT=$(out articleDeployment)"
    "NOTIFY_EMAIL=${NOTIFY_EMAIL:-daniel@tudoranaclark.com}")
  if [[ $MODE == full ]]; then
    args+=(ADMIN_API_KEY=secretref:admin-api-key INDEXNOW_KEY=secretref:indexnow-key RESEND_API_KEY=secretref:resend-api-key)
  fi
  upsert "$API_APP" "$LOGIN/api:$TAG" internal 8000 0 1 0.25 0.5Gi "${args[@]}"
fi

if [[ $TARGET == all || $TARGET == web ]]; then
  echo "› Building web image for $SITE_URL ($TAG)"
  build web ./web \
    --build-arg "NEXT_PUBLIC_SITE_URL=$SITE_URL" \
    --build-arg "NEXT_PUBLIC_PORTRAIT_URL=${PORTRAIT_URL:-}" \
    --build-arg "NEXT_PUBLIC_STAGE_PHOTO_URL=${STAGE_PHOTO_URL:-}"
  echo "› Deploying $WEB_APP (public, scale-to-zero)"
  args=()
  if [[ $MODE == full ]]; then
    args+=("admin-api-key=$(secret ADMIN_API_KEY)" "admin-password=$(secret ADMIN_PASSWORD)"
      "session-secret=$(secret SESSION_SECRET)" "indexnow-key=$(secret INDEXNOW_KEY)"
      "entra-client-secret=$(secret ENTRA_CLIENT_SECRET)")
  fi
  args+=(-- NODE_ENV=production "API_URL=http://${API_APP}" API_TIMEOUT_MS=15000)
  if [[ $MODE == full ]]; then
    args+=(ADMIN_API_KEY=secretref:admin-api-key ADMIN_PASSWORD=secretref:admin-password
      SESSION_SECRET=secretref:session-secret INDEXNOW_KEY=secretref:indexnow-key
      "ENTRA_TENANT_ID=$(secret ENTRA_TENANT_ID)" "ENTRA_CLIENT_ID=$(secret ENTRA_CLIENT_ID)"
      ENTRA_CLIENT_SECRET=secretref:entra-client-secret "STUDIO_ALLOWED_OIDS=$(secret STUDIO_ALLOWED_OIDS)")
  fi
  upsert "$WEB_APP" "$LOGIN/web:$TAG" external 3000 "${WEB_MIN_REPLICAS:-0}" 2 0.5 1Gi "${args[@]}"
fi

# Smoke test: the public site must answer (allow for a cold start).
if [[ $TARGET == all || $TARGET == web ]]; then
  for i in 1 2 3 4 5 6; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$SITE_URL/" || true)
    [[ $code == 200 ]] && break
    echo "  waiting for $SITE_URL (got $code)…"; sleep 10
  done
  [[ $code == 200 ]] || { echo "✗ Smoke test failed: $SITE_URL returned $code" >&2; exit 1; }
fi

echo "✓ Live at $SITE_URL   (studio: $SITE_URL/studio)"
