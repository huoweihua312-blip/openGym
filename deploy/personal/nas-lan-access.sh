#!/bin/sh
# 只发布独立测试站的局域网 IPv4；不改变 SSH、正式容器或 Cloudflare。
set -eu
delivery=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$(basename "$delivery")" in opengym-personal-delivery) ;; *) exit 1;; esac
lan=${1:?指定 NAS 局域网 IPv4}
python3 - "$lan" <<'PY'
import ipaddress, sys
a = ipaddress.ip_address(sys.argv[1])
assert a.version == 4 and a.is_private and not a.is_loopback and not a.is_link_local and not a.is_unspecified
PY
docker info >/dev/null
revision=$(cat "$delivery/REVISION")
case "$revision" in *[!a-f0-9]*|'') exit 1;; esac
for container in opengym-dev-api-1 opengym-dev-web-1; do
  test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" = opengym-dev
done
test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' opengym-dev-api-1)" = "$delivery/state/data"
umask 077
evidence="$delivery/access-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$evidence"
snapshot() { docker inspect --format '{{.Id}} {{.Image}} {{.State.Running}} {{.State.StartedAt}} {{.RestartCount}}' opengym-api-1 opengym-web-1; }
snapshot > "$evidence/production-before.txt"
cat > "$evidence/test-override.yml" <<'YAML'
services:
  api:
    environment:
      PASSWORD_LOGIN: '1'
YAML
export PERSONAL_TAG="nas-$revision" PERSONAL_DATA_ROOT="$delivery/state"
export PERSONAL_BIND="$lan" PERSONAL_WEB_PORT=8081 PERSONAL_RP_ID=localhost
export PERSONAL_ORIGIN="http://$lan:8081" PERSONAL_COACH_DISABLED=1
docker image inspect "opengym-personal-api:$PERSONAL_TAG" "opengym-personal-web:$PERSONAL_TAG" >/dev/null
docker compose -p opengym-dev -f "$delivery/source/deploy/personal/compose.yml" -f "$evidence/test-override.yml" up -d --no-build
curl --noproxy '*' --fail --silent --show-error --retry 20 --retry-all-errors --retry-connrefused --retry-delay 1 --max-time 3 "http://$lan:8081/api/health"
snapshot > "$evidence/production-after.txt"
cmp "$evidence/production-before.txt" "$evidence/production-after.txt"
printf 'true\n' > "$evidence/production-unchanged"
printf '%s\n' "$PERSONAL_ORIGIN" > "$evidence/test-origin.txt"
printf '%s\n' "$(basename "$evidence")" > "$delivery/LATEST_ACCESS"
owner=$(stat -c '%u:%g' "$delivery")
chown "$owner" "$evidence" "$evidence"/* "$delivery/LATEST_ACCESS"
printf '\n测试站局域网入口：%s；AI 保持关闭；正式容器未改变。\n' "$PERSONAL_ORIGIN"
echo '普通 HTTP 仅用于合成数据/密码流程验收，Passkey/PWA 与真实 Key 配置待可信 HTTPS。'
