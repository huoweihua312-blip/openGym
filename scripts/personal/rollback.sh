#!/bin/sh
set -eu
test "${1:-}" = '--production-approved' || { echo '正式回滚须明确批准'; exit 1; }
backup_dir=${2:?指定发布时的私有备份目录}
prod_root=/vol1/1000/opengym
api_image=$(cat "$backup_dir/previous-api-image.txt")
web_image=$(cat "$backup_dir/previous-web-image.txt")
case "$api_image$web_image" in *[!A-Za-z0-9_./:@-]*) echo '镜像名无效'; exit 1;; esac
docker image inspect "$api_image" >/dev/null
docker image inspect "$web_image" >/dev/null
umask 077
override="$backup_dir/rollback-override.yml"
printf 'services:\n  api:\n    image: %s\n  web:\n    image: %s\n' "$api_image" "$web_image" > "$override"
docker compose -p opengym --project-directory "$prod_root" -f "$prod_root/docker-compose.yml" -f "$override" up -d --no-build
curl --fail --retry 12 --retry-connrefused --retry-delay 2 http://127.0.0.1:8080/api/health
echo '已回滚镜像；未覆盖训练数据。数据恢复必须另行批准并先在独立测试环境验证。'
