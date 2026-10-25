#!/bin/sh
# 从固定完整源码仅更新测试 Web；不重建/重启 API，不改训练数据或正式服务。
set -eu
delivery=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test "$(basename "$delivery")" = opengym-personal-delivery
(cd "$delivery" && sha256sum -c WEBFIX_SHA256SUMS)
revision=$(cat "$delivery/WEBFIX_REVISION")
case "$revision" in *[!a-f0-9]*|'') exit 1;; esac
test "${#revision}" -eq 40
test "$(git get-tar-commit-id < "$delivery/webfix.tar")" = "$revision"
access=$(cat "$delivery/LATEST_ACCESS")
case "$access" in access-*) ;; *) exit 1;; esac
origin=$(cat "$delivery/$access/test-origin.txt")
lan=$(python3 - "$origin" <<'PY'
import ipaddress, sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1]); a = ipaddress.ip_address(u.hostname)
assert a.version == 4 and a.is_private and not a.is_loopback and not a.is_link_local
assert sys.argv[1] == f'http://{a}:8081'
print(a)
PY
)
docker info >/dev/null
test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' opengym-dev-web-1)" = opengym-dev
test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' opengym-dev-api-1)" = "$delivery/state/data"
umask 077
run=$(date -u +%Y%m%dT%H%M%SZ)
source_dir="$delivery/webfix-source-$revision-$run"
evidence="$delivery/webfix-evidence-$run"
mkdir "$source_dir" "$evidence"
tar --no-same-owner -xf "$delivery/webfix.tar" -C "$source_dir"
snapshot() { docker inspect --format '{{.Id}} {{.Image}} {{.State.Running}} {{.State.StartedAt}} {{.RestartCount}}' opengym-api-1 opengym-web-1; }
api_snapshot() { docker inspect --format '{{.Id}} {{.Image}} {{.State.StartedAt}} {{.RestartCount}}' opengym-dev-api-1; }
snapshot > "$evidence/production-before.txt"
api_snapshot > "$evidence/test-api-before.txt"
export PERSONAL_TAG="nas-$revision" PERSONAL_DATA_ROOT="$delivery/state"
export PERSONAL_BIND="$lan" PERSONAL_WEB_PORT=8081 PERSONAL_RP_ID=localhost PERSONAL_ORIGIN="$origin" PERSONAL_COACH_DISABLED=1
compose() { docker compose -p opengym-dev -f "$source_dir/deploy/personal/compose.yml" "$@"; }
compose build web
compose up -d --no-build --no-deps web
curl --noproxy '*' --fail --silent --show-error --retry 20 --retry-all-errors --retry-connrefused --retry-delay 1 --max-time 3 "$origin/api/health"
snapshot > "$evidence/production-after.txt"
api_snapshot > "$evidence/test-api-after.txt"
cmp "$evidence/production-before.txt" "$evidence/production-after.txt"
cmp "$evidence/test-api-before.txt" "$evidence/test-api-after.txt"
printf '%s\n' "$revision" > "$evidence/web-source-revision.txt"
printf 'true\n' > "$evidence/production-unchanged"
printf 'true\n' > "$evidence/test-api-unchanged"
printf '%s\n' "$(basename "$evidence")" > "$delivery/LATEST_WEBFIX"
owner=$(stat -c '%u:%g' "$delivery")
chown "$owner" "$evidence" "$evidence"/* "$delivery/LATEST_WEBFIX"
echo '仅测试 Web 已更新；测试 API、训练数据和正式容器均保留。'
