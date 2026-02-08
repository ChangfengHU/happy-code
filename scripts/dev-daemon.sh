#!/bin/bash
set -e

# 获取脚本所在目录的父目录作为 ROOT_DIR
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 设置开发环境只能用的环境变量
export HAPPY_HOME_DIR="${HAPPY_HOME_DIR:-$HOME/.happy-dev}"
export HAPPY_VARIANT="${HAPPY_VARIANT:-dev}"
export HAPPY_SERVER_URL="${HAPPY_SERVER_URL:-https://server.vyibc.com}"
export HAPPY_WEBAPP_URL="${HAPPY_WEBAPP_URL:-https://web.vyibc.com}"

start() {
    echo "Starting Daemon..."
    cd "${ROOT_DIR}/cli"
    # 使用 nohup 后台运行
    nohup ./bin/happy.mjs daemon start > "${HAPPY_HOME_DIR}/logs/daemon-script.log" 2>&1 &
    
    # 等待一会儿检查是否成功
    sleep 2
    if ./bin/happy.mjs daemon status >/dev/null 2>&1; then
        echo "✅ Daemon started successfully."
    else
        echo "❌ Failed to start daemon. Check logs."
    fi
}

stop() {
    echo "Stopping Daemon..."
    cd "${ROOT_DIR}/cli"
    ./bin/happy.mjs daemon stop || true
    echo "✅ Daemon stopped."
}

restart() {
    stop
    sleep 1
    start
}

status() {
    cd "${ROOT_DIR}/cli"
    ./bin/happy.mjs daemon status
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo ""
        echo "Environment:"
        echo "  HAPPY_HOME_DIR:  $HAPPY_HOME_DIR"
        echo "  HAPPY_VARIANT:   $HAPPY_VARIANT"
        echo "  HAPPY_SERVER_URL:$HAPPY_SERVER_URL"
        echo "  HAPPY_WEBAPP_URL:$HAPPY_WEBAPP_URL"
        exit 1
esac
