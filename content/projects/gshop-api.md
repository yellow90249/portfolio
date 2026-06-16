---
title: gshop-api
description: 使用 Node.js/Express 建構 REST API，部署於 GKE Autopilot，並透過 GitHub Actions 實現自動化 CI/CD。
date: 2026-06-15
image: /projects/api.jpg
tags: ["Node.js", "GKE", "Kubernetes", "CI/CD", "PostgreSQL"]
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 架構概覽

gshop-api 是整個電商系統的後端核心，負責處理商品、訂單、會員認證等 API 請求。

- **Runtime**：Node.js / Express
- **Port**：3001
- **資料庫**：Supabase PostgreSQL（透過 Session Pooler 連線）
- **部署環境**：GKE Autopilot，asia-east1
- **Image Registry**：Google Artifact Registry

## 部署架構

```
GitHub (main) → GitHub Actions → docker build → Artifact Registry
                                                      ↓
                                              GKE pull image
                                                      ↓
                                         kubectl rollout restart
```

流量路徑：

```
Cloudflare → GCP Load Balancer → Ingress → gshop-api Pod
```

## 遇到的問題與解法

### 1. Supabase 連線失敗（ENOTFOUND）

**問題**：部署後 API 無法連線到 Supabase，log 顯示 `ENOTFOUND`。

**原因**：Supabase 直連位址 `db.xxx.supabase.co:5432` 僅支援 IPv6，而 GKE Autopilot 的節點只有 IPv4。本地 Mac 可以直連是因為 Mac 同時支援 IPv4 與 IPv6。

**解法**：改用 Supabase Session Pooler connection string，走 IPv4：

```
postgresql://postgres.xxx:PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

更新 K8s Secret：

```bash
NEW_URL="postgresql://..."
kubectl patch secret gshop-api-secret \
  -p "{\"data\":{\"DATABASE_URL\":\"$(echo -n $NEW_URL | base64)\"}}"
kubectl rollout restart deployment/gshop-api
```

---

### 2. 502 Bad Gateway — 健康檢查失敗

**問題**：服務部署完成，但 GCP Load Balancer 回傳 502。

**原因**：GCP Load Balancer 預設對 `GET /` 做健康檢查，但 gshop-api 沒有 `/` 路由，回傳非 200，LB 判定為不健康，停止轉發流量。

**解法**：建立 `BackendConfig`，將健康檢查路徑改為 `/health`：

```yaml
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: gshop-api-backend-config
spec:
  healthCheck:
    requestPath: /health
    type: HTTP
```

並在 Service 加上 annotation：

```yaml
cloud.google.com/backend-config: '{"default": "gshop-api-backend-config"}'
```

---

### 3. ImagePullBackOff — GKE 無法拉取 Image

**問題**：Pod 啟動失敗，狀態顯示 `ImagePullBackOff`。

**原因**：GKE 的 Service Account 沒有 Artifact Registry 的讀取權限。

**解法**：

```bash
gcloud projects add-iam-policy-binding gshop-497319 \
  --member="serviceAccount:620172615694-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

## CI/CD 設定

每次 push 到 main，GitHub Actions 自動執行：

```yaml
- uses: google-github-actions/auth@v2
  with:
    credentials_json: ${{ secrets.GCP_SA_KEY }}

- name: Build and push image
  run: |
    docker build -t asia-east1-docker.pkg.dev/gshop-497319/gshop/api:latest .
    docker push asia-east1-docker.pkg.dev/gshop-497319/gshop/api:latest

- uses: google-github-actions/get-gke-credentials@v2
  with:
    cluster_name: gshop-cluster
    location: asia-east1

- run: kubectl rollout restart deployment/gshop-api
```

GitHub Actions runner 是 ubuntu amd64，build 出的 image 天生就是 amd64，不需要 Cloud Build。
