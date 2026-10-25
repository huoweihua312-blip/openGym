# 个人版测试、备份与发布

> 公开版：主机、账号、域名和正式目录均为占位示例，不能直接当作真实配置。实际环境记录仅在本机私有备份保留；正式脚本仍须按实际路径进行审批前核对。

正式站 `https://gym.example.com`、`<PRODUCTION_ROOT>` 和项目 `opengym` 未改动。以下开发步骤不能在正式目录运行。保留 AGPL-3.0 与第三方资源声明；提供修改版网络服务时，应提供对应修改源码。本分支就是修改源码来源。

## PC 独立测试

需要 Node 22；首次在完整源码根目录执行锁定依赖安装（本次已完成）：

```powershell
npm ci --ignore-scripts --prefix frontend
npm ci --ignore-scripts --omit=optional --prefix api
npm ci --ignore-scripts --prefix mcp
npm run build --prefix frontend
node scripts/personal/local-test.mjs
```

打开 <http://localhost:8081>。数据在根目录 `.local-test/data/`，独立通行密钥使用 `localhost`，不继承正式站账户。主页点击“个人训练 · 三练一休”，再创建模板。个人模式默认不接管旧计划；关闭后可回到原界面。

PC 测试服务只监听回环地址，iPhone 不能直接访问该 localhost。独立 Node 测试栈允许游客用于界面测试；Docker 测试栈默认禁止游客。两者 AI 均默认关闭。不得把 Node 测试服务直接公开。

## 自动验证

```powershell
$env:TZ='Europe/Zurich'
$env:TEMP=Join-Path (Get-Location) 'frontend/.test-tmp'
$env:TMP=$env:TEMP
npm test --prefix frontend -- --maxWorkers=2
node --test --test-concurrency=2 api/test/*.test.js
npm test --prefix mcp
node scripts/personal/smoke-api.mjs
# 浏览器测试使用单独测试浏览器，不连接用户已登录浏览器。
.venv/Scripts/python.exe scripts/personal/browser-smoke.py
$env:PERSONAL_TEST_PASSKEY='1'
.venv/Scripts/python.exe scripts/personal/browser-smoke.py
```

浏览器依赖固定在 `scripts/personal/browser-requirements.txt`。可在项目 `.venv` 安装，使用已安装 Chrome。每次创建全新浏览器上下文，Passkey 使用内存里的虚拟认证器；不读取或导出用户的 Cookie/会话。Windows 的 POSIX 权限及 shell 测试部分跳过，Linux CI 负责执行。

## 完整源码 Docker 测试

需要有 Docker 权限的 Linux 主机、Compose、Node 22。当前 PC 无 Docker，NAS 当前用户无 Docker 权限，所以镜像构建和容器验收在 Fork 的 Actions runner 执行。

```sh
# 必须位于本分支完整源码根目录；不能用正式部署目录代替源码。
sh scripts/personal/deploy-test.sh /srv/opengym-dev
```

脚本拒绝正式目录名、链接路径以及未标记的非空目录；镜像使用独立 tag，Compose 固定项目 `opengym-dev`。默认端口 `127.0.0.1:8081`，独立 `data/` 与 `coach-auth/`。API 不发布端口。启动/重启时有限等待健康结果，不重试写操作。

NAS 执行前应只读确认端口、路径和管理员实际可用入口。缺少 Node 可在 PC 上先用同一校验脚本准备空测试目录并传输完整源码/镜像，但仍需可用 Docker 控制入口；不要因此修改 sudo 或给用户添加 Docker 组。fnOS UI 恢复后可通过其 Compose 管理导入相同文件；填写测试目录绝对路径，检查展开配置不含正式目录。

`deploy/personal/.env.example` 是无秘密模板。Compose 文件不自动读取同目录的 `.env`，若使用配置文件需明确传 `--env-file deploy/personal/.env`，或在当前 shell 导出 `PERSONAL_*`。正式 `.env` 不能复制过来替代测试认证配置。

## iPhone / HTTPS / 测试公网

普通 `http://NAS-IP:8081` 不满足 Passkey 与 PWA 的安全上下文要求。PC localhost 例外不能推广到 NAS IP。

