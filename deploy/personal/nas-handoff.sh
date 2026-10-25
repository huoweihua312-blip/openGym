#!/bin/sh
# 一次性交付入口；只构建/启动/重启 opengym-dev，不授予永久 Docker 权限。
set -eu
delivery=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$(basename "$delivery")" in opengym-personal-delivery|personal-test-*) ;; *) echo '交付目录名称不符合隔离约定'; exit 1;; esac
source_dir="$delivery/source"
state_dir="$delivery/state"
evidence="$delivery/evidence-$(date -u +%Y%m%dT%H%M%SZ)"
test -f "$delivery/REVISION" && test -f "$delivery/PACKAGE_SHA256SUMS"
revision=$(cat "$delivery/REVISION")
case "$revision" in *[!a-f0-9]*|'') echo '源码标识无效'; exit 1;; esac
test "${#revision}" -eq 40
test -f "$delivery/source.tar"
(cd "$delivery" && sha256sum -c PACKAGE_SHA256SUMS)
test "$(git get-tar-commit-id < "$delivery/source.tar")" = "$revision" || { echo '源码归档提交与固定版本不符'; exit 1; }
docker info >/dev/null 2>&1 || { echo '本次部署需要执行者具有 Docker 权限；请仅对此脚本使用一次 sudo。'; exit 1; }
docker compose version >/dev/null
test "$(df -Pk "$delivery" | awk 'NR==2 {print $4}')" -ge 4194304 || { echo '不足 4GiB 可用空间，停止'; exit 1; }
test -z "$(docker ps -aq --filter label=com.docker.compose.project=opengym-dev)" || { echo '已有 opengym-dev 容器，拒绝替换'; exit 1; }
test -z "$(ss -H -ltn 'sport = :8081')" || { echo '8081 已占用，拒绝启动'; exit 1; }
umask 077
test ! -e "$evidence" || { echo '本次证据目录已存在'; exit 1; }
mkdir "$evidence"
if test -e "$source_dir"; then
  # 构建失败可续跑，但已解包源码必须与固定归档完全一致。
  test -d "$source_dir" && test ! -L "$source_dir"
else
  mkdir "$source_dir"
  tar --no-same-owner -xf "$delivery/source.tar" -C "$source_dir"
