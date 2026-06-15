---
title: "SSR（Server-Side Rendering）"
description: 介紹伺服器端渲染的運作原理、與 CSR 的差異、優缺點，以及在 Nuxt.js 開發中需要注意的事項。
date: 2026-06-15
image: /images/ssr.jpg
minRead: 5
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 什麼是 SSR？

SSR 即**伺服器端渲染（Server-Side Rendering）**，指網頁的 HTML 在**伺服器**上產生完整內容後，再傳送給瀏覽器顯示。

---

## 渲染方式比較

| 項目 | SSR | CSR（Client-Side Rendering） |
|------|-----|-------------------------------|
| HTML 生成位置 | 伺服器 | 瀏覽器 |
| 首屏速度 | 快 | 慢（需等 JS 執行） |
| SEO | 友好 | 不友好（爬蟲難以讀取） |
| 伺服器負擔 | 較重 | 較輕 |
| 互動性 | 較低（需搭配 Hydration） | 高 |

---

## 運作流程

```
使用者請求頁面
      ↓
伺服器執行程式碼，取得資料
      ↓
伺服器產生完整 HTML
      ↓
回傳 HTML 給瀏覽器
      ↓
瀏覽器顯示頁面（可立即看到內容）
      ↓
JavaScript 載入，進行 Hydration（賦予互動能力）
```

---

## 優點

- **首屏載入快**：用戶更快看到內容，體驗好
- **SEO 友好**：搜尋引擎爬蟲可直接讀取完整 HTML
- **社群分享預覽正常**：Open Graph 標籤可被正確解析

---

## 缺點

- **伺服器負擔重**：每次請求都需伺服器運算
- **TTFB 較慢**（Time To First Byte）：伺服器需先處理完才回傳
- **開發複雜度高**：需注意程式碼在伺服器與瀏覽器環境的差異（如 `window`、`document` 不存在於伺服器端）

---

## 開發需注意

- **儲存 Token 的環境差異**：`localStorage` 只存在於瀏覽器，伺服器端無法存取。

  **解法：改用 Cookie 存 token**
  Cookie 會隨每個 HTTP request 自動帶到伺服器，server 和 client 都能讀取。

  Nuxt 提供內建的 `useCookie`，統一處理兩端差異：
  - Server：從 request header 讀取 cookie，寫入放進 response header
  - Client：直接讀寫 `document.cookie`

  ```ts
  const token = useCookie('token', {
    maxAge: 60 * 60 * 24, // 1 天
    httpOnly: true,        // 防 XSS
    secure: true,          // 只走 HTTPS
  })

  token.value = 'abc123' // 寫入
  console.log(token.value) // 讀取
  token.value = null       // 清除
  ```

---

## 相關概念

### Hydration
SSR 傳回靜態 HTML 後，瀏覽器的 JavaScript 接管並賦予互動能力的過程，稱為 **Hydration（水合）**。

### SSG（Static Site Generation）
在**建置時**預先產生 HTML，而非每次請求時才產生。適合內容不常變動的頁面。

### ISR（Incremental Static Regeneration）
Next.js 提供的功能，結合 SSG 與 SSR，可設定頁面定期重新產生。

---

## 適用場景

- 需要 SEO 的網站（部落格、電商、新聞）
- 首屏效能要求高的頁面
- 內容依賴使用者身份或即時資料的頁面

---

## 常用框架

| 框架 | 基於 | 語言 |
|------|------|------|
| **Nuxt.js** | Vue | JavaScript / TypeScript |
| **SvelteKit** | Svelte | JavaScript / TypeScript |
| **Next.js** | React | JavaScript / TypeScript |
| **Remix** | React | JavaScript / TypeScript |

---

## 程式碼範例（Nuxt.js）

```vue
<!-- pages/index.vue -->

<script setup lang="ts">
const { data } = await useFetch('https://api.example.com/data')
</script>

<template>
  <div>{{ data.title }}</div>
</template>
```

> `useFetch` 在 SSR 模式下會於伺服器端執行，取得資料後渲染完整 HTML 再回傳給瀏覽器；切換頁面時則在客戶端執行。
