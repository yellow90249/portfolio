---
title: "用 Daily Snapshot 提升統計查詢速度"
description: 資料量龐大導致查詢變慢，透過 Cron Job 將每日統計好的資料寫入 Snapshot Table，查的時候單表讀取，不需要跨表掃描。
date: 2026-06-15
image: /images/daily-snapshot.jpg
minRead: 5
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 問題背景

訂單管理後台有一個總覽頁面，需要顯示以下統計數字：

- 當日營業額與訂單數
- 新增用戶數
- 平均客單價
- 熱銷商品 Top 10
- 各類別銷售佔比
- 各付款方式分佈

起初資料量小，直接對 `orders`、`order_items`、`payments` 做聚合查詢沒有問題。

隨著訂單累積，這些查詢開始拖慢整個頁面，每次載入需要數秒，而且每個進入後台的管理員都會觸發一次跨表掃描。

---

## 解法：Daily Snapshot

核心思路：**不在用戶請求時計算，改成每天固定時間預先算好，存進一張 Snapshot Table，查詢時直接讀一筆記錄。**

```
每天 00:00 Cron Job 執行
      ↓
讀取昨日訂單、商品、付款資料，執行聚合計算
      ↓
將結果寫入 daily_snapshots 表（一天一筆）
      ↓
前端請求總覽時，直接 SELECT 最新一筆 snapshot
```

---

## Snapshot Table 設計

Snapshot 除了基本的金額與訂單數，還用 JSON 欄位儲存熱銷商品、類別、付款方式等排行資料：

```js
// Sequelize Model
DailySnapshot = {
  date: DataTypes.DATEONLY, // 唯一鍵，一天一筆
  revenue: DataTypes.DECIMAL, // 當日營業額（paid/shipped/delivered）
  orderCount: DataTypes.INTEGER, // 當日總訂單數
  newUserCount: DataTypes.INTEGER, // 當日新增用戶數
  avgOrderValue: DataTypes.DECIMAL,
  topProducts: DataTypes.JSON, // [{ productId, productName, totalRevenue, totalQuantity }]
  topCategories: DataTypes.JSON, // [{ categoryId, categoryName, totalRevenue, totalQuantity }]
  paymentMethods: DataTypes.JSON, // [{ method, count, amount }]
};
```

---

## buildDailySnapshot 實作

以下是實際的計算函式，對四張表同時發出查詢後一次 upsert 進 snapshot table：

```js
import sequelize from "../config/db.js";
import { DailySnapshot } from "../models/index.js";

export async function buildDailySnapshot(targetDate) {
  // 預設計算昨天
  const date =
    targetDate ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    })();

  const dateStr = toLocalDateStr(date);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // 四支查詢並行執行，減少等待時間
  const [[revenue], [userRow], topProducts, topCategories, paymentMethods] =
    await Promise.all([
      // 營業額、訂單數
      sequelize.query(
        `
        SELECT
          COALESCE(SUM(total_amount) FILTER (WHERE status IN ('paid','shipped','delivered')), 0) AS revenue,
          COUNT(*) FILTER (WHERE status IN ('paid','shipped','delivered')) AS paid_count,
          COUNT(*) AS order_count
        FROM orders WHERE created_at >= :start AND created_at < :end
      `,
        { replacements: { start, end }, type: sequelize.QueryTypes.SELECT },
      ),

      // 新增用戶數
      sequelize.query(
        `
        SELECT COUNT(*) AS count FROM users
        WHERE created_at >= :start AND created_at < :end
      `,
        { replacements: { start, end }, type: sequelize.QueryTypes.SELECT },
      ),

      // 熱銷商品 Top 10
      sequelize.query(
        `
        SELECT oi.product_id AS "productId", oi.product_name AS "productName",
               SUM(oi.subtotal) AS "totalRevenue", SUM(oi.quantity) AS "totalQuantity"
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= :start AND o.created_at < :end AND o.status != 'cancelled'
        GROUP BY oi.product_id, oi.product_name
        ORDER BY "totalRevenue" DESC LIMIT 10
      `,
        { replacements: { start, end }, type: sequelize.QueryTypes.SELECT },
      ),

      // 各類別銷售 Top 10
      sequelize.query(
        `
        SELECT p.category_id AS "categoryId", c.name AS "categoryName",
               SUM(oi.subtotal) AS "totalRevenue", SUM(oi.quantity) AS "totalQuantity"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        JOIN categories c ON c.id = p.category_id
        WHERE o.created_at >= :start AND o.created_at < :end AND o.status != 'cancelled'
        GROUP BY p.category_id, c.name
        ORDER BY "totalRevenue" DESC LIMIT 10
      `,
        { replacements: { start, end }, type: sequelize.QueryTypes.SELECT },
      ),

      // 付款方式分佈
      sequelize.query(
        `
        SELECT pay.method, COUNT(*) AS count, SUM(pay.amount) AS amount
        FROM payments pay JOIN orders o ON o.id = pay.order_id
        WHERE o.created_at >= :start AND o.created_at < :end
          AND o.status IN ('paid','shipped','delivered')
        GROUP BY pay.method
      `,
        { replacements: { start, end }, type: sequelize.QueryTypes.SELECT },
      ),
    ]);

  const rev = parseFloat(revenue.revenue) || 0;
  const paidCount = parseInt(revenue.paid_count) || 0;

  // upsert：重跑不會產生重複資料
  await DailySnapshot.upsert({
    date: dateStr,
    revenue: rev,
    orderCount: parseInt(revenue.order_count) || 0,
    newUserCount: parseInt(userRow.count) || 0,
    avgOrderValue: paidCount > 0 ? parseFloat((rev / paidCount).toFixed(2)) : 0,
    topProducts: topProducts.map((r) => ({
      ...r,
      totalRevenue: parseFloat(r.totalRevenue),
      totalQuantity: parseInt(r.totalQuantity),
    })),
    topCategories: topCategories.map((r) => ({
      ...r,
      totalRevenue: parseFloat(r.totalRevenue),
      totalQuantity: parseInt(r.totalQuantity),
    })),
    paymentMethods: paymentMethods.map((r) => ({
      method: r.method,
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
    })),
  });
}
```

