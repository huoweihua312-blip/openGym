#!/bin/sh
# 仅用户明确批准后手动运行；开发测试过程不得执行。
set -eu
if [ "${1:-}" != '--production-approved' ]; then
  echo '拒绝执行。请先完成测试验收、完整备份和审批，再手动传 --production-approved。'
  exit 1
fi
source_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
prod_root=${OPENGYM_PRODUCTION_ROOT:-/vol1/1000/opengym}
tag=${PERSONAL_RELEASE_TAG:?必须指定已经验收的独立镜像标签}
case "$tag" in *[!A-Za-z0-9_.-]*) echo '镜像标签无效'; exit 1;; esac
backup_dir=${OPENGYM_BACKUP_DEST:?必须指定新的私有备份目录}
release_dir="$backup_dir.release"
test ! -e "$release_dir" || { echo '发布元数据目录已存在'; exit 1; }
test "$prod_root" = '/vol1/1000/opengym' || { echo '正式路径不符合预期'; exit 1; }
docker image inspect "opengym-personal-api:$tag" >/dev/null
docker image inspect "opengym-personal-web:$tag" >/dev/null
test -f "$prod_root/.env" && test -d "$prod_root/data"
# 先暂停两项正式服务保证跨文件一致性；无其他项目停机。
docker compose -p opengym --project-directory "$prod_root" stop web api
if ! node "$source_root/scripts/personal/backup.mjs" backup "$prod_root" "$backup_dir" --production-approved; then
  docker compose -p opengym --project-directory "$prod_root" start api web
  exit 1
fi
umask 077
mkdir "$release_dir"
docker inspect --format '{{.Image}}' opengym-api-1 > "$release_dir/previous-api-image.txt"
docker inspect --format '{{.Image}}' opengym-web-1 > "$release_dir/previous-web-image.txt"
# 文件放在完整源码目录；不在正式目录执行 --build，也不覆盖正式 compose/.env。
override="$release_dir/release-override.yml"
printf 'services:\n  api:\n    image: opengym-personal-api:%s\n  web:\n    image: opengym-personal-web:%s\n' "$tag" "$tag" > "$override"
if ! docker compose -p opengym --project-directory "$prod_root" -f "$prod_root/docker-compose.yml" -f "$override" up -d --no-build; then
  sh "$source_root/scripts/personal/rollback.sh" --production-approved "$release_dir"; exit 1
fi
if ! curl --fail --retry 12 --retry-connrefused --retry-delay 2 http://127.0.0.1:8080/api/health; then
  sh "$source_root/scripts/personal/rollback.sh" --production-approved "$release_dir"; exit 1
fi
