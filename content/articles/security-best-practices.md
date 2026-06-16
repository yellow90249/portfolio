---
title: "資訊安全實踐"
description: 整理日常開發中常用的資安觀念與實踐方式。
date: 2025-12-05
image: /images/security.jpg
minRead: 8
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 身份驗證與授權

### 使用 JWT 的注意事項

JWT（JSON Web Token）是常見的無狀態驗證方案，但實作細節很容易踩坑。

```ts
// ❌ 錯誤：演算法設為 none，任何人都能偽造 token
jwt.verify(token, secret, { algorithms: ['none'] })

// ✅ 正確：明確指定演算法
jwt.verify(token, secret, { algorithms: ['HS256'] })
```

**常見錯誤：**
- 將 JWT 存在 `localStorage`，容易被 XSS 竊取，應改用 `httpOnly` Cookie
- Token 有效期設太長，應配合 Refresh Token 機制縮短 Access Token 壽命
- 沒有實作 Token 撤銷機制，登出後 token 仍然有效

### 最小權限原則（Principle of Least Privilege）

每個用戶、服務、資料庫帳號只給完成任務所需的最小權限。

```sql
-- ❌ 給 API 帳號完整資料庫權限
GRANT ALL PRIVILEGES ON *.* TO 'api_user'@'%';

-- ✅ 只給必要的讀寫權限
GRANT SELECT, INSERT, UPDATE ON app_db.orders TO 'api_user'@'localhost';
```

---

## 輸入驗證與防注入

### SQL Injection

永遠不要用字串拼接組 SQL 查詢。

```ts
// ❌ 危險：攻擊者輸入 ' OR '1'='1 即可繞過驗證
const query = `SELECT * FROM users WHERE email = '${email}'`

// ✅ 使用參數化查詢
const query = 'SELECT * FROM users WHERE email = $1'
await db.query(query, [email])
```

### XSS（Cross-Site Scripting）

對所有用戶輸入進行跳脫處理，避免注入惡意腳本。

```ts
import DOMPurify from 'dompurify'

// ✅ 渲染用戶輸入的 HTML 前先清理
const clean = DOMPurify.sanitize(userInput)
```

**HTTP Header 防護：**
```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

### 環境變數管理

```bash
# ❌ 絕對不能 commit 進 git
DB_PASSWORD=mysecretpassword
JWT_SECRET=abc123

# ✅ 用 .env 並加入 .gitignore
echo ".env" >> .gitignore
```

---

## HTTPS 與資料傳輸

所有生產環境流量必須走 HTTPS，並確保 TLS 設定正確。

```nginx
server {
    listen 443 ssl;
    ssl_protocols TLSv1.2 TLSv1.3;   # 停用舊版 TLS
    ssl_ciphers HIGH:!aNULL:!MD5;

    # HSTS：強制瀏覽器只走 HTTPS
    add_header Strict-Transport-Security "max-age=31536000" always;
}
```

---

## 依賴管理

第三方套件是常見的攻擊入口，需要定期審查。

```bash
# 掃描已知漏洞
npm audit

# 自動修復低風險漏洞
npm audit fix
```

**最佳實踐：**
- 鎖定套件版本（`package-lock.json` 要 commit）
- 定期更新依賴，訂閱安全通報（如 GitHub Dependabot）
- 不引入不必要的套件，減少攻擊面

---

## API 安全

### Rate Limiting

防止暴力破解與 DDoS。

```ts
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 10,                   // 最多 10 次嘗試
  message: '嘗試次數過多，請稍後再試'
})

app.post('/auth/login', loginLimiter, loginHandler)
```

### CORS 設定

不要用 `*` 允許所有來源。

```ts
// ❌ 允許所有來源
app.use(cors({ origin: '*' }))

// ✅ 明確指定允許的來源
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true
}))
```

---

## 基礎設施安全

### Kubernetes / GKE

```yaml
# ✅ 不以 root 身份執行容器
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true

# ✅ 限制資源，防止單一 Pod 吃光資源
resources:
  limits:
    cpu: "500m"
    memory: "256Mi"
```

### Secret 管理

不要把 secret 直接寫在 YAML 裡。

```bash
# ✅ 使用 Kubernetes Secret
kubectl create secret generic db-secret \
  --from-literal=password=mysecretpassword

# 或使用 Google Secret Manager / AWS Secrets Manager
```

---

## 日誌與監控

記錄足夠的資訊幫助事後調查，但避免記錄敏感資料。

```ts
// ❌ 日誌包含密碼
logger.info(`Login attempt: ${email} / ${password}`)

// ✅ 只記錄必要資訊
logger.info(`Login attempt: ${email}`, { ip: req.ip, userAgent: req.headers['user-agent'] })
```

**應該監控的指標：**
- 異常登入失敗次數
- 非預期的 API 錯誤率上升
- 非工作時間的大量資料存取

---

## 安全開發流程（DevSecOps）

| 階段 | 實踐 |
|------|------|
| 開發 | Code Review、靜態分析（ESLint security rules） |
| CI/CD | 自動化掃描（`npm audit`、`trivy` 掃 Docker image） |
| 部署 | 最小權限、Secret Manager、網路隔離 |
| 運營 | 日誌監控、定期滲透測試、漏洞回報機制 |

資安不是一次性的工作，而是需要在整個開發流程中持續落實的文化。
