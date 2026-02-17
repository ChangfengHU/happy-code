#!/usr/bin/env bash

# Ensure bash semantics even when invoked via `sh start-dev.sh`
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

# 开发环境启动脚本
# 支持启动完整开发环境：Docker 服务 + Server + Expo Web
# 可通过 RESTART=1 强制重启服务

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 项目根目录
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/.run-logs"
TMP_DIR="${ROOT_DIR}/.tmp"

# 服务配置
# 默认指向公网服务，必要时用 SERVER_PUBLIC_URL 或 HAPPY_SERVER_URL 覆盖
SERVER_PUBLIC_URL="${SERVER_PUBLIC_URL:-${HAPPY_SERVER_URL:-https://server.vyibc.com}}"
WEBAPP_PUBLIC_URL="${WEBAPP_PUBLIC_URL:-${HAPPY_WEBAPP_URL:-https://web.vyibc.com}}"
RESTART="${RESTART:-0}"
CLEAR="${CLEAR:-0}"

# CLI Daemon 环境变量
HAPPY_HOME_DIR="${HAPPY_HOME_DIR:-$HOME/.happy-dev}"
HAPPY_VARIANT="${HAPPY_VARIANT:-dev}"

PG_CONTAINER_NAME="${PG_CONTAINER_NAME:-happy-postgres}"
REDIS_CONTAINER_NAME="${REDIS_CONTAINER_NAME:-happy-redis}"
MINIO_CONTAINER_NAME="${MINIO_CONTAINER_NAME:-minio}"

PG_DATA_DIR="${ROOT_DIR}/server/.pgdata"
MINIO_DATA_DIR="${ROOT_DIR}/server/.minio/data"

MINIO_IMAGE="${MINIO_IMAGE:-minio/minio:RELEASE.2024-12-13T22-19-12Z}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
MINIO_BUCKET="${MINIO_BUCKET:-happy}"

log_info() { echo -e "${BLUE}[信息]${NC} $1"; }
log_success() { echo -e "${GREEN}[成功]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[警告]${NC} $1"; }
log_error() { echo -e "${RED}[错误]${NC} $1"; }

log_section() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

wait_for_port_listen() {
  local port="$1"
  local max_retries="${2:-30}"
  local retry_count=0

  while [[ ${retry_count} -lt ${max_retries} ]]; do
    if lsof -ti tcp:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    retry_count=$((retry_count + 1))
    sleep 1
  done
  return 1
}

check_docker() {
  if ! docker info >/dev/null 2>&1; then
    log_error "Docker 未运行，请先启动 Docker/Colima"
    exit 1
  fi
  log_success "Docker 正在运行"
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    log_warn "发现端口 ${port} 被占用，正在终止进程..."
    kill -9 ${pids} >/dev/null 2>&1 || true
    sleep 1
    log_success "端口 ${port} 已释放"
  fi
}

ensure_container() {
  local name="$1"
  local image="$2"
  shift 2

  if docker ps --format '{{.Names}}' | grep -q "^${name}\$"; then
    if [[ "${RESTART}" == "1" ]]; then
      docker restart "${name}" >/dev/null
      log_success "${name} 已重启"
    else
      log_success "${name} 已在运行"
    fi
    return
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${name}\$"; then
    docker start "${name}" >/dev/null
    log_success "${name} 已启动"
    return
  fi

  docker run -d --name "${name}" "$@" "${image}" >/dev/null
  log_success "${name} 已创建"
}

start_postgres() {
  log_info "检查 PostgreSQL (5432)..."
  ensure_container "${PG_CONTAINER_NAME}" "postgres:16" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=handy \
    -v "${PG_DATA_DIR}:/var/lib/postgresql/data" \
    -p 5432:5432
}

wait_for_postgres() {
  local max_retries="${1:-45}"
  local retry_count=0

  log_info "等待 PostgreSQL 就绪..."

  if docker ps -a --format '{{.Names}}' | grep -q "^${PG_CONTAINER_NAME}\$"; then
    while [[ ${retry_count} -lt ${max_retries} ]]; do
      if docker exec "${PG_CONTAINER_NAME}" pg_isready -U postgres -d handy >/dev/null 2>&1; then
        log_success "PostgreSQL 已就绪"
        return 0
      fi
      retry_count=$((retry_count + 1))
      sleep 1
    done

    log_error "PostgreSQL 在 ${max_retries} 秒内未就绪"
    docker logs "${PG_CONTAINER_NAME}" --tail 40 2>/dev/null || true
    return 1
  fi

  while [[ ${retry_count} -lt ${max_retries} ]]; do
    if nc -z localhost 5432 >/dev/null 2>&1; then
      log_success "PostgreSQL 端口已就绪"
      return 0
    fi
    retry_count=$((retry_count + 1))
    sleep 1
  done

  log_error "未检测到可用的 PostgreSQL (localhost:5432)"
  return 1
}

start_redis() {
  log_info "检查 Redis (6379)..."
  ensure_container "${REDIS_CONTAINER_NAME}" "redis:latest" \
    -p 6379:6379
}

