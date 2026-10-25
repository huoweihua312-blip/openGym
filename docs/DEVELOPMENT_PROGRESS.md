# OpenGym Personal 开发进度

> 公开版：主机、账号、域名和正式目录均为占位示例，不能直接当作真实配置。实际环境记录仅在本机私有备份保留；正式脚本仍须按实际路径进行审批前核对。

更新：2026-10-25。目标：个人家庭增肌、NAS 自托管、iPhone Safari/PWA；基于 Fork，不改正式环境。

## 阶段状态

| 阶段 | 当前结果 |
|---|---|
| 0 源码审计 | Fork/main 与 upstream/main 同为 `7a3ace53c5e910c2185f22df803726c5838a99ae`（v1.4.2），保留上游结构与许可证 |
| 1 工程准备 | 完整源码、独立 `feature/personal-gym`、测试/验收文档、Linux CI 已建立 |
| 2 循环 | 已实现事件投影、必做组验证、自然休息日、补录、纠正、恢复、并发/重试去重，已测试 |
| 3 器材 | 已实现对称库存计算、实测分离、合法重量、拆装成本、可编辑档案，已测试 |
| 4 进阶 | 已实现证据链、双重渐进、RIR/质量、跨度/下降提醒、接受/忽略，已测试 |
| 5 手机 | 专注组记录、热身、历史、休息恢复、离线/重连，Chromium 触控模拟通过，iPhone 实机待验收 |
| 6 AI | 原 Provider/MCP/Coach、规则白名单、确认后受限处方调整已测试，真实 DeepSeek 未测试 |
| 7 回归 | 最终代码 Linux CI 全部通过：前端 5,610/API 653/MCP 95，0 失败、0 跳过 |
| 8 测试部署 | 本地独立栈与 Linux Docker 独立栈通过，虚拟 Passkey/离线/容器重启后恢复通过；NAS 未部署 |
| 9 发布准备 | 备份/恢复/隔离部署/正式发布/回滚脚本已编写，正式发布未执行 |

## 提交与远端

分支：<https://github.com/huoweihua312-blip/openGym/tree/feature/personal-gym>。

| 模块 | 本地提交 | Fork 上提交 |
|---|---|---|
| 设计与验收 | `1e461c4` | `dc95254` |
| 核心规则/同步 | `89919d5` | `f4d6a9f` |
| 手机/AI | `b1a8a2e` | `2a776bd` |
| Windows 兼容 | `68913d3` | `07f6014` |
| 隔离部署/备份 | `df7f7ce` | `5bbaaa9` |
| 启动等待/安全依赖 | `d984c60` | `61feadf` |
| AI 确认/通行密钥验收 | `0dad78d` | `661fff5` |
| CI 路径/便携测试/源码链接 | `36c15a9` | `a775450` |

Git CLI 直连 github.com 不通，通过已授权 GitHub connector 逐个创建提交并快进更新分支，无强推。相同文件树逐次校验；提交者/时间不同产生不同 SHA。随后导入公开提交对象逐个校验原 SHA，使本地分支与 Fork 一致；原本地历史保存在 archive 分支。表中“本地提交”为发布前的对应原提交。origin 指向个人 Fork，upstream 指向原项目，main 未修改。最终文档提交见分支日志。

## 已运行证据

