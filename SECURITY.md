# 🔒 安全配置指南

## 概述

本代理服务器内置了多层安全防护机制，以保护您的服务免受恶意攻击。

## 🛡️ 安全威胁与防护

### 1. 未授权访问 → API 密钥验证

**威胁**：任何人都可以访问你的代理服务器，消耗资源或窃取数据。

**防护措施**：
```bash
# 在 Replit Secrets 中设置
API_KEY=your-random-32-char-secret-key-here-abc123xyz
```

**如何使用**：
```bash
curl -X POST https://your-proxy.replit.app/api/search-auto \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-random-32-char-secret-key-here-abc123xyz" \
  -d '{"keyword":"AI","email":"xxx","password":"xxx"}'
```

**生成随机密钥**：
```bash
# Linux/Mac
openssl rand -base64 32

# 或在线生成
# https://www.random.org/strings/
```

---

### 2. 跨域攻击 (CSRF) → 来源白名单

**威胁**：恶意网站通过用户浏览器调用你的 API。

**防护措施**：
```bash
# 只允许飞书域名访问
ALLOWED_ORIGINS=feishu.cn,larksuite.com

# 或指定多个域名
ALLOWED_ORIGINS=feishu.cn,larksuite.com,yourdomain.com
```

**工作原理**：
- 服务器检查请求的 `Origin` 头
- 如果不在白名单中，拒绝请求
- 返回 CORS 错误

---

### 3. 暴力攻击 / DDoS → 速率限制

**威胁**：攻击者短时间内发送大量请求，导致服务器崩溃。

**防护措施**：
- ✅ **默认启用**：每个 IP 限制 10 次/分钟
- 自动清理过期记录
- 返回 `429 Too Many Requests` 状态码

**自定义配置**（修改代码）：
```javascript
const RATE_LIMIT_WINDOW = 60 * 1000; // 时间窗口：1分钟
const RATE_LIMIT_MAX_REQUESTS = 10;  // 最多 10 次请求
```

**响应示例**：
```json
{
  "success": false,
  "error": "请求过于频繁，请在 45 秒后重试",
  "retryAfter": 45
}
```

---

### 4. 资源耗尽攻击 → 请求体大小限制

**威胁**：攻击者发送超大请求体，耗尽服务器内存。

**防护措施**：
- ✅ **默认启用**：限制请求体为 1MB
- 超过限制返回 `413 Payload Too Large`

---

### 5. 凭据泄露 → 不存储敏感信息

**威胁**：账号密码存储在服务器上，被黑客窃取。

**防护措施**：
- ✅ **默认启用**：账号密码仅在请求中传递
- 不写入日志
- 不存储在环境变量
- 不保存到数据库

---

## 📊 监控与日志

### 请求日志

服务器会记录所有请求，便于监控异常行为：

```
📥 [14:30:25] POST /api/search-auto - IP: 123.45.67.89
✅ [14:30:28] POST /api/search-auto - 200 (3245ms)

⚠️ API 密钥验证失败: 123.45.67.89
⚠️ 速率限制触发: 123.45.67.89 (11 次请求)
```

### 如何查看日志

**Replit**：
1. 打开你的 Repl
2. 点击右侧 "Console" 标签
3. 实时查看日志输出

**云服务器**：
```bash
# 使用 PM2
pm2 logs proxy-server

# 或直接查看输出
tail -f /var/log/proxy-server.log
```

---

## ✅ 安全检查清单

部署前请确认：

- [ ] ✅ 已设置 `API_KEY`（至少 32 位随机字符串）
- [ ] ✅ 已配置 `ALLOWED_ORIGINS`（只允许飞书域名）
- [ ] ✅ 速率限制已启用（默认）
- [ ] ✅ 请求日志已启用（默认）
- [ ] ✅ 在 FaaS 代码中正确传递 API_KEY
- [ ] ✅ 定期检查日志，发现异常访问

---

## 🚨 发现攻击怎么办？

### 1. 立即更换 API_KEY
```bash
# 在 Replit Secrets 中更新
API_KEY=new-random-key-here
```

### 2. 检查日志，找出攻击来源
```
⚠️ 速率限制触发: 123.45.67.89 (11 次请求)
```

### 3. 加强白名单限制
```bash
# 只允许特定子域名
ALLOWED_ORIGINS=your-specific-subdomain.feishu.cn
```

### 4. 降低速率限制
```javascript
const RATE_LIMIT_MAX_REQUESTS = 5;  // 改为 5 次/分钟
```

---

## 🔐 最佳实践

1. **定期轮换 API_KEY**（每月一次）
2. **监控日志**（每周检查一次）
3. **限制来源**（只允许必要的域名）
4. **使用 HTTPS**（Replit 默认提供）
5. **不要在代码中硬编码密钥**（使用环境变量）

---

## 📞 需要帮助？

如果发现安全问题或需要更强的防护，请：
1. 查看日志找出问题根源
2. 调整安全配置参数
3. 考虑升级到付费云服务（更好的 DDoS 防护）

**记住**：安全是一个持续的过程，不是一次性的配置！🛡️
