---
title: "單機架構的性能優化"
description: 拆解單機系統的優化路線，以及用回應時間與吞吐量來衡量系統性能。
date: 2025-09-18
image: /images/single-machine.jpg
minRead: 6
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 為什麼從單機開始？

不少談高性能的書籍直接跳到分散式架構，但如果連單機都處理不好，分散式只是把問題放大。

**單機處理好，才是高性能的前提。**

---

## 基本架構

最簡單的系統只有兩層：

```
Client → 應用服務（Web Server）→ 資料庫服務（DB）
```

大多數系統成長後，會再加入兩個服務：

```
Client → CDN → 應用服務 → Cache → 資料庫服務
```

這個架構覆蓋了世界上 80% 以上的系統，從這裡出發優化，是最務實的路線。

---

## 應用層優化

應用層的目標：**用最少的資源處理請求，並最快回應客戶。**

可以拆成兩個方向：

### 運算優化

減少不必要的 CPU 消耗：
- 避免重複計算，善用 memoization
- 演算法與資料結構的選擇（時間複雜度）
- 避免同步阻塞的操作佔用主執行緒

### I/O 優化

大多數 Web 應用的瓶頸都在 I/O，而不是運算。

```ts
// ❌ 循環內逐一查詢，N 次 I/O
for (const id of ids) {
  const user = await db.query('SELECT * FROM users WHERE id = $1', [id])
}

// ✅ 一次批量查詢，1 次 I/O
const users = await db.query('SELECT * FROM users WHERE id = ANY($1)', [ids])
```

**常見 I/O 加速技術：**
- **連線池（Connection Pool）**：複用資料庫連線，避免每次請求都重新建立連線
- **Stream**：處理大檔案時逐段讀取，避免一次性載入記憶體
- **非同步 I/O**：Node.js 的事件驅動模型天生適合高併發 I/O 場景

---

## 資料庫層優化

資料庫層的目標同應用層，以最少的資源最快完成查詢。

### 索引（Index）

索引是影響資料庫性能最大的變數。用得好，查詢從全表掃描（O(n)）變成索引掃描（O(log n)）。

```sql
-- 沒有索引：全表掃描，資料量大時極慢
SELECT * FROM orders WHERE user_id = 123;

-- 建立索引後：直接定位
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

**注意：** 索引不是越多越好，寫入時需要維護索引，會拖慢 INSERT / UPDATE。

### 鎖與事務（Lock & Transaction）

鎖與事務是保障資料**一致性**的必要機制，但也是性能的隱患。

```sql
-- 事務確保原子性：轉帳要嘛全成功，要嘛全失敗
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

鎖的範圍越小、持有時間越短，對性能的影響越低。

---

## Cache 服務

Cache 的目的是將資料庫的常用查詢結果提前存起來，讓讀取繞過資料庫。

```
Client → 應用服務 → Cache（Redis）→ DB（Cache Miss 時才查）
```

```ts
const cacheKey = `user:${userId}`
let user = await redis.get(cacheKey)

if (!user) {
  user = await db.query('SELECT * FROM users WHERE id = $1', [userId])
  await redis.set(cacheKey, JSON.stringify(user), 'EX', 3600) // 快取 1 小時
}
```

**Cache 是雙刃劍：**
- 用得好：讀取性能大幅提升，資料庫壓力下降
- 用不好：Cache 與 DB 資料不一致，用戶看到過期資料

---

## CDN 服務

CDN 放在用戶與應用服務之間，讓靜態資源（圖片、JS、CSS）從距離用戶最近的節點回應，而不必每次都打到源站。

```
台灣用戶 → 台灣 CDN 節點 → （Cache Hit）直接回應
                           → （Cache Miss）回源站取得後快取
```

適合放上 CDN 的內容：
- 圖片、影片、字型
- 前端 JS / CSS bundle
- 不常變動的 API 回應

---

## 性能評估指標

### 回應時間（Latency）

用戶視角的指標，**越低越好**。

從用戶發出請求到收到回應的完整時間，包含：

```
網路傳輸 → 應用服務處理 → DB 查詢 → 回傳結果
```

實務上常用 **p99**（第 99 百分位）來衡量，代表 99% 的請求都在這個時間內完成，比平均值更能反映真實體驗。

### 吞吐量（Throughput / QPS）

開發者視角的指標，**越高越好**。

代表系統在單位時間內能處理的請求數量：

| 單位 | 全名 | 適用場景 |
|------|------|---------|
| QPS | Queries Per Second | 一般 Web API |
| TPS | Transactions Per Second | 資料庫、金融系統 |
| HPS | HTTP Requests Per Second | HTTP 服務 |

**計算公式：**

```
QPS = 併發數 ÷ 平均回應時間
```

例如系統可承受 1000 併發、平均回應時間 1 秒，則 QPS = 1000。

---

## 優化路線總結

| 層級 | 優化方向 |
|------|---------|
| 應用層 | 減少運算、優化 I/O、連線池、非同步處理 |
| 資料庫層 | 索引設計、減少鎖的範圍與持有時間 |
| Cache 層 | 熱點資料快取、合理設定 TTL |
| CDN 層 | 靜態資源卸載、縮短傳輸路徑 |

高性能系統的本質很簡單：**以最少的資源做最多的事情。** 從單機把每一層調好，才有資格談分散式。
