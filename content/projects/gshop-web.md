---
title: gshop-web
description: 使用 Nuxt.js SSR 建構電商購物前台，部署於 GKE Autopilot，透過 Cloudflare Proxy 以 Full (Strict) TLS 對外提供服務。
date: 2025-01-01
image: /projects/web.jpg
tags: ["Nuxt.js", "SSR", "GKE", "Cloudflare", "CI/CD"]
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 架構概覽

gshop-web 是面向消費者的電商購物前台，提供商品瀏覽、加入購物車、結帳等功能，使用 Nuxt.js SSR 確保 SEO 效果與首屏載入速度。

- **Framework**：Nuxt.js（SSR 模式）
- **Port**：3003
- **部署環境**：GKE Autopilot，asia-east1
- **網域**：web.garydemo.com
- **CDN / Proxy**：Cloudflare（Full Strict TLS）

## 部署架構

```
GitHub (main) → GitHub Actions → docker build (amd64) → Artifact Registry
                                                               ↓
                                                       GKE pull image
                                                               ↓
                                                  kubectl rollout restart
```

流量路徑：

```
使用者瀏覽器
    ↓ HTTPS
Cloudflare Proxy（DNS + TLS 終止）
    ↓ HTTPS + Origin Certificate
GCP Load Balancer（34.160.168.110）
    ↓
Ingress（Host: web.garydemo.com）
    ↓
gshop-web Pod（:3003）
```

## 遇到的問題與解法

### 1. 本地 Build 的 Image 在 GKE 無法執行

**問題**：本地 `docker build` 後推上去，GKE Pod 啟動失敗。

**原因**：開發機是 Apple Silicon（arm64），`docker build` 預設產出 arm64 image，但 GKE 節點是 amd64 架構，無法執行。

**解法**：CI/CD 改用 GitHub Actions ubuntu runner 執行 `docker build`，runner 本身是 amd64，build 出的 image 天生就是 amd64，不需要額外設定或使用 Cloud Build。

---

### 2. Cloudflare Full (Strict) TLS 設定

**問題**：設定 Cloudflare SSL/TLS 為 Full (Strict) 後，網站無法正常載入。

**原因**：Full (Strict) 要求 Cloudflare 到 GCP 這段也必須使用合法憑證，自簽憑證不被接受。

**解法**：

1. 在 Cloudflare Dashboard → SSL/TLS → Origin Server 建立 Origin Certificate 並下載
2. 存為 Kubernetes TLS Secret：
```bash
kubectl create secret tls cloudflare-origin-cert \
  --cert=certificate.pem \
  --key=private.key
```
3. 在 `ingress.yaml` 的 `tls` 區塊掛載：
```yaml
spec:
  tls:
    - secretName: cloudflare-origin-cert
      hosts:
        - web.garydemo.com
```

---

### 3. Ingress Class 設定錯誤

**問題**：套用 `ingress.yaml` 後，GKE 沒有建立對應的 Cloud Load Balancer。

**原因**：使用了 `spec.ingressClassName: gce`，GKE Ingress Controller 不認識這個欄位。

**解法**：改用 annotation 方式指定：

```yaml
metadata:
  annotations:
    kubernetes.io/ingress.class: gce
```

## CI/CD 設定

每次 push 到 main，GitHub Actions 自動執行：

```yaml
- name: Build and push image
  run: |
    docker build -t asia-east1-docker.pkg.dev/gshop-497319/gshop/web:latest .
    docker push asia-east1-docker.pkg.dev/gshop-497319/gshop/web:latest

- uses: google-github-actions/get-gke-credentials@v2
  with:
    cluster_name: gshop-cluster
    location: asia-east1

- run: kubectl rollout restart deployment/gshop-web
```
