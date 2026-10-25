#!/bin/sh
set -eu
source_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
test_root=${1:-"$source_root/.local-test"}
command -v node >/dev/null || { echo '需要 Node 22+ 运行部署路径校验。'; exit 1; }
node "$source_root/scripts/personal/backup.mjs" init-test "$test_root"
export PERSONAL_DATA_ROOT="$test_root"
export PERSONAL_TAG=${PERSONAL_TAG:-$(git -C "$source_root" rev-parse --short HEAD)}
docker compose -p opengym-dev -f "$source_root/deploy/personal/compose.yml" config --quiet
docker compose -p opengym-dev -f "$source_root/deploy/personal/compose.yml" build
docker compose -p opengym-dev -f "$source_root/deploy/personal/compose.yml" up -d --no-build
docker compose -p opengym-dev -f "$source_root/deploy/personal/compose.yml" ps
curl --fail --retry 12 --retry-connrefused --retry-delay 2 "http://127.0.0.1:${PERSONAL_WEB_PORT:-8081}/api/health"
