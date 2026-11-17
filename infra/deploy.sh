#!/usr/bin/env bash
# Build images in ACR and create/update the two Container Apps. Idempotent; safe to re-run.
#   Usage: infra/deploy.sh            (both)   |   infra/deploy.sh api|web
set -euo pipefail
cd "$(dirname "$0")/.."

RG=${RG:-rg-tudoranaclark}
APP=${APP:-tudoranaclark}
API_APP="ca-${APP}-api"
WEB_APP="ca-${APP}-web"
TARGET=${1:-all}
TAG=$(date -u +%Y%m%d%H%M%S)

out() { az deployment group show -g "$RG" -n platform --query "properties.outputs.$1.value" -o tsv; }
secret() { python3 -c "import json,sys;print(json.load(open('.secrets/app-secrets.json'))[sys.argv[1]])" "$1"; }

ACR=$(out acrName); LOGIN=$(out acrLoginServer); ENV_NAME=$(out envName)
IDENTITY=$(out identityId); CLIENT_ID=$(out identityClientId)
DOMAIN=$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query properties.defaultDomain -o tsv)
SITE_URL=${SITE_URL:-"https://${WEB_APP}.${DOMAIN}"}

upsert() { # name image ingress port min max cpu mem secrets... -- env...
  local name=$1 image=$2 ingress=$3 port=$4 min=$5 max=$6 cpu=$7 mem=$8; shift 8
  local secrets=() envs=(); local in_env=0
  for a in "$@"; do [[ $a == "--" ]] && { in_env=1; continue; }; ((in_env)) && envs+=("$a") || secrets+=("$a"); done
  if az containerapp show -g "$RG" -n "$name" -o none 2>/dev/null; then
    az containerapp secret set -g "$RG" -n "$name" --secrets "${secrets[@]}" -o none
    az containerapp update -g "$RG" -n "$name" --image "$image" --min-replicas "$min" --max-replicas "$max" \
      --cpu "$cpu" --memory "$mem" --set-env-vars "${envs[@]}" -o none
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
  echo "› Building API image"
  az acr build -r "$ACR" -t "api:$TAG" -t "api:latest" ./api --no-logs -o none
  echo "› Deploying $API_APP (internal ingress — not reachable from the internet)"
  upsert "$API_APP" "$LOGIN/api:$TAG" internal 8000 0 1 0.25 0.5Gi \
    "admin-api-key=$(secret ADMIN_API_KEY)" "indexnow-key=$(secret INDEXNOW_KEY)" -- \
    ENVIRONMENT=production STORAGE_BACKEND=cosmos LOG_LEVEL=INFO \
    "SITE_URL=$SITE_URL" "AZURE_CLIENT_ID=$CLIENT_ID" \
    "COSMOS_ENDPOINT=$(out cosmosEndpoint)" "STORAGE_ACCOUNT=$(out storageAccount)" "MEDIA_BASE_URL=$(out mediaBaseUrl)" \
    "OPENAI_ENDPOINT=$(out openAiEndpoint)" "OPENAI_DEPLOYMENT=$(out openAiDeployment)" \
    ADMIN_API_KEY=secretref:admin-api-key INDEXNOW_KEY=secretref:indexnow-key
fi

if [[ $TARGET == all || $TARGET == web ]]; then
  echo "› Building web image for $SITE_URL"
  az acr build -r "$ACR" -t "web:$TAG" -t "web:latest" ./web --no-logs -o none \
    --build-arg "NEXT_PUBLIC_SITE_URL=$SITE_URL" \
    --build-arg "NEXT_PUBLIC_PORTRAIT_URL=${PORTRAIT_URL:-}" \
    --build-arg "NEXT_PUBLIC_STAGE_PHOTO_URL=${STAGE_PHOTO_URL:-}"
  echo "› Deploying $WEB_APP (public, scale-to-zero)"
  upsert "$WEB_APP" "$LOGIN/web:$TAG" external 3000 0 2 0.5 1Gi \
    "admin-api-key=$(secret ADMIN_API_KEY)" "admin-password=$(secret ADMIN_PASSWORD)" \
    "session-secret=$(secret SESSION_SECRET)" "indexnow-key=$(secret INDEXNOW_KEY)" -- \
    NODE_ENV=production "API_URL=http://${API_APP}" API_TIMEOUT_MS=15000 \
    ADMIN_API_KEY=secretref:admin-api-key ADMIN_PASSWORD=secretref:admin-password \
    SESSION_SECRET=secretref:session-secret INDEXNOW_KEY=secretref:indexnow-key
fi

echo "✓ Live at $SITE_URL   (studio: $SITE_URL/studio)"
