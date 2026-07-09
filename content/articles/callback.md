---
title: "Callback 是什麼？"
description: 精確定義 callback、判斷標準與常見誤解，介紹 JavaScript 中常用到 callback 的內建函數、Callback Hell 問題，以及它與 Promise、async/await 的關係。
date: 2026-07-09
image: /images/data-flow.jpg
minRead: 6
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 一句話定義

> **被交給另一段程式碼、由對方決定何時呼叫的函式。**
>
> A function handed to other code, to be called back by it — not by whoever defined it.

---

## Callback 的判斷標準

**Callback（回呼函式）**：把一個函式交給另一段程式碼，由「接收方」決定何時呼叫它。

要成立，需同時符合兩個條件：

1. 這個函式是被**交出去**的（不是寫死在裡面直接呼叫）
2. 由**接收方**決定何時、是否呼叫它——定義這個函式的人不會自己主動呼叫

```js
// ✅ 是 callback：b 被交給 a，由 a 決定何時呼叫
function a(callback) {
  callback()
}
a(function b() {
  console.log('b')
})

// ❌ 不是 callback：a 內部寫死直接呼叫 b，不是被交出去的
function b() {
  console.log('b')
}
function a() {
  b()
}
a()
```

---

## 常見誤解澄清

**誤解一：callback 只跟非同步有關**
不對。`forEach` 裡的 callback 是同步執行；`setTimeout` 裡的 callback 是非同步執行，兩者都叫 callback。callback 描述的是「誰決定何時呼叫」，跟執行時機是同步還是非同步無關。

**誤解二：callback 是 JavaScript 專屬的東西**
不對，這是跨語言通用的設計模式。只要語言支援把函式當一級公民傳遞（JS、Python、Go），或至少支援函式指標／介面模擬（C、舊版 Java），都能實現 callback。

---

## 不只是「當參數傳」

「當參數傳」只是最常見的形式，不是唯一形式。真正的本質是：**函式的定義者不會自己呼叫它，而是交出去，讓另一方保管、決定何時觸發**。除了參數傳遞，還有其他一樣算 callback 的形式：

**賦值給屬性**

```js
window.onload = function () {
  console.log('頁面載入完成')
}
// 瀏覽器內部某個時機點會主動呼叫 window.onload()
// 沒有透過參數，但一樣是 callback——由瀏覽器決定何時呼叫
```

**註冊到集合／清單裡**

```js
class EventBus {
  handlers = []
  on(fn) {
    this.handlers.push(fn) // 存進陣列，不是當下被呼叫
  }
  emit() {
    this.handlers.forEach((fn) => fn()) // 之後才被呼叫
  }
}
```

參數傳遞之所以最常見，是因為在支援一級函式的語言裡，它不需要額外宣告變數去存放，語意也最直接：「這個函式，麻煩你決定何時呼叫」，跟函式呼叫的語法自然結合，讀起來一目了然。屬性賦值、註冊清單本質上做的是同一件事，只是把函式參照存放到別的地方。

---

## 由誰決定何時呼叫？

接收方不一定是個「函數」，可以是外層函式、runtime、事件系統、甚至 OS。

| 範例 | 誰決定何時呼叫 |
|---|---|
| `a(callback)` | 外層函式 `a` |
| `window.onload = fn` | 瀏覽器（runtime），等頁面載入完才呼叫 |
| `setTimeout(fn, 1000)` | 瀏覽器的 Timer 機制，等時間到才呼叫 |
| `element.onclick = fn` | 瀏覽器的事件系統，等使用者點擊才呼叫 |
| `array.forEach(fn)` | `forEach` 內部邏輯，依序對每個元素呼叫 |

---

## JS 中常見使用 callback 的函數

**同步（Sync）——陣列、字串操作**

```js
array.forEach((item) => {})
array.map((item) => item * 2)
array.filter((item) => item > 5)
array.reduce((acc, item) => acc + item, 0)
array.sort((a, b) => a - b)
'hello'.replace(/l/g, (m) => m.toUpperCase())
```

**非同步（Async）——計時器、事件、I/O**

```js
setTimeout(() => {}, 1000)
element.addEventListener('click', (e) => {})
fs.readFile('file.txt', (err, data) => {}) // Node.js
emitter.on('data', (data) => {})           // EventEmitter
```

| 類別 | 常見函數 | 同步/非同步 |
|---|---|---|
| 陣列操作 | `forEach`、`map`、`filter`、`reduce`、`sort` | 同步 |
| 計時器 | `setTimeout`、`setInterval` | 非同步 |
| 事件監聽 | `addEventListener`、`onclick`、`EventEmitter.on` | 非同步 |
| 檔案／系統 I/O（Node） | `fs.readFile`、`child_process.exec` | 非同步 |
| Promise | `.then`、`.catch`、executor | 混合（executor 同步，`then`/`catch` 非同步） |

就「用量」而言，同步 callback（陣列方法）用得最頻繁，只是太日常不會被特別提起。但「callback」這個詞會變成廣泛討論、甚至帶點負面印象的技術名詞（callback hell），主要來自**非同步場景**——因為在那裡，callback 是解決「無法立刻拿到結果」問題的必要手段，不像同步情境下只是讓程式碼更簡潔的選擇。

---

## 常見問題：Callback Hell

當多個非同步操作彼此依賴，需要一個接一個執行時，callback 會層層嵌套，形成俗稱的 **Callback Hell**。

```js
fetchUser(id, (err, user) => {
  fetchOrders(user.id, (err, orders) => {
    fetchProducts(orders[0].id, (err, product) => {
      console.log(product)
      // 再多一層依賴，程式碼就會往右無限縮排
    })
  })
})
```

這種寫法的問題：

- **可讀性差**：邏輯往右不斷縮排，難以追蹤執行順序
- **錯誤處理分散**：每一層都要自己判斷 `err`，容易漏掉
- **難以維護**：中途插入或調整步驟，容易牽一髮動全身

---

## 和 Promise、async/await 的關係

Callback Hell 的問題，後來由 **Promise** 改善（鏈式呼叫、統一錯誤處理），再由 **async/await** 進一步簡化成接近同步的寫法。但這不代表 callback 被取代了——`async/await` 底層仍是 Promise，Promise 底層仍是靠 callback 機制運作（Event Loop 把 callback 塞進 Call Stack 執行）。

理解 callback 是什麼、它如何被 Event Loop 呼叫，是看懂 Promise 和 `async/await` 底層運作的基礎。

> 非同步的三個演進階段（callback → Promise → async/await），可參考 [同步 vs 非同步](/articles/sync-vs-async) 一文。