start_minio() {
  log_info "检查 MinIO/S3 (9000/9001)..."
  ensure_container "${MINIO_CONTAINER_NAME}" "${MINIO_IMAGE}" \
    -e MINIO_ROOT_USER="${MINIO_ACCESS_KEY}" \
    -e MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY}" \
    -v "${MINIO_DATA_DIR}:/data" \
    -p 9000:9000 \
    -p 9001:9001 \
    server /data --console-address :9001
}

init_minio_bucket() {
  log_info "初始化 MinIO Bucket..."
  
  # 等待 MinIO 服务就绪（最多等待 30 秒）
  local max_retries=15
  local retry_count=0
  local ready=0
  
  log_info "等待 MinIO 服务就绪..."
  while [[ ${retry_count} -lt ${max_retries} ]]; do
    if docker run --rm --network "container:${MINIO_CONTAINER_NAME}" \
      --entrypoint /bin/sh minio/mc -c \
      "mc alias set local http://localhost:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY}" >/dev/null 2>&1; then
      ready=1
      break
    fi
    retry_count=$((retry_count + 1))
    log_info "MinIO 未就绪，等待中... (${retry_count}/${max_retries})"
    sleep 2
  done
  
  if [[ ${ready} -eq 0 ]]; then
    log_warn "MinIO 服务在 ${max_retries} 次尝试后仍未就绪，跳过 bucket 初始化"
    log_warn "可稍后手动运行: $0 docker"
    return 1
  fi
  
  # 创建 bucket 并设置权限
  docker run --rm --network "container:${MINIO_CONTAINER_NAME}" \
    --entrypoint /bin/sh minio/mc -c \
    "mc alias set local http://localhost:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY} && mc mb -p local/${MINIO_BUCKET} || true && mc anonymous set download local/${MINIO_BUCKET}" >/dev/null
  log_success "MinIO Bucket 已初始化"
}

start_server() {
  log_info "准备启动 Server (3005)..."
  wait_for_postgres
  kill_port 3005
  mkdir -p "${LOG_DIR}" "${TMP_DIR}"
  cd "${ROOT_DIR}/server"
  if [[ ! -d node_modules ]]; then
    log_info "安装 Server 依赖..."
    corepack yarn install
  fi
  log_info "正在启动 Server..."
  nohup sh -c "TMPDIR=\"${TMP_DIR}\" corepack yarn tsx --env-file=.env.dev ./sources/main.ts" \
    > "${LOG_DIR}/server.log" 2>&1 &
  log_success "Server 启动中，日志: ${LOG_DIR}/server.log"

  if ! wait_for_port_listen 3005 30; then
    log_error "Server 启动失败，请检查日志: ${LOG_DIR}/server.log"
    tail -n 60 "${LOG_DIR}/server.log" 2>/dev/null || true
    return 1
  fi

  log_success "Server 已就绪 (3005)"
}

start_expo() {
  log_info "准备启动 Expo Web (8754)..."
  kill_port 8081
  kill_port 8754
  mkdir -p "${LOG_DIR}"
  cd "${ROOT_DIR}/expo-app"
  if [[ ! -d node_modules ]]; then
    log_info "安装 Expo 依赖..."
    corepack yarn install
  fi
  log_info "正在启动 Expo Web..."
  local clear_flag=""
  if [[ "${CLEAR}" == "1" ]]; then
    clear_flag="--clear"
  fi
  nohup sh -c "EXPO_PUBLIC_HAPPY_SERVER_URL=\"${SERVER_PUBLIC_URL}\" npx expo start --web --port 8754 --host lan ${clear_flag}" \
    > "${LOG_DIR}/expo-web.log" 2>&1 &
  log_success "Expo Web 启动中，日志: ${LOG_DIR}/expo-web.log"
}

start_daemon() {
  log_info "检查 CLI Daemon..."
  cd "${ROOT_DIR}/cli"

  # 检查是否已经在运行
  if HAPPY_HOME_DIR="${HAPPY_HOME_DIR}" HAPPY_VARIANT="${HAPPY_VARIANT}" ./bin/happy.mjs daemon status >/dev/null 2>&1; then
    if [[ "${RESTART}" == "1" ]]; then
      log_info "正在重启 CLI Daemon..."
      HAPPY_HOME_DIR="${HAPPY_HOME_DIR}" HAPPY_VARIANT="${HAPPY_VARIANT}" ./bin/happy.mjs daemon stop >/dev/null 2>&1 || true
      sleep 1
    else
      log_success "CLI Daemon 已在运行"
      return
    fi
  fi

  # 构建（如果需要）
  if [[ ! -d dist ]]; then
    log_info "构建 CLI..."
    corepack yarn build
  fi

  log_info "正在启动 CLI Daemon..."
  nohup sh -c "HAPPY_HOME_DIR=\"${HAPPY_HOME_DIR}\" HAPPY_VARIANT=\"${HAPPY_VARIANT}\" HAPPY_SERVER_URL=\"${SERVER_PUBLIC_URL}\" HAPPY_WEBAPP_URL=\"${WEBAPP_PUBLIC_URL}\" node dist/index.mjs daemon start" \
    > "${LOG_DIR}/daemon.log" 2>&1 &
  log_success "CLI Daemon 启动中，日志: ${LOG_DIR}/daemon.log"

  # 等待 daemon 启动
  sleep 2
}

