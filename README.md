# Scienceing 代理服务器

> 使用 Puppeteer 无头浏览器绕过 RSA 签名限制

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（可选）

创建 `.env` 文件：

```bash
PORT=3000
SCIENCEING_EMAIL=zhudi@yuanqisenlin.com
SCIENCEING_PASSWORD=401027
API_KEY=your-secret-key-here
```

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
  "email": "zhudi@yuanqisenlin.com",
  "password": "401027",
  "timeRange": "one_month",
  "pageSize": 20
}
```

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

## 部署

### Replit（免费）

1. 访问 https://replit.com/
2. 创建新 Repl（Node.js）
3. 复制代码
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