幾個值得注意的設計細節：

- **`Promise.all`**：四支查詢並行發出，不等前一支結束才跑下一支
- **`FILTER (WHERE status IN (...))`**：只統計有效訂單的營業額，排除取消訂單
- **`upsert`**：Cron Job 重跑（例如補跑失敗的日期）時不會產生重複記錄
- **`toLocalDateStr`**：手動格式化本地日期，避免 `toISOString()` 因時區偏移導致日期錯誤

---

## Cron Job 排程

```js
import cron from "node-cron";
import { buildDailySnapshot } from "./jobs/dailySnapshot.js";

// 每天凌晨 00:05 執行（留 5 分鐘緩衝確保跨日資料落庫）
cron.schedule("5 0 * * *", async () => {
  await buildDailySnapshot();
  console.log("[Snapshot] 昨日 snapshot 建立完成");
});
```

---

## 查詢方式

總覽 API 改成直接讀 snapshot，不再碰原始資料表：

```js
// ✅ 讀最新一筆 snapshot，毫秒級回應
const snapshot = await DailySnapshot.findOne({
  order: [["date", "DESC"]],
});
```

---

## 訂單狀態會變動怎麼辦？

Snapshot 是某個時間點的快照，但訂單狀態會在那之後繼續變動，這是使用這個模式必須正視的問題。

**舉個例子：**

```
23:50  訂單建立，狀態 pending
00:05  Cron Job 跑完 snapshot，這筆訂單未被計入營業額
09:00  用戶付款，狀態變 paid
```

昨天的 snapshot 永遠不會包含這筆訂單，數字就是錯的。

### 解法一：補跑近幾天的 Snapshot

每天除了算昨天，也重算過去 N 天，讓狀態更新能被追上：

```js
// 每天重算最近 7 天
cron.schedule("5 0 * * *", async () => {
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    await buildDailySnapshot(d);
  }
});
```

適合狀態變動集中在近期（例如大多數訂單在 3 天內完成付款）的情境。`upsert` 的設計讓補跑變得安全，不會產生重複資料。

### 解法二：只快照終態訂單

只把 `delivered`、`cancelled` 這類不會再變動的訂單算進 snapshot，`paid`、`shipped` 等還在流動中的訂單留給即時查詢。

代價是 snapshot 數字會比實際交易日期滯後幾天，但每一筆都是確定的終態數字。

### 解法三：接受誤差

如果這個總覽是給內部看的管理報表，T+1 有些許誤差通常可以接受。業務決策不需要精確到每一筆，數字的趨勢比精確值更重要。

---

目前採用的是**解法一**，每天重算最近 7 天，在資料準確性與實作複雜度之間取得平衡。

---

## 效果對比

| 指標       | 改善前           | 改善後         |
| ---------- | ---------------- | -------------- |
| 查詢時間   | 數秒             | < 10ms         |
| 資料庫負載 | 每次請求跨表掃描 | 每日一次聚合   |
| 資料即時性 | 即時             | 前一天結算準確 |

---

## 適用場景

這個模式適合**讀多寫少、資料量大、對即時性要求不高**的統計需求，例如：

- 管理後台的訂單、用戶、收入總覽
- 報表系統的歷史趨勢圖
- 定期推播給管理員的每日摘要
