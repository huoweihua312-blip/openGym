# OpenGym Personal 开发进度

更新：2026-10-25。目标：个人家庭增肌、NAS 自托管和 iPhone 使用。

## 状态

- Phase 0：已检查 Fork/main 与 upstream/main，同一 SHA `7a3ace5`；React 19/Vite 8/Zustand，Node API，JSON 持久化，原 Rotation/AI Coach/同步可复用。
- Phase 1：独立分支 `feature/personal-gym`，完整源码已落地并验证 Git 对象；前端锁定依赖安装完成，API 安装进行中。
- Phase 2–9：进行中，逐项以验收表为准。

## 环境和限制

- 本机 Node v22.22.3、npm 10.9.8；无 Docker CLI/daemon。
- Git CLI 的 GitHub 登录失效，github.com 连接失败；GitHub connector 已验证 Fork push/admin 权限，codeload/API 可用，不导出凭据。
- 浏览器列出了已登录 fnOS/Cloudflare/阿里云，但绑定 fnOS 页面读取超时。没有通过读取会话密钥绕过。
- 已有 SSH 密钥可登录 `qq31288@192.168.5.20`；Docker socket 无权限，`sudo -n` 要求密码。未改变用户组/sudo/防火墙。
- NAS 8081 未监听。没有创建公网路由。正式容器、数据和 Tunnel 保持未修改。

## 提交与测试

基线：`7a3ace53c5e910c2185f22df803726c5838a99ae`。后续提交及测试输出将在这里补充。

## 恢复

```powershell
Set-Location C:\Users\Administrator\Documents\Codex\2026-10-22\new-chat\openGym
git status --short
git log -8 --oneline
cd frontend
npm test
npm run build
```

无真实凭据、不使用正式训练数据。未执行正式发布脚本。
