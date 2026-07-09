---
title: "同步 vs 非同步"
description: 解釋同步與非同步的核心差異，以及 JavaScript 中 callback、Promise、async/await 的演進與使用場景。
date: 2026-07-05
image: /images/data-flow.jpg
minRead: 6
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 什麼是同步？

**同步（Synchronous）** 指程式逐行執行，必須等前一個操作完成，才能繼續下一行。

```js
const result = readFileSync('data.txt') // 等待讀取完成
console.log(result)                      // 才執行這行
```

優點是邏輯直觀，缺點是遇到耗時操作（讀檔、網路請求）時，整個執行緒會卡住等待。

---

## 什麼是非同步？

**非同步（Asynchronous）** 指操作發出後不等結果，程式繼續往下跑，等操作完成時再透過某種機制通知。

```js
readFile('data.txt', (err, result) => {
  console.log(result) // 完成後才執行
})
console.log('這行先跑') // 不等讀檔
```

JavaScript 是單執行緒語言，非同步讓它在等待結果的空檔不會被阻塞，能同時處理多件事。

> 非同步存在的核心目的與「等待」的完整分類，可參考 [Async 到底在解決什麼問題？](/articles/async-waiting) 一文。

---

## 非同步的三個演進階段

### 1. Callback

最早的非同步處理方式，把「完成後要做什麼」當作函式傳入。

```js
fetchUser(id, (err, user) => {
  fetchOrders(user.id, (err, orders) => {
    fetchProducts(orders[0].id, (err, product) => {
      // Callback Hell
    })
  })
})
```

巢狀層數一深就難以維護，俗稱 **Callback Hell**。

> Callback 的完整定義、判斷標準與常見誤解，可參考 [Callback 是什麼？](/articles/callback) 一文。

---

### 2. Promise

ES6 引入，讓非同步操作可以鏈式呼叫，改善可讀性。

```js
fetchUser(id)
  .then(user => fetchOrders(user.id))
  .then(orders => fetchProducts(orders[0].id))
  .then(product => console.log(product))
  .catch(err => console.error(err))
```

Promise 有三種狀態：`pending` → `fulfilled` / `rejected`，一旦確定就不會再變。

---

### 3. async / await

ES2017 引入，讓非同步程式碼看起來像同步，是目前最常見的寫法。

```js
async function loadData() {
  try {
    const user = await fetchUser(id)
    const orders = await fetchOrders(user.id)
    const product = await fetchProducts(orders[0].id)
    console.log(product)
  } catch (err) {
    console.error(err)
  }
}
```

`async/await` 底層仍是 Promise，只是語法糖，讓錯誤處理可以用熟悉的 `try/catch`。

---

### 小結：三個階段在演進什麼

JS 非同步的演進，是一條從 **callback**（能用但難維護）→ **Promise**（結構化、統一錯誤處理）→ **async/await**（語法糖、可讀性接近同步程式碼）的路線，核心目標始終是同一個：讓「處理非同步結果」這件事，寫起來越來越像寫同步程式碼一樣直覺，同時保留非同步不阻塞的效能優勢。

而且很重要的一點：`async/await` 底層還是 Promise，Promise 底層還是靠 callback 機制（Event Loop 把 callback 塞進 Call Stack 執行）。所以 callback、Event Loop 的原理，是理解 Promise 和 `async/await` 底層運作的必備基礎，並沒有被取代，只是被包裝得更好用了。

---

## 同步 vs 非同步比較

| | 同步 | 非同步 |
|---|---|---|
| 執行方式 | 等待完成才繼續 | 發出後繼續執行 |
| 適合場景 | 運算密集、順序依賴 | I/O 操作、網路請求 |
| 風險 | 阻塞執行緒 | 流程較複雜 |

---

## 什麼時候用同步？

非同步不是萬能的，以下場景用同步更合適：

- **啟動時的初始化**：程式啟動時讀取設定檔，必須等完成才能繼續
- **CLI 工具**：簡單腳本沒有並發需求，同步反而清楚

```js
// Node.js 啟動時讀取設定，同步沒問題
const config = JSON.parse(readFileSync('config.json', 'utf-8'))
```

---

## 並行執行多個非同步操作

如果多個操作互不依賴，可以用 `Promise.all` 同時發出，縮短等待時間。

```js
// 依序執行：等 A 完成才發 B（慢）
const user = await fetchUser(id)
const config = await fetchConfig()

// 並行執行：同時發出（快）
const [user, config] = await Promise.all([fetchUser(id), fetchConfig()])
```