start_docker_services() {
  log_section "启动 Docker 基础服务"
  check_docker
  mkdir -p "${PG_DATA_DIR}" "${MINIO_DATA_DIR}"
  start_postgres
  start_redis
  start_minio
  init_minio_bucket
}

start_app_services() {
  log_section "启动应用服务"
  start_server
  start_expo
  start_daemon
}

show_status() {
  log_section "服务状态检查"
  if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER_NAME}\$"; then
    echo -e "  PostgreSQL (5432):  ${GREEN}运行中${NC}"
  else
    echo -e "  PostgreSQL (5432):  ${RED}未运行${NC}"
  fi
  if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER_NAME}\$"; then
    echo -e "  Redis (6379):       ${GREEN}运行中${NC}"
  else
    echo -e "  Redis (6379):       ${RED}未运行${NC}"
  fi
  if docker ps --format '{{.Names}}' | grep -q "^${MINIO_CONTAINER_NAME}\$"; then
    echo -e "  MinIO (9000/9001):  ${GREEN}运行中${NC}"
  else
    echo -e "  MinIO (9000/9001):  ${RED}未运行${NC}"
  fi
  if lsof -ti tcp:3005 >/dev/null 2>&1; then
    echo -e "  Server (3005):      ${GREEN}运行中${NC}"
  else
    echo -e "  Server (3005):      ${RED}未运行${NC}"
  fi
  if lsof -ti tcp:8754 >/dev/null 2>&1; then
    echo -e "  Expo Web (8754):    ${GREEN}运行中${NC}"
  else
    echo -e "  Expo Web (8754):    ${RED}未运行${NC}"
  fi
  if cd "${ROOT_DIR}/cli" && HAPPY_HOME_DIR="${HAPPY_HOME_DIR}" HAPPY_VARIANT="${HAPPY_VARIANT}" ./bin/happy.mjs daemon status >/dev/null 2>&1; then
    echo -e "  CLI Daemon:         ${GREEN}运行中${NC}"
  else
    echo -e "  CLI Daemon:         ${RED}未运行${NC}"
  fi
}

kill_all() {
  log_section "停止所有服务"
  kill_port 3005
  kill_port 8754
  cd "${ROOT_DIR}/cli" && HAPPY_HOME_DIR="${HAPPY_HOME_DIR}" HAPPY_VARIANT="${HAPPY_VARIANT}" ./bin/happy.mjs daemon stop >/dev/null 2>&1 || true
  docker stop "${PG_CONTAINER_NAME}" "${REDIS_CONTAINER_NAME}" "${MINIO_CONTAINER_NAME}" 2>/dev/null || true
  log_success "所有服务已停止"
}

show_help() {
  echo ""
  echo "Happy 开发环境启动脚本"
  echo ""
  echo "用法: $0 [选项]"
  echo ""
  echo "选项:"
  echo "  all       启动所有服务 (Docker + Server + Expo + Daemon) [默认]"
  echo "  docker    仅启动 Docker 服务 (PostgreSQL, Redis, MinIO)"
  echo "  apps      仅启动应用服务 (Server + Expo + Daemon)"
  echo "  server    仅启动 Server (3005端口)"
  echo "  expo      仅启动 Expo Web (8081端口)"
  echo "  daemon    仅启动 CLI Daemon"
  echo "  restart   强制重启服务 (等同 RESTART=1 all)"
  echo ""
  echo "环境变量:"
  echo "  SERVER_PUBLIC_URL / HAPPY_SERVER_URL  设置 Web 端访问的服务地址"
  echo "  CLEAR=1   启动 Expo Web 时使用 --clear 清缓存"
  echo "  kill      停止所有服务"
  echo "  status    查看服务状态"
  echo "  help      显示此帮助信息"
  echo ""
}

main() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║       Happy 开发环境启动脚本              ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"

  case "${1:-all}" in
    all)
      start_docker_services
      start_app_services
      ;;
    restart)
      RESTART=1
      start_docker_services
      start_app_services
      ;;
    docker)
      start_docker_services
      ;;
    apps)
      start_app_services
      ;;
    server)
      start_server
      ;;
    expo)
      start_expo
      ;;
    daemon)
      start_daemon
      ;;
    kill)
      kill_all
      ;;
    status)
      show_status
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      log_error "未知选项: $1"
      show_help
      exit 1
      ;;
  esac

  echo ""
  log_info "使用 '$0 status' 查看运行状态"
  log_info "使用 '$0 kill' 停止所有服务"
  echo ""
}

main "$@"