- 最终 Linux CI：前端 452 文件/5,610 通过，API 653 通过，MCP 95 通过，均 0 失败、0 跳过，合计 6,358 项。
- Windows 前端完整回归 5,597 通过/11 跳过；最后 AI 调整后相关 167 项、最终个人功能 48 项通过。
- Windows API（依赖升级后）650 通过/3 平台跳过；MCP 94 通过/1 跳过，Linux 已补足所有跳过项。
- 前端生产构建通过；保留上游已有动态导入/包体警告。
- `smoke-api.mjs`：合成账户登录、401、409、组级合并、重启、完整备份及恢复后原认证通过。
- `browser-smoke.py`：390×844 触控、44px 控件、计划/组输入、离线刷新、重连、Push→Pull、总结、12 组双哑铃配重通过；虚拟通行密钥注册、退出后登录恢复通过，无页面错误。
- Python 语法检查通过。Chromium 模拟不能替代 Safari/Face ID/锁屏实机验收。
- npm 运行依赖审计：API 原有 undici 高危已修复至 7.30.1+；API 与前端运行依赖均 0 已知漏洞，仅代表当前审计范围。
- 首次 CI `40165891087`：测试及镜像构建通过，健康检查被启动瞬间连接重置中断；已改为有限健康等待。
- CI `40166512419` 成功验证启动修复；`40166763597` 因测试依赖文件名写错失败，已修复。
- 最终代码 `a775450` 的 [CI 40167255913](https://github.com/huoweihua312-blip/openGym/actions/runs/40167255913) 全部成功：完整测试、前端生产构建、两个独立镜像、独立容器、401、虚拟通行密钥、手机触控/离线、服务端保存、容器重启后重新登录和恢复记录，最后清理合成容器。

以验收报告和 Actions 实际记录为准，不把“运行中”视为通过。

## 环境与阻塞

- PC Node 22.22.3/npm 10.9.8，无 Docker；使用独立 Linux Actions runner 构建镜像。
- 当前已启动 <http://localhost:8081>，数据仅 `.local-test/`，Web/API 均回环监听，AI 关闭，仅合成数据。
- 已优先检查登录会话，但 fnOS 浏览器标签绑定/创建反复超时；原生应用控制备用入口也因控制权限确认超时不可用。没有提取 Cookie/Token 绕过。
- 既有 SSH 密钥可登录 `<NAS_USER>@<NAS_HOST>`；Docker socket 拒绝，`sudo -n` 需密码，NAS 无 Node。未改组、sudo、防火墙，不索取新密钥。
- NAS 隔离版尚未创建，不阻止本地开发和 CI Docker 测试。
- 正式 NAS 8080 健康接口 ok/writable true；正式 HTTPS 页面 200 且证书验证通过（只读）。生产容器、数据和 Cloudflare 路由未改。
- 测试公网域名/Access 未建立。完整正式路由实时审计受浏览器超时限制，不能标记完成。

## 恢复命令

```powershell
Set-Location C:\Projects\openGym
git status --short
git log -10 --oneline
$env:TZ='Europe/Zurich'
$env:TEMP=Join-Path (Get-Location) 'frontend/.test-tmp'
$env:TMP=$env:TEMP
npm test --prefix frontend -- --maxWorkers=2
npm run build --prefix frontend
node scripts/personal/smoke-api.mjs
# 仅在 8081 没有监听时启动，不重复启动。
node scripts/personal/local-test.mjs
```

新环境按 lockfile 安装依赖，详见部署说明。Windows 使用项目内 TEMP，避免 Vitest 缓存重命名权限错误。先查询最新 Actions 并修复实际失败，再补验收结论。

## 剩余任务

### 本次交付收尾复核

- 不重复开发模块。复核本地/远端 `b1eedd74`，PR 当前提交个人验收 40168777649 成功，未保留可下载镜像产物。
- 原 Tests/API 的生成器缓存版本 27 与页面 28 不一致；已对齐生成器并通过 `build-api-docs.mjs --check`。CLA 因 Fork 缺少签名分支/签署记录仍失败，未代签或禁用。
- NAS 既有 SSH 成功、用户目录可写、Docker 已安装、测试端口空闲，但 Docker socket 仍拒绝、sudo 必须交互。浏览器标签可列出但读取超时。未改权限、正式服务或 Cloudflare。
- 一次性交付脚本 `deploy/personal/nas-handoff.sh` 与合成客户端已准备：固定源码、独立数据/容器、回环端口，完整循环/重启/再登录自动验证，正式容器只读快照对比。本机进程重启演练通过，实际 NAS 尚待一次 sudo 授权。
- iPhone 真实验收清单见 `PERSONAL_IPHONE_ACCEPTANCE.md`；真实机测试全部保持未执行。PC SSH 转发不等于 iPhone 已有 HTTPS 入口。
- DeepSeek 已获一次调用且最多 64 输出 tokens 的授权；当前 0 次调用，未读取或复制正式 Key。独立配置和可用授权会话就绪后才执行。

当前交付脚本只操作 `opengym-dev`，拒绝覆盖现有测试栈或非空状态目录。用户只需一次运行已准备的脚本，不需要提供任何密码给代理或授予永久 Docker 权限。新提交及远端 CI 结果将继续回填。

1. 可用 fnOS Docker 控制入口恢复后再执行 NAS 隔离部署，始终独立端口/数据/认证；当前软件开发与可执行验收已完成。
2. iPhone 实机、真实 DeepSeek 待验证；新增公网访问须先准备 Access 并由用户明确批准。
3. 正式配置完整只读审计及真实数据恢复演练仍待 NAS 可用控制入口，不冒称已完成。
4. 正式发布始终等待批准，未执行 `release.sh`。
