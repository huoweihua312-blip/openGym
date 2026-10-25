# OpenGym Personal 验收报告

> 公开版：主机、账号、域名和正式目录均为占位示例，不能直接当作真实配置。实际环境记录仅在本机私有备份保留；正式脚本仍须按实际路径进行审批前核对。

日期：2026-10-25。开发分支：[`feature/personal-gym`](https://github.com/huoweihua312-blip/openGym/tree/feature/personal-gym)。未修改 main，未强推，未正式部署。

## 功能与实现位置

| 功能 | 结果与主要文件 |
|---|---|
| 实际完成驱动三练一休 | `api/personal/cycle.js`：必做正式组校验、事件父链、并发唯一推进、显式自然休息日、纠正历史 |
| 训练草稿 | `frontend/src/lib/personal-session.js`：精确个人模板、活动快照、取消恢复、左右侧、热身分开、原 workouts 兼容格式 |
| 同步 | 原 `sync-merge.js`/`sync-stamps.js` 扩展逐组和逐事件合并，保留原 Rotation；真正的 409 写冲突已验 |
| 器材 | `api/personal/personal-equipment.js`：双哑铃库存 12 组、单只 45 组合法对称组合，杆重未知，保留 14.7/17.3 实测矛盾提示 |
| 进阶 | `personal-progression.js`：双重渐进、RIR/质量、实际记录证据、15% 跨度限制、连续下降提示、采用/忽略留痕 |
| 手机界面 | `Personal.jsx`/`personal.css`：当前动作、触控输入、历史成绩、进度、倒计时、总结、计划/器材/进阶；个人模式可关闭 |
| AI | 原 Provider/Coach/MCP；`coach-context.js` 白名单和 `coach-policy.js` 确认修改白名单，不新增模型网关 |
| 运维 | `scripts/personal/`：真实 API、浏览器验收、备份/验证/恢复、独立部署、正式发布及回滚；`deploy/personal/compose.yml` 完整源码独立构建 |

## 自动化证据

| 检查 | 实际结果 |
|---|---|
| PC 完整前端 | 452 文件，5,597 成功、11 跳过、0 失败 |
| 最后 AI 处方变更的相关测试 | 5 文件、167 成功，包含原 Coach 和新增权限/快照/证据测试 |
| PC API（依赖升级后） | 653 项，650 成功、3 平台相关跳过、0 失败 |
| PC MCP | 94 成功、1 跳过、0 失败；Windows watch 错误已修复 |
| 前端生产构建 | 成功；上游已有动态导入与大包提示保留 |
| 真实 API | 合成账户登录、未登录 401、并发 409、不同组不丢、重启持久化全部成功 |
| 恢复演练 | 完整私有状态备份、散列清单、隔离恢复，恢复后原认证和两组训练数据均成功 |
| 本机浏览器 | Chromium 390×844 touch，44px 控件，无横向溢出/页面异常；计划、RIR/质量、热身/正式组、离线刷新/重连、Push→Pull、总结与器材成功 |
| 通行密钥 | 新合成账户虚拟认证器注册，清除本次测试浏览器登录状态后重新登录，服务端计划/记录恢复成功 |
| 依赖审计 | 前端/API 运行依赖 0 已知漏洞；原 undici 高危已升级修复，不代表完整系统扫描 |
| Linux 独立 Docker | [CI 40166512419](https://github.com/huoweihua312-blip/openGym/actions/runs/40166512419) 全部成功：Linux 测试、镜像构建、独立启动、401、容器重启后健康 |
| 最终代码 Linux / Docker 浏览器 | [CI 40167255913](https://github.com/huoweihua312-blip/openGym/actions/runs/40167255913) 全部成功，代码提交 `a7754500ad1a5ba1cf2e48eebb9a2c3b65f9a912` |

最终 Linux 结果：前端 452 文件/5,610 项、API 653 项、MCP 95 项，合计 **6,358 项全部成功，无失败或跳过**。Docker 浏览器验收还验证虚拟 Passkey 注册、离线刷新/重连、真实服务端保存、重启两项容器、清除本次测试浏览器登录状态后重新登录并恢复到 Pull。`virtualPasskeyRegistrationAndLogin`、`dockerRestart` 均 true，页面错误为空。

最终镜像构建记录：API `sha256:f9b5ce65e8558a2bda3e8f7d789f9fc3daf6adf6dfb121b53b388c9b7881cf9b`；Web `sha256:c35f09f3520b7ea5e18e526d23b4286b341f6f25564f16331740ebe4462bdd44`。这些是 CI 构建时镜像 ID，不是可供 NAS 直接拉取的 Registry 地址；尚未推送镜像仓库。

初次 CI 因连接刚发布但 Nginx 尚未就绪的连接重置退出；已修复有限健康等待，成功运行证实。随后浏览器验收引用错依赖文件名，已修正并重新完整通过。没有忽略健康或测试错误。

## 可用测试环境

- PC：<http://localhost:8081>，独立 Node API + 前端生产构建，本机回环地址，数据 `.local-test/`。当前进程结束后用 `node scripts/personal/local-test.mjs` 重启。
- Linux：Actions runner 内实际建立 `opengym-dev-api-1`/`opengym-dev-web-1`，镜像 `opengym-personal-api:dev`/`opengym-personal-web:dev`，独立网络/数据，未发布公网；验收结束自动移除合成容器。镜像未上传公开 Registry。
- NAS：尚未部署。已登录 fnOS 标签可列出，但绑定/读取反复超时；备用原生窗口控制权限确认也超时。当前 SSH 用户无 Docker 权限，且无 Node。未提升用户组或降低 sudo 限制。
- 正式：局域网 API 健康，HTTPS 200 和证书验证成功。未停止容器、未写数据、未变更 Tunnel/DNS/Access。

## 当前限制

1. iPhone Safari/PWA、Face ID、锁屏/通知和真实手机后台行为未实机验证。Chromium 不是 WebKit。
2. 真实 DeepSeek 未调用；未读取/使用用户 Key，不产生模型费用。兼容 Provider、白名单和合成契约测试通过，真实模型与配置仍需验证。
3. 新公网测试路由和 Access 未创建；正式 Cloudflare/NAS 配置完整审计因页面访问受阻未完成，不能声称已安全核查全部配置。
4. AI 可确认微调组数、次数、排序、名称；增删动作/训练日、改变算法/周排程和替换整套个人模板受限，需原界面人工复核。不会修改历史或替用户确认训练/休息。
5. 器材档案当前使用结构化 JSON 编辑器，可验证保存，但不是完整表单式器材编辑；选择器材、重量和组合展示可直接使用。快调器材仅保留数据接口。
6. 原约 3kg 侧平举未伪造校准数据；每次建议只使用真实已知重量。补录采用实际日期，纠正进度留原因，历史训练保留。
7. 正式挂载和跨文件备份需要停写窗口，脚本有明确授权开关，但未在正式 NAS 执行。正式恢复/回滚不算已演练通过。

## 发布与维护

完整步骤见 `PERSONAL_DEPLOYMENT.md`，审计边界见 `PERSONAL_SECURITY_REVIEW.md`，逐项验收见 `ACCEPTANCE_CHECKLIST.md`。发布脚本必须用户明确批准；实际 NAS 目录/Compose 名称与挂载必须在发布前复核。保留旧镜像，故障只回退镜像；真实数据恢复另行批准。

以后更新先取 upstream 变更，合并到开发分支，在合成数据和独立栈完成相同验收后再申请发布。当前 Git 是原基线的已验证浅历史；网络正常后可补全上游历史，保留原提交关系。所有新增模块集中在 personal 目录，原数据格式和功能保留，降低上游合并成本。
