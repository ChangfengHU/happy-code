#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/.run-logs"
TMP_DIR="${ROOT_DIR}/.tmp"

SERVER_PUBLIC_URL="${SERVER_PUBLIC_URL:-http://localhost:3005}"
RESTART="${RESTART:-0}"

PG_CONTAINER_NAME="${PG_CONTAINER_NAME:-happy-postgres}"
REDIS_CONTAINER_NAME="${REDIS_CONTAINER_NAME:-happy-redis}"
MINIO_CONTAINER_NAME="${MINIO_CONTAINER_NAME:-minio}"

PG_DATA_DIR="${ROOT_DIR}/server/.pgdata"
MINIO_DATA_DIR="${ROOT_DIR}/server/.minio/data"

MINIO_IMAGE="${MINIO_IMAGE:-minio/minio:RELEASE.2024-12-13T22-19-12Z}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
MINIO_BUCKET="${MINIO_BUCKET:-happy}"

ensure_container() {
  local name="$1"
  local image="$2"
  shift 2
  if docker ps --format '{{.Names}}' | grep -q "^${name}\$"; then
    if [[ "${RESTART}" == "1" ]]; then
      docker restart "${name}" >/dev/null
      echo "✓ ${name} restarted"
    else
      echo "✓ ${name} already running"
    fi
    return
  fi
  if docker ps -a --format '{{.Names}}' | grep -q "^${name}\$"; then
    docker start "${name}" >/dev/null
    echo "✓ ${name} started"
    return
  fi
  docker run -d --name "${name}" "$@" "${image}" >/dev/null
  echo "✓ ${name} created"
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" || true)"
  if [[ -n "${pids}" ]]; then
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Please install Docker/Colima first."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker/Colima and retry."
  exit 1
fi

mkdir -p "${PG_DATA_DIR}" "${MINIO_DATA_DIR}" "${LOG_DIR}" "${TMP_DIR}"

echo "Starting Docker services..."
ensure_container "${PG_CONTAINER_NAME}" "postgres:16" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=handy \
  -v "${PG_DATA_DIR}:/var/lib/postgresql/data" \
  -p 5432:5432

ensure_container "${REDIS_CONTAINER_NAME}" "redis:latest" \
  -p 6379:6379

ensure_container "${MINIO_CONTAINER_NAME}" "${MINIO_IMAGE}" \
  -e MINIO_ROOT_USER="${MINIO_ACCESS_KEY}" \
  -e MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY}" \
  -v "${MINIO_DATA_DIR}:/data" \
  -p 9000:9000 \
  -p 9001:9001 \
  server /data --console-address :9001

docker run --rm --network "container:${MINIO_CONTAINER_NAME}" \
  --entrypoint /bin/sh minio/mc -c \
  "mc alias set local http://localhost:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY} && mc mb -p local/${MINIO_BUCKET} || true && mc anonymous set download local/${MINIO_BUCKET}" >/dev/null

if [[ "${RESTART}" == "1" ]]; then
  kill_port 3005
  kill_port 8081
fi

echo "Starting local server..."
nohup sh -c "cd \"${ROOT_DIR}/server\" && TMPDIR=\"${TMP_DIR}\" corepack yarn tsx --env-file=.env.dev ./sources/main.ts" \
  > "${LOG_DIR}/server.log" 2>&1 &

echo "Starting web dev server..."
nohup sh -c "cd \"${ROOT_DIR}/expo-app\" && EXPO_PUBLIC_HAPPY_SERVER_URL=\"${SERVER_PUBLIC_URL}\" corepack yarn web" \
  > "${LOG_DIR}/expo-web.log" 2>&1 &

echo ""
echo "Server logs: ${LOG_DIR}/server.log"
echo "Web logs:    ${LOG_DIR}/expo-web.log"
echo ""
echo "Start CLI manually (needs TTY):"
echo "  cd \"${ROOT_DIR}/cli\""
echo "  HAPPY_SERVER_URL=${SERVER_PUBLIC_URL} HAPPY_WEBAPP_URL=https://web.vyibc.com corepack yarn dev"
