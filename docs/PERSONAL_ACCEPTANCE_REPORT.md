# OpenGym Personal 最终验收报告

公开摘要不包含真实 NAS 地址、账号、目录、认证配置或密钥。详细操作记录与证据仅保存在本机私有交付记录中。

## 当前交付结果

已完成实际 NAS 独立测试部署与局域网浏览器验收。正式 OpenGym 容器、数据和 Cloudflare 配置未被修改。开发分支保持独立，PR 仍为草稿，未合并 main。

| 验收项 | 实际结果 |
|---|---|
| 独立部署 | NAS 从完整固定源码构建独立镜像，使用独立测试容器、网络和持久化目录 |
| 登录与权限 | 真实 NAS 合成账户注册、密码登录、重新登录通过，未认证 401、写入冲突 409 通过 |
| 训练循环 | Push/Pull/Shoulder/Core/Rest 全循环及提前休息拒绝通过 |
| 重启持久化 | 重启测试容器后，原认证、重新登录及训练记录恢复通过 |
| 局域网页面 | 密码注册、计划创建、组记录、刷新恢复、服务端保存、Push→Pull 和器材页通过 |
| 移动布局 | Chromium 390×844 触控模拟通过，无页面异常；不是 iPhone 实机 |
| 正式保护 | 正式容器身份、镜像、运行状态、启动时间、重启计数的前后快照完全一致 |
| Web 修复 | 实际 LAN 发现 HTTP 不支持 randomUUID；回归测试先失败、修复后通过，仅更新测试 Web，测试 API 和数据保留 |
| DeepSeek | 测试站实际显示 AI 关闭，真实调用 0 次，不能标为已接通 |
| iPhone/PWA | 真实 Safari、Face ID、PWA 离线和锁屏提醒均待实机；清单已准备 |

## 代码与自动检查

- 分支：[feature/personal-gym](https://github.com/huoweihua312-blip/openGym/tree/feature/personal-gym)，[草稿 PR #1](https://github.com/huoweihua312-blip/openGym/pull/1)。
- [交付脚本版本 Tests](https://github.com/huoweihua312-blip/openGym/actions/runs/40179834714) 和 [个人验收](https://github.com/huoweihua312-blip/openGym/actions/runs/40179834734) 全部通过，包括镜像、隔离栈、备份恢复及浏览器流程。
- 实际 LAN HTTP 修复的 38 项相关测试及生产构建通过。修复代码提交 `908392fc0830075ef6d8c21fd3820a4882d61962` 的 [Tests](https://github.com/huoweihua312-blip/openGym/actions/runs/40182353337) 已通过，[完整个人验收](https://github.com/huoweihua312-blip/openGym/actions/runs/40182353314) 也已全部通过：前端 5611、API 653、MCP 95，合计 **6359 项全部成功、无失败或跳过**。
- CLA 检查仍未完成：Fork 的签名配置/签署记录问题。未代签、未关闭检查，不声称全部 PR 检查通过。
- 历史 CI 未保留可下载镜像产物。此次实际 NAS 是从完整源码构建，不把历史镜像 ID 当作可拉取地址。

## 仍未完成的真实验收

1. iPhone 实机和可信 HTTPS 前置条件，详见 `PERSONAL_IPHONE_ACCEPTANCE.md`。当前局域网普通 HTTP 不支持 Passkey/PWA，不绕过证书或浏览器保护。
2. 测试管理员及 AI Provider 初始化。合成验收账户只用于自动检查，不作为个人长期账户；没有复制正式账户或密钥。
3. 用户已授权一次 DeepSeek 短调用、最多 64 输出 tokens，但尚未消费。原 Coach 最低输出为 1024 且有重试，不能直接执行普通 Coach 任务来代替该限额测试；需要独立服务端配置和严格一次/64 token 的受控探测。
4. 正式发布、正式数据迁移、正式恢复演练、正式 Cloudflare 配置完整审计均未执行，仍需各自授权或可用入口。

完整训练功能保持原有架构与历史数据兼容。备份、恢复和回滚脚本已准备，但本次没有执行正式发布。AGPL 和第三方许可证声明保留。
