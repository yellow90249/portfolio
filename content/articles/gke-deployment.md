---
title: "GKE 部署"
description: 記錄將三個服務（Node.js API、兩個 Nuxt SSR）部署到 GKE Autopilot 的完整流程，包含 arm64/amd64、ImagePullBackOff、502 健康檢查、Supabase IPv6 等踩坑解法。
date: 2026-06-14
image: /images/gke.jpg
minRead: 5
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 架構

- **gshop-api** — Node.js/Express，Port 3001
- **gshop-dashboard** — Nuxt.js SSR，Port 3002
- **gshop-web** — Nuxt.js SSR，Port 3003
- **GKE Autopilot Cluster** — gshop-cluster，asia-east1
- **Artifact Registry** — asia-east1-docker.pkg.dev/gshop-497319/gshop
- **Database** — Supabase（Session Pooler）
- **Domain** — garydemo.com（Cloudflare）

---

## 部署流程

### 1. Build & Push Image（每次更新都要做）

```bash
# API
gcloud builds submit ./gshop-api \
  --tag asia-east1-docker.pkg.dev/gshop-497319/gshop/api:latest

# Dashboard
gcloud builds submit ./gshop-dashboard \
  --tag asia-east1-docker.pkg.dev/gshop-497319/gshop/dashboard:latest

# Web
gcloud builds submit ./gshop-web \
  --tag asia-east1-docker.pkg.dev/gshop-497319/gshop/web:latest
```

> Cloud Build 在雲端 build（解決本地 Apple Silicon arm64/amd64 問題）

### 2. 建立 Kubernetes Secret

```bash
kubectl create secret generic gshop-api-secret \
  --from-literal=DATABASE_URL="..." \
  --from-literal=JWT_SECRET="..." \
  --from-literal=GCS_BUCKET_NAME="..." \
  --from-literal=ANTHROPIC_API_KEY="..."
```

### 3. 建立 Cloudflare Origin Certificate TLS Secret

```bash
kubectl create secret tls cloudflare-origin-cert \
  --cert=certificate.pem \
  --key=private.key
```

### 4. 套用 K8s 設定

```bash
kubectl apply -f k8s/backend-config.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/dashboard-deployment.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

### 5. 更新部署（有新 commit 時）

```bash
# 重新 build image
gcloud builds submit ./gshop-dashboard \
  --tag asia-east1-docker.pkg.dev/gshop-497319/gshop/dashboard:latest

# 重啟 pod（Rolling Update，不會 downtime）
kubectl rollout restart deployment/gshop-dashboard
```

---

## 遇到的狀況與解決

### 1. arm64/amd64 平台不符

- **問題**：本地 Apple Silicon Mac build 出 arm64 image，GKE 需要 amd64
- **解法**：改用 `gcloud builds submit`，Cloud Build 在 amd64 機器上 build

### 2. ImagePullBackOff（沒權限拉 image）

- **問題**：GKE Service Account 沒有 Artifact Registry 讀取權限
- **解法**：
  ```bash
  gcloud projects add-iam-policy-binding gshop-497319 \
    --member="serviceAccount:620172615694-compute@developer.gserviceaccount.com" \
    --role="roles/artifactregistry.reader"
  ```

### 3. Ingress 遲遲拿不到 IP（NEG not ready）

- **問題 1**：用了 `spec.ingressClassName: gce`，GKE 的 controller 不認這個，要用 annotation
- **解法**：改成：
  ```yaml
  metadata:
    annotations:
      kubernetes.io/ingress.class: gce
  ```
- **問題 2**：Service 上有舊的 `networking.gke.io/target-pool` annotation 造成衝突
- **解法**：
  ```bash
  kubectl annotate svc gshop-api networking.gke.io/target-pool-
  kubectl annotate svc gshop-dashboard networking.gke.io/target-pool-
  kubectl annotate svc gshop-web networking.gke.io/target-pool-
  ```
  再刪掉重建 Ingress

### 4. 502 Bad Gateway（健康檢查失敗）

- **問題**：GCP Load Balancer 預設用 `GET /` 做健康檢查，但各服務行為不同：
  - gshop-api：`/` 沒有 route，回非 200
  - gshop-dashboard：`/` 302 redirect 到 `/login`
  - gshop-web：`/` 正常回 200（不需要處理）
- **解法**：建 `BackendConfig` 指定正確的健康檢查路徑：
  ```yaml
  # gshop-api → /health
  # gshop-dashboard → /login
  ```
  並在 Service 加 annotation：
  ```yaml
  cloud.google.com/backend-config: '{"default": "gshop-api-backend-config"}'
  ```

### 5. Supabase 連線失敗（ENOTFOUND）

- **問題**：Supabase 直連（`db.xxx.supabase.co:5432`）是 IPv6 only，GKE 是 IPv4 only
- **解法**：改用 Supabase **Session Pooler** connection string：
  ```
  postgresql://postgres.vqjzzlutlovqoqshwbza:PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
  ```
  更新 K8s secret：
  ```bash
  NEW_URL="postgresql://..."
  kubectl patch secret gshop-api-secret -p "{\"data\":{\"DATABASE_URL\":\"$(echo -n $NEW_URL | base64)\"}}"
  kubectl rollout restart deployment/gshop-api
  ```
  > 本地開發不需要改，Mac 支援 IPv6 直連沒問題

---

## DNS & HTTPS 設定

### Cloudflare A Records

| 子網域 | IP |
|--------|-----|
| api.garydemo.com | 34.160.168.110 |
| dashboard.garydemo.com | 34.160.168.110 |
| web.garydemo.com | 34.160.168.110 |

> 三個都指向同一個 Ingress IP，由 Ingress 依 Host header 分流

### Cloudflare SSL/TLS 模式

- 設為 **Full (Strict)**
- 使用 Cloudflare Origin Certificate 存為 K8s TLS Secret

### 流量路徑

```
瀏覽器 → Cloudflare（Proxy + TLS）→ GCP Load Balancer → Ingress → Pod
```

---

## CI/CD（GitHub Actions）

每個 service 各自有獨立 repo，push 到 main 自動 build + deploy。

```
push main → GitHub Actions → build image → push Artifact Registry → kubectl rollout restart
```

### 前置設定（一次性）

```bash
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

gcloud projects add-iam-policy-binding gshop-497319 \
  --member="serviceAccount:github-actions@gshop-497319.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding gshop-497319 \
  --member="serviceAccount:github-actions@gshop-497319.iam.gserviceaccount.com" \
  --role="roles/container.developer"

gcloud iam service-accounts keys create sa-key.json \
  --iam-account=github-actions@gshop-497319.iam.gserviceaccount.com
```

GitHub org → Settings → Secrets → New organization secret，名稱 `GCP_SA_KEY`，貼入 `sa-key.json` 內容。

### Workflow 範例

```yaml
name: Deploy gshop-api

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker asia-east1-docker.pkg.dev
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

> GitHub Actions runner 是 ubuntu amd64，build 出的 image 天生就是 amd64，不需要 Cloud Build

---

## 常用指令

```bash
# 查 pod 狀態
kubectl get pods

# 查 ingress IP
kubectl get ingress gshop-ingress

# 查某服務 log
kubectl logs -l app=gshop-api --tail=50

# 查 backend 健康狀態
gcloud compute backend-services get-health <backend-name> --global

# 列出所有 backend
gcloud compute backend-services list --global

# 查 NEG
gcloud compute network-endpoint-groups list
```
