# Scienceing 代理服务器

> 使用 Puppeteer 无头浏览器绕过 RSA 签名限制

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（推荐）

创建 `.env` 文件：

```bash
PORT=3000

# 🔒 安全配置（强烈推荐）
API_KEY=your-secret-key-here-min-32-chars
ALLOWED_ORIGINS=feishu.cn,larksuite.com

# 说明：
# - API_KEY: API 访问密钥，建议至少 32 位随机字符串
# - ALLOWED_ORIGINS: 允许访问的域名白名单，多个域名用逗号分隔
```

**💡 重要提示**：
- ✅ 账号密码通过 API 请求传入，不存储在服务器
- ✅ 建议设置 API_KEY 防止未授权访问
- ✅ 建议配置 ALLOWED_ORIGINS 限制来源域名
- ✅ 已内置速率限制：10 次/分钟（防止暴力攻击）

### 3. 启动服务器

```bash
npm start
```

## API 文档

### POST /api/search-auto

一键登录并搜索（推荐）

**请求**:
```json
{
  "keyword": "人工智能",
  "email": "your-email@example.com",
  "password": "your-password",
  "timeRange": "one_month",
  "pageSize": 20
}
```

**说明**：
- `email` 和 `password` 通过请求体传入，不会存储在服务器上
- 每次请求都会检查账号，如果切换账号会自动重新登录

**响应**:
```json
{
  "success": true,
  "data": {
    "articles": [...],
    "totalCount": 7577,
    "keyword": "人工智能",
    "searchTime": "2025-10-03T15:50:00.000Z"
  }
}
```

## 🔒 安全特性

本代理服务器内置多层安全防护：

| 安全措施 | 说明 | 状态 |
|---------|------|------|
| **API 密钥验证** | 通过 `X-API-Key` 头验证请求 | ✅ 可配置 |
| **来源白名单** | 限制允许访问的域名（CORS） | ✅ 可配置 |
| **速率限制** | 每个 IP 限制 10 次/分钟 | ✅ 默认启用 |
| **请求日志** | 记录所有请求，便于监控 | ✅ 默认启用 |
| **请求体大小限制** | 限制为 1MB，防止 DoS 攻击 | ✅ 默认启用 |
| **凭据不存储** | 账号密码仅在请求中传递 | ✅ 默认启用 |

### 使用建议：
1. **必须设置 API_KEY**：在 Replit Secrets 中配置
2. **必须配置 ALLOWED_ORIGINS**：只允许你的飞书域名
3. **监控日志**：定期检查 Replit 控制台日志，发现异常访问

## 部署

### Replit（免费）

1. 访问 https://replit.com/
2. 导入 GitHub 仓库：`doctorcotton/scienceing-proxy`
3. 在 Secrets 中配置：
   - `API_KEY`: 随机生成 32 位字符串
   - `ALLOWED_ORIGINS`: `feishu.cn,larksuite.com`
4. 点击 Run

### 阿里云/腾讯云

```bash
# 上传代码
scp -r proxy-server root@your-server-ip:/opt/

# SSH 连接
ssh root@your-server-ip

# 安装依赖并启动
cd /opt/proxy-server
npm install
pm2 start proxy-server.js
```
