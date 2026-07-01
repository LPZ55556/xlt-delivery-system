# 部署说明

## 一、整体设备分工

本项目采用四台设备分工：

1. Windows 控制机
2. Ubuntu 开发机
3. Ubuntu 服务端
4. 阿里云穿透端

---

## 二、Windows 控制机

Windows 控制机只作为远程控制入口使用。

用途：

- 打开 Codex
- SSH 连接 Ubuntu 开发机
- SSH 连接 Ubuntu 服务端
- 访问 GitHub
- 访问 Web 后台
- 查看部署状态

Windows 本地不保存项目代码，不运行数据库，不运行后端服务。

---

## 三、Ubuntu 开发机

Ubuntu 开发机用于开发。

开发机 IP：

```text
192.168.31.129
```

用途：

- 保存项目源码
- Codex 通过 SSH 连接进行开发
- 安装项目依赖
- 运行测试
- 构建 Android App
- 本地调试 API 和 Web 后台

开发机不作为正式业务运行服务器。

---

## 四、Ubuntu 服务端

Ubuntu 服务端用于后期部署运行系统。

用途：

- 运行 NestJS API
- 运行 Web 后台
- 运行 PostgreSQL
- 运行 Redis
- 运行 frpc
- 保存业务数据
- 执行数据库备份

当前阶段暂不操作 Ubuntu 服务端，等项目骨架和 Docker Compose 文件完成后再部署。

---

## 五、阿里云穿透端

阿里云 ECS 只作为 FRP 服务端使用。

用途：

- 运行 frps
- 提供公网入口
- 不部署业务代码
- 不部署数据库
- 不部署 Redis
- 不部署 Web 后台

frps 信息：

```text
frps 公网地址：42.121.105.101
frps 通信端口：7000
frps HTTP vhost 端口：8080
HTTPS：开发验证阶段暂不启用
dashboard：仅阿里云本机可访问，不开放公网
```

---

## 六、域名与访问地址

主域名：

```text
lnize.top
```

API 域名：

```text
api.lnize.top
```

Web 后台域名：

```text
admin.lnize.top
```

开发验证阶段访问地址：

```text
API：http://api.lnize.top:8080
Web 后台：http://admin.lnize.top:8080
```

DNS 解析：

```text
api.lnize.top    → 阿里云 ECS 公网 IP
admin.lnize.top  → 阿里云 ECS 公网 IP
```

---

## 七、端口规划

Ubuntu 服务端本地端口：

```text
后端 API：3000
Web 后台：3001
PostgreSQL：5432
Redis：6379
```

阿里云 frps 端口：

```text
frps 通信端口：7000
HTTP vhost 访问端口：8080
```

公网访问对应关系：

```text
http://api.lnize.top:8080
→ 阿里云 frps
→ Ubuntu 服务端 frpc
→ 127.0.0.1:3000
→ NestJS API
```

```text
http://admin.lnize.top:8080
→ 阿里云 frps
→ Ubuntu 服务端 frpc
→ 127.0.0.1:3001
→ Web 后台
```

PostgreSQL 和 Redis 只允许本地访问，不允许穿透到公网。

---

## 八、部署方式

项目后期使用 Docker Compose 部署。

Ubuntu 服务端应运行：

- api
- web-admin
- postgres
- redis
- frpc

项目需要提供：

```text
docker-compose.dev.yml
docker-compose.prod.yml
.env.example
deploy/frpc.example.toml
数据库备份脚本
数据库恢复脚本
```

---

## 九、环境变量要求

真实配置不得提交到 GitHub。

允许提交：

```text
.env.example
frpc.example.toml
README.md
部署说明文档
```

禁止提交：

```text
.env
.env.local
.env.production
frpc.toml
frps.toml
数据库密码
frp token
JWT_SECRET
高德 Key
SSH 密钥
Android 签名证书
数据库备份文件
```

所有敏感信息必须通过环境变量读取。

---

## 十、首次初始化要求

Web 后台初次启动时，如果系统中不存在管理员账号，必须进入首次初始化流程。

首次初始化需要设置：

1. 管理员账号
2. 管理员密码
3. 进价查看安全密码

要求：

- 密码只保存 hash
- 不保存明文密码
- 初始化完成后关闭首次初始化入口
- 后续不能重复初始化
- 进价查看密码只能由有权限的管理员修改

---

## 十一、安全要求

1. App 开单时不能显示商品进价。
2. 查看商品进价必须具备权限。
3. 查看商品进价必须输入安全密码。
4. 进价查看操作必须写入审计日志。
5. 订单修改、订单作废、删除数据等重要操作必须写入审计日志。
6. PostgreSQL 不允许开放公网。
7. Redis 不允许开放公网。
8. frps dashboard 不允许开放公网。
9. 所有 API 必须有登录认证。
10. 所有敏感配置必须通过环境变量读取。

---

## 十二、迁移要求

项目必须支持后期迁移到其他设备。

迁移时应只需要：

1. 新设备安装 Ubuntu
2. 安装 Docker 和 Docker Compose
3. 克隆 GitHub 仓库
4. 复制 `.env.production`
5. 恢复 PostgreSQL 数据库备份
6. 启动 Docker Compose
7. 启动 frpc
8. 确认 API 和 Web 后台访问正常

项目代码中不得写死服务器 IP、frp token、数据库密码、JWT_SECRET、高德 Key。
