# 部署规范 · mplusm.site

所有新项目统一通过 `deploy/deploy.py` 发布到腾讯云 CVM (43.133.145.77)。

---

## 快速开始

### 第一次部署新项目

```bash
# 1. 复制配置模板
cp deploy/project.conf.example deploy/project.conf

# 2. 编辑配置（改域名、端口、构建命令等）
vim deploy/project.conf

# 3. 设置环境变量（敏感信息不写进 conf 文件）
export SERVER_PASS="..."
export TENCENT_SECRET_ID="..."     # DNS 自动配置用（可选）
export TENCENT_SECRET_KEY="..."
export YOUR_API_KEY="..."          # 项目自身的 API Key

# 4. 一键部署
python3 deploy/deploy.py --config deploy/project.conf
```

### 更新已有项目（代码有改动）

```bash
export SERVER_PASS="..."
python3 deploy/deploy.py --config deploy/project.conf
```

脚本会自动：重新构建前端 → 上传文件 → 重启后端进程 → 重载 Nginx。

---

## 配置文件说明

配置文件模板：`deploy/project.conf.example`

| 字段 | 说明 | 示例 |
|------|------|------|
| `PROJECT_NAME` | 项目英文名，用于 PM2 进程名和 /opt/ 目录 | `zentalk` |
| `DOMAIN` | 完整二级域名 | `zen.mplusm.site` |
| `FRONTEND_TYPE` | `static` / `node` / `none` | `static` |
| `FRONTEND_BUILD_CMD` | 本地构建命令 | `cd frontend && npm ci && npm run build` |
| `FRONTEND_BUILD_DIR` | 构建产物目录（相对项目根） | `frontend/dist` |
| `BACKEND_TYPE` | `python` / `node` / `none` | `python` |
| `BACKEND_PORT` | 后端监听端口（Nginx 反代） | `8765` |
| `BACKEND_START_CMD` | PM2 启动命令 | `python3 -m uvicorn main:app ...` |
| `BACKEND_INSTALL_CMD` | 服务器端依赖安装命令 | `pip3 install -r ...` |
| `ENV_VARS` | 后端运行时环境变量（支持 `${VAR}` 引用 shell 变量） | 见模板 |
| `API_PREFIX` | API 路径前缀 | `/api` |

---

## 服务器信息

| 项目 | 值 |
|------|----|
| 系统 | OpenCloudOS 9.4 (RHEL 系) |
| 面板 | aaPanel（宝塔） |
| Nginx | 1.28 · 配置目录 `/www/server/panel/vhost/nginx/` |
| Web 根目录 | `/www/wwwroot/{domain}/` |
| 应用目录 | `/opt/{project_name}/` |
| 进程管理 | PM2 (Node 20) |
| SSL | Let's Encrypt certbot（自动续期，每天 03:00 检查） |
| DNS | 腾讯云 DNSPod，通过 API 自动配置 |

### 已占用端口（勿冲突）

| 端口 | 项目 |
|------|------|
| 3456 | app.mplusm.site (mmsite) |
| 8765 | zen.mplusm.site (zentalk) |

**新项目分配端口建议：** 8766, 8767, 8768 ...

---

## 目录约定

新项目建议遵循以下目录结构：

```
my-project/
├── backend/               # 后端代码
│   ├── main.py            # 入口（Python）或 server.js（Node）
│   └── requirements.txt   # 或 package.json
├── frontend/              # 前端代码
│   ├── src/
│   ├── package.json
│   └── vite.config.js     # 或 next.config.js
├── deploy/
│   └── project.conf       # 本项目的部署配置
├── .env.example           # 环境变量说明（不含真实值）
└── DEPLOYMENT.md          # 本文档（可复用）
```

---

## 支持的项目类型

### 类型 A：React/Vue 静态前端 + Python 后端（如 ZenTalk）

```conf
FRONTEND_TYPE="static"
BACKEND_TYPE="python"
API_PREFIX="/api"
```

Nginx 行为：`/*` → 静态文件，`/api/*` → 后端代理。

### 类型 B：纯静态网站（无后端）

```conf
FRONTEND_TYPE="static"
BACKEND_TYPE="none"
```

### 类型 C：Node.js 全栈（Next.js / Express）

```conf
FRONTEND_TYPE="none"
BACKEND_TYPE="node"
BACKEND_START_CMD="node server.js"
API_PREFIX=""
```

Nginx 整站代理到后端端口。

### 类型 D：纯 API 服务（Python FastAPI / Flask）

```conf
FRONTEND_TYPE="none"
BACKEND_TYPE="python"
API_PREFIX=""
```

---

## 手动操作参考

### 查看后端日志

```bash
# SSH 进服务器
pm2 logs zentalk-backend --lines 50
pm2 logs zentalk-backend --follow
```

### 重启后端

```bash
pm2 restart zentalk-backend
```

### 手动续签 SSL

```bash
certbot renew --dry-run
```

### Nginx 操作

```bash
/www/server/nginx/sbin/nginx -t        # 测试配置
/www/server/nginx/sbin/nginx -s reload # 重载
```

---

## 常见问题

| 现象 | 排查方向 |
|------|---------|
| 前端访问 502 | `pm2 list` 检查后端状态；`pm2 logs` 看错误 |
| API 返回 403/500 | 检查 `.env` 里的 API Key 和模型名是否正确 |
| SSL 证书申请失败 | DNS 未生效（等 1-2 分钟）；80 端口被占用 |
| 部署后页面未更新 | 浏览器强制刷新（Ctrl+Shift+R）；检查前端是否重新构建 |
| PM2 进程反复重启 | `pm2 logs` 看启动报错；通常是端口冲突或依赖缺失 |
