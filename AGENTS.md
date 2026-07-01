# AGENTS.md

## 项目说明

这是一个智慧配送解决方案，包含 Android App、Web 后台、NestJS API、PostgreSQL、Redis 和 FRP 部署模板。

## 工作方式

Codex 通过 SSH 连接 Ubuntu 开发机进行开发。项目代码保存在 GitHub 仓库中。

## 技术栈

- Mobile: React Native
- Web Admin: Next.js / React
- API: NestJS
- Database: PostgreSQL
- Cache: Redis
- Language: TypeScript
- Deployment: Docker Compose

## 重要规则

1. 不要提交真实 `.env` 文件。
2. 不要提交 `.env.production`。
3. 不要提交 frp token、数据库密码、JWT_SECRET、高德 Key。
4. 不要提交 SSH 密钥、keystore、证书文件。
5. 所有敏感配置必须通过环境变量读取。
6. PostgreSQL 和 Redis 只允许本地访问，不允许通过 FRP 暴露到公网。
7. Web 后台初始管理员密码必须在首次使用时设置。
8. 进价查看安全密码必须在首次使用时设置。
9. 系统只保存密码 hash，不保存明文密码。
10. 初始化完成后必须关闭首次初始化入口。
11. 订单明细必须保存商品名称、售价、数量等快照。
12. App 开单时不能显示商品进价。
13. 查看商品进价必须有权限，并通过安全密码验证。
14. 重要操作必须写入审计日志。
15. 项目必须支持后期迁移部署。

## 当前阶段要求

当前阶段只允许搭建项目骨架、基础配置、健康检查接口、Docker Compose 和初始化页面占位。

不要一次性实现完整业务。