fi
python3 - "$delivery/source.tar" "$source_dir" <<'PY'
import hashlib, pathlib, sys, tarfile
root = pathlib.Path(sys.argv[2]).resolve()
expected = set()
def digest(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return h.digest()
with tarfile.open(sys.argv[1]) as archive:
    for item in archive:
        rel = pathlib.PurePosixPath(item.name)
        assert not rel.is_absolute() and '..' not in rel.parts
        dest = root.joinpath(*rel.parts)
        assert not dest.is_symlink() and root in (dest, *dest.parents)
        if item.isdir(): assert dest.is_dir()
        else:
            assert item.isfile() and dest.is_file() and dest.stat().st_size == item.size
            with archive.extractfile(item) as a, dest.open('rb') as b: assert digest(a) == digest(b)
            expected.add(rel.as_posix())
actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
assert actual == expected and not any(p.is_symlink() for p in root.rglob('*'))
print('已解包源码内容与固定归档一致')
PY
test -d "$source_dir/api/personal" && test -f "$source_dir/deploy/personal/compose.yml"
if test -e "$state_dir"; then
  test -d "$state_dir" && test ! -L "$state_dir"
  test "$(cat "$state_dir/.opengym-personal-test")" = 'OpenGym Personal isolated NAS test'
  test -d "$state_dir/data" && test -d "$state_dir/coach-auth"
  test ! -L "$state_dir/data" && test ! -L "$state_dir/coach-auth"
  test -z "$(find "$state_dir/data" "$state_dir/coach-auth" -mindepth 1 -print -quit)" || { echo '已有测试数据，拒绝覆盖或重新注册'; exit 1; }
else
  mkdir "$state_dir" "$state_dir/data" "$state_dir/coach-auth"
  printf 'OpenGym Personal isolated NAS test\n' > "$state_dir/.opengym-personal-test"
fi
# 仅记录容器身份/启动时间/重启数，不读取 Env、真实数据或秘密。
production_snapshot() {
  docker inspect --format '{{.Id}} {{.Image}} {{.State.Running}} {{.State.StartedAt}} {{.RestartCount}}' opengym-api-1 opengym-web-1
}
production_snapshot > "$evidence/production-before.txt"
cat > "$evidence/test-override.yml" <<'YAML'
services:
  api:
    environment:
      PASSWORD_LOGIN: '1'
YAML
export PERSONAL_TAG="nas-${revision}"
export PERSONAL_DATA_ROOT="$state_dir"
export PERSONAL_BIND=127.0.0.1 PERSONAL_WEB_PORT=8081
export PERSONAL_RP_ID=localhost PERSONAL_ORIGIN=http://localhost:18081
export PERSONAL_COACH_DISABLED=1 COMPOSE_PARALLEL_LIMIT=1
compose() {
  # Compose 相对路径以首个 compose 文件所在目录为准，不用 --project-directory 重定位。
  docker compose -p opengym-dev -f "$source_dir/deploy/personal/compose.yml" -f "$evidence/test-override.yml" "$@"
}
compose config --quiet
compose config --format json > "$evidence/compose-resolved.json"
python3 - "$source_dir" "$evidence/compose-resolved.json" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve()
c = json.load(open(sys.argv[2]))
assert set(c['services']) == {'api', 'web'}
assert pathlib.Path(c['services']['api']['build']['context']).resolve() == root / 'api'
assert pathlib.Path(c['services']['web']['build']['context']).resolve() == root
p = c['services']['web']['ports']
assert len(p) == 1 and p[0]['host_ip'] == '127.0.0.1' and str(p[0]['published']) == '8081'
assert not c['services']['api'].get('ports')
PY
compose build
compose up -d --no-build
docker run --rm --network opengym-dev_personal \
  --mount "type=bind,src=$source_dir,dst=/source,readonly" \
  --mount "type=bind,src=$evidence,dst=/evidence" \
  --entrypoint node "opengym-personal-api:$PERSONAL_TAG" \
  /source/scripts/personal/nas-acceptance.mjs http://api:3000 /evidence > "$evidence/acceptance.log" 2>&1 &
validator=$!
count=0
while test ! -f "$evidence/ready"; do
  kill -0 "$validator" 2>/dev/null || { cat "$evidence/acceptance.log"; echo '测试初始化失败；保留隔离栈便于诊断'; exit 1; }
  count=$((count + 1)); test "$count" -lt 180 || { echo '等待初始化超时；保留隔离栈'; exit 1; }
  sleep 1
done
# 仅固定的两个测试服务。正式容器快照必须在重启前后保持完全一致。
production_snapshot > "$evidence/production-mid.txt"
cmp "$evidence/production-before.txt" "$evidence/production-mid.txt"
compose restart api web
printf 'isolated containers restarted\n' > "$evidence/restarted"
wait "$validator" || { cat "$evidence/acceptance.log"; exit 1; }
production_snapshot > "$evidence/production-after.txt"
cmp "$evidence/production-before.txt" "$evidence/production-after.txt"
compose ps > "$evidence/containers.txt"
printf '%s\n' "$revision" > "$evidence/source-revision.txt"
if test -f "$delivery/DEPLOY_SCRIPT_REVISION"; then cat "$delivery/DEPLOY_SCRIPT_REVISION" > "$evidence/deploy-script-revision.txt"; fi
printf 'true\n' > "$evidence/production-unchanged"
# 证据不含 Cookie/密码/Key；便于原用户通过既有 SSH 读取结果。
owner=$(stat -c '%u:%g' "$delivery")
chown "$owner" "$evidence" "$evidence"/*
printf '%s\n' "$(basename "$evidence")" > "$delivery/LATEST_EVIDENCE"
chown "$owner" "$delivery/LATEST_EVIDENCE"
cat "$evidence/result.json"
echo 'NAS 隔离栈启动与持久化验收通过；正式容器身份/运行时间/重启数未改变。'
echo '仅监听 NAS 回环 8081。通过既有 SSH 转发到 PC localhost:18081 后使用。'