测试公网的待批准方案：独立 `gym-dev.example.com`，先配置 Cloudflare Access 精确邮箱允许规则，关闭任何 bypass；仅保护此主机，不改正式策略。再为独立 Tunnel 路由映射测试 Web，`RP_ID` 与 `ORIGIN` 改为该测试域名和 HTTPS 地址。源站端口只允许实际 Tunnel 来源；不能为了访问而开放 NAS 管理端口。变更前必须检查现有策略和路径顺序，登录用的 `/api/*`、静态资源、SW 同样受保护。确认 Access 后才允许添加公网路由；两项均需用户授权。

Access 登录会话过期可能暂停后台同步/推送，必须在 iPhone 真机验证，不保证锁屏提醒。原应用推送需要实际订阅与系统允许，本次未冒称已完成。Safari 分享→添加到主屏幕后，测试 Face ID、屏幕锁定、切后台、重新进入、网络断开及跨设备同步。

不开放测试公网时，仍可在 PC localhost 完成核心验收；当前正采用此方式。

## DeepSeek

复用原有 AI Coach 的 `openai-compatible` 服务端 Provider，在管理员界面设置兼容 API 地址、模型名称与 Key。模型名必须以账户实际可用值为准，不假定用户口述版本存在。不要把 Key 写入前端构建变量、Compose 命令、Git 或截图。本次未访问真实 Key，没有实际模型费用。

服务端为用户隔离任务和数据，原有超时、并发/请求预算、输出校验继续生效。个人模块只补充白名单规则和实际证据；用户逐项确认后仅可微调组数、次数、顺序和名称。禁止 AI 更改循环、历史、热身、器材和进阶算法；创建替代整套计划需退出个人模式并复核。无 AI 时所有核心功能正常。

## 完整备份与恢复验证

备份目录包含认证及训练所需秘密，应放在私有存储、限制访问，并另行保留离线副本，不上传公共仓库。备份包括 `data/` 全部内容（用户、通行密钥、签名 secret、训练状态、推送状态、媒体、AI 配置等）、存在时的 `coach-auth/` 与 `.env`。正式环境实际挂载若不同，必须先核查并调整，不能只备份 workouts。

```sh
# 测试环境先停止写入，再备份到源目录外的全新私有路径。
node scripts/personal/backup.mjs backup /srv/opengym-dev /srv/private-backups/personal-test-20261025
node scripts/personal/backup.mjs verify /srv/private-backups/personal-test-20261025
node scripts/personal/backup.mjs restore-test /srv/private-backups/personal-test-20261025 /srv/personal-test-restored
```

脚本拒绝覆盖、链接、越界、清单外文件及缺失认证 secret。正式备份须在用户批准后追加 `--production-approved`，并在停止应用写入期间执行以保证文件间一致。仅有散列校验不能证明能恢复；合成 API 演练已实际验证恢复后原会话仍有效，正式数据恢复演练尚未做。

## 正式发布与回滚：只供批准后手动使用

`release.sh` 不是自动 CI 步骤。本次从未执行。发布前须通过 NAS/iPhone/真实 Provider 验收，确认真实挂载、当前容器/项目、恢复演练和可接受停机窗口，并明确获得用户批准。

1. 在完整源码目录构建、验收独立固定镜像标签并核对源码版本；保留旧镜像，勿清理镜像。
2. 核实正式配置文件确为 `<PRODUCTION_ROOT>/docker-compose.yml`，data/coach-auth 映射真实位置，RP_ID/ORIGIN 与正式 HTTPS 完全一致；脚本当前按这些路径编写，不符合就先改脚本并测试。
3. 明确设置 `PERSONAL_RELEASE_TAG`、`OPENGYM_BACKUP_DEST` 全新私有路径，再手动执行 `sh scripts/personal/release.sh --production-approved`。
4. 脚本只暂停正式 web/api，完整备份，记录精确旧镜像 ID，用覆盖文件切换镜像（`--no-build`），健康失败时回退镜像。不会覆盖正式 compose/.env，也不在缺源码的正式目录构建。
5. 人工检查登录、个人模式、训练、同步和备份；失败时手动 `sh scripts/personal/rollback.sh --production-approved <备份路径>.release`。

回滚只回退镜像，不覆盖新数据。任何正式数据恢复/迁移需要再次审批，并先在独立测试目录验证。发布期间若遇系统中断，应按 `.release` 内记录人工核对状态；脚本不保证主机断电时自动事务回滚。
