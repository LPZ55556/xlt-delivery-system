# 智慧配送解决方案

本项目是一套面向货物配送商的配送开单管理系统。

系统包含：

- Android App
- Web 管理后台
- NestJS 后端 API
- PostgreSQL 数据库
- Redis 缓存
- FRP 本地服务器穿透部署方案

## 设备分工

- Windows 控制机：只负责远程控制、Codex、SSH、浏览器访问
- Ubuntu 开发机：Codex 通过 SSH 连接并进行开发
- Ubuntu 服务端：后期用于运行 API、Web 后台、PostgreSQL、Redis、frpc
- 阿里云 ECS：只运行 frps，不部署业务服务

## 开发要求

请先阅读：

- docs/codex-prompt.md
- docs/prepare-checklist.txt
- .env.example
- deploy/frpc.example.toml

真实密码、token、Key、.env.production 不允许提交到仓库。
