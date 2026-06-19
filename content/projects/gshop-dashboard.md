---
title: gshop-dashboard
description: 使用 Nuxt.js SSR 建構電商管理後台，部署於 GKE Autopilot，透過 GitHub Actions 自動化部署。
date: 2026-06-15
image: /projects/dashboard.jpg
url: https://github.com/very-cool-gshop/gshop-dashboard
demoUrl: https://dashboard.garydemo.com/
demoNote: 訪客唯讀帳號：demouser@gmail.com / demo1234
tags: ["Nuxt.js", "SSR", "GKE", "Kubernetes", "CI/CD"]
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 架構概覽

gshop-dashboard 是電商後台管理介面，提供商品上架、訂單管理、會員查詢等功能，使用 Nuxt.js SSR 渲染，確保 SEO 與首屏載入效能。

- **Framework**：Nuxt.js（SSR 模式）
- **Port**：3002
- **部署環境**：GKE Autopilot，asia-east1
- **網域**：dashboard.garydemo.com

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
Cloudflare → GCP Load Balancer → Ingress (Host: dashboard.garydemo.com) → gshop-dashboard Pod
```

## 遇到的問題與解法

### 1. 502 Bad Gateway — 健康檢查失敗

**問題**：部署完成後，dashboard 持續回傳 502。

**原因**：GCP Load Balancer 預設對 `GET /` 做健康檢查，但 Nuxt SSR 的 `/` 會 302 redirect 到 `/login`。GCP LB 不把 302 算成健康狀態，因此判定服務異常，停止轉發流量。

**解法**：建立 `BackendConfig`，直接將健康檢查路徑指定為 `/login`（回傳 200）：

```yaml
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: gshop-dashboard-backend-config
spec:
  healthCheck:
    requestPath: /login
    type: HTTP
```

並在 Service 加上 annotation：

```yaml
cloud.google.com/backend-config: '{"default": "gshop-dashboard-backend-config"}'
```

---

### 2. Ingress 長時間無法取得 IP（NEG not ready）

**問題**：套用 `ingress.yaml` 後，`kubectl get ingress` 顯示 IP 欄位一直是空的。

**原因**：Service 上殘留舊的 `networking.gke.io/target-pool` annotation，與 GKE Ingress Controller 的 NEG（Network Endpoint Group）機制衝突，導致 LB backend 無法正常建立。

**解法**：移除舊 annotation，刪除後重建 Ingress：

```bash
kubectl annotate svc gshop-dashboard networking.gke.io/target-pool-
kubectl delete ingress gshop-ingress
kubectl apply -f k8s/ingress.yaml
```

## CI/CD 設定

每次 push 到 main，GitHub Actions 自動執行：

```yaml
- name: Build and push image
  run: |
    docker build -t asia-east1-docker.pkg.dev/gshop-497319/gshop/dashboard:latest .
    docker push asia-east1-docker.pkg.dev/gshop-497319/gshop/dashboard:latest

- uses: google-github-actions/get-gke-credentials@v2
  with:
    cluster_name: gshop-cluster
    location: asia-east1

- run: kubectl rollout restart deployment/gshop-dashboard
```
