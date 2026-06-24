---
title: GShop 系統架構
description: 三服務電商系統的完整部署藍圖，從 CI/CD 到 GKE 叢集、Cloudflare Proxy 到 Supabase 的全端架構設計。
date: 2026-06-20
image: /images/architecture.jpg
url: https://github.com/orgs/very-cool-gshop/repositories
tags: ["GKE", "Kubernetes", "Cloudflare", "CI/CD", "Supabase", "GCS"]
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

![GShop 系統架構圖](/images/structure.png)

## 系統概覽

GShop 是一套電商系統，由三個獨立服務組成，統一部署在 GKE Autopilot 上：

| 服務 | 角色 | Port |
|------|------|------|
| gshop-api | Node.js REST API | 3001 |
| gshop-dashboard | Nuxt.js 管理後台 | 3002 |
| gshop-web | Nuxt.js 前台購物網站 | 3003 |

三個服務共用同一個 GKE Cluster、同一個 Cloud Load Balancer IP，由 Ingress 依 Host header 分流。

---

## CI/CD Pipeline

三個 repo 分別位於 GitHub Org `very-cool-gshop`，各自有獨立的 GitHub Actions workflow。

```
push main → GitHub Actions
              ↓
         docker build (ubuntu-latest / amd64)
              ↓
         push → Artifact Registry
              ↓
         kubectl rollout restart
```

GitHub Actions runner 是 `ubuntu-latest`，天生就是 amd64，build 出的 image 直接相容 GKE，不需要 Cloud Build。

---

## User & Edge 層

使用者請求先經過 Cloudflare，再進入 GCP：

```
User Browser
     ↓ HTTPS
  Cloudflare
  DNS + Proxy（Full Strict）
     ↓ HTTPS
GCP Cloud Load Balancer
```

**Cloudflare 的作用：**
- DNS 解析 — 對外暴露 Cloudflare IP，不直接暴露 GCP 的真實 IP
- Proxy — 所有流量過 Cloudflare 節點，提供 DDoS 防護與快取
- TLS 終止 — 瀏覽器到 Cloudflare 這段的 HTTPS 由 Cloudflare 處理

**Full (Strict) 模式：**  
Cloudflare 到 GCP 這段也必須有合法憑證。使用 Cloudflare Origin Certificate，存成 K8s TLS Secret，由 Ingress 掛載使用。

---

## GKE Autopilot 叢集

叢集名稱 `gshop-cluster`，部署在 `asia-east1`。

### Ingress — host-based 路由

```
api.garydemo.com      →  gshop-api:3001
dashboard.garydemo.com →  gshop-dashboard:3002
web.garydemo.com      →  gshop-web:3003
```

Cloud Load Balancer（IP：34.160.168.110）接收所有流量，Ingress Controller 根據 Host header 決定轉發目標。

### TLS Secret

Cloudflare Origin Certificate 存成 K8s TLS Secret：

```bash
kubectl create secret tls cloudflare-origin-cert \
  --cert=certificate.pem \
  --key=private.key
```

Ingress 掛載這個 Secret，讓 Cloudflare → GCP 這段走 HTTPS。

### DB Secret

資料庫連線字串存成 K8s Generic Secret：

```bash
kubectl create secret generic gshop-api-secret \
  --from-literal=DATABASE_URL="postgresql://..."
```

gshop-api Pod 透過環境變數讀取，不會出現在 image 或 code 裡。

---

## 外部服務

### Supabase PostgreSQL

gshop-api 透過 **Session Pooler** 連線，走 IPv4：

```
aws-1-ap-southeast-1.pooler.supabase.com:5432
```

> GKE Autopilot 節點只有 IPv4，Supabase 直連（`db.xxx.supabase.co`）是 IPv6 only，直接連會 ENOTFOUND。

### Google Cloud Storage

gshop-api 負責商品圖片的上傳與讀取，存放在 GCS Bucket `gshop-files`。

---

## 部署架構圖

整體流量與部署流向：

```
GitHub push main
       ↓
  GitHub Actions
  docker build → Artifact Registry
       ↓
  kubectl rollout restart
       ↓
  GKE Pod 拉新 image 滾動更新

User Browser → Cloudflare → Cloud LB (34.160.168.110)
                                    ↓
                             Ingress（host routing）
                            ↙        ↓        ↘
                      gshop-api  gshop-dashboard  gshop-web
                           ↓             ↓
                       Supabase       GCS Bucket
                      PostgreSQL
```
