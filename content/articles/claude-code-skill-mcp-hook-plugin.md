---
title: "Claude Code 的 Skill、MCP、Hook、Plugin 分別是什麼？"
description: 拆解 AI coding agent 生態常見的四個擴充概念——Skill、MCP、Hook、Plugin，並以 Claude Code 為例說明實際配置方式與建議上手順序。
date: 2026-07-14
image: /images/data-flow.jpg
minRead: 6
author:
  name: Gary
  avatar:
    src: /images/selfie.webp
    alt: Gary
---

## 一句話區分

- **Skill** = 教 AI **怎麼做**（知識）
- **MCP** = 讓 AI **能連什麼**（工具／資料）
- **Hook** = 事件發生時**強制做什麼**（自動化）
- **Plugin** = 把以上**打包分發**（容器）

這四個是 AI coding agent（如 Claude Code）生態常見的擴充概念，各自處理不同層面的問題。

---

## Skill（技能）

一個資料夾，裡面放說明文件（`SKILL.md`）和腳本，教 AI「怎麼做某類任務」的最佳實踐，例如產生 Word 文件、處理 PDF。

本質是**給模型讀的知識／流程指引**，按需載入，不佔平時的 context。

```md
<!-- .claude/skills/review/SKILL.md -->
---
name: review
description: 執行程式碼審查，審 PR 時使用
---

審查步驟：
1. 檢查安全性問題
2. 檢查效能問題
```

放在 `.claude/skills/技能名/SKILL.md`（專案用）或 `~/.claude/skills/`（全域個人用）。用法：打 `/review`，或 Claude 依 `description` 自動判斷是否觸發。

### 小知識：跟 CLAUDE.md 有什麼不一樣？

`CLAUDE.md` 是 Claude Code 認得的保留檔名，放在專案根目錄（或 `~/.claude/CLAUDE.md` 全域）就會**每次對話自動載入**，不用像 Skill 一樣靠 `description` 判斷要不要觸發。兩者看起來都是「教 AI 怎麼做」，差別在載入時機，也因此決定了該放什麼內容：

| | CLAUDE.md | Skill |
|---|---|---|
| 何時載入 | 每次對話都自動載入 | 只有判斷跟任務相關才載入 |
| 該放什麼 | 不管做什麼任務都用得到的通用規矩 | 只有做「特定那類任務」才需要的詳細步驟 |
| 篇幅 | 要精簡，因為每次都佔 context | 可以很長很細，因為平常不佔位置 |

例如「commit message 要用什麼格式」「不要改 `generated/` 資料夾」這種不管做什麼任務都適用的規矩，放 CLAUDE.md；但「審查 PR 時要先查安全性、再查效能、輸出要照固定格式」這種只有做該任務才需要的詳細流程，放 Skill——不審查 PR 的時候，不需要讓這串步驟佔用 context。

---

## MCP（Model Context Protocol）

Anthropic 推出的開放協定，讓 AI 連接外部服務和資料（如 Gmail、Slack、資料庫）。MCP server 提供「工具」給模型呼叫，類似 AI 的 USB 標準接口。重點是**連外部系統、執行操作**。

```bash
# 最簡單的加法：用指令加
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
claude mcp add --transport stdio --env API_KEY=$KEY mytool -- npx -y some-mcp-server
```

團隊共享則在專案根目錄放 `.mcp.json`（進 git 管理），認證資訊改用環境變數：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

---

## Hook（鉤子）

在特定事件發生時自動觸發的腳本，例如「每次 AI 要執行指令前先檢查」、「檔案編輯後自動跑 lint」。是**確定性的自動化**，不靠模型判斷，用來強制執行規則或流程。

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

寫在 `.claude/settings.json`。常見事件：`PreToolUse`（執行前攔截檢查）、`PostToolUse`（執行後）、`Stop`（回合結束）等。

---

## Plugin（外掛）

打包上述東西的容器。一個 plugin 可以同時包含 skills、MCP servers、hooks、自訂指令等，方便一鍵安裝和分享整套設定。

```
my-plugin/
├── .claude-plugin/plugin.json   # 必要的 manifest
├── skills/xxx/SKILL.md
├── hooks/hooks.json
└── .mcp.json
```

開發測試用 `--plugin-dir ./my-plugin`，安裝用 `/plugin install 名稱@marketplace`，也可以推到 GitHub 讓隊友用 `/plugin install` 裝。

---

## 實際使用範例：PR 自動審查

假設想做一個功能：每次開 PR，AI 自動審查、把結果留言在 PR 上，重大問題還要擋下 merge。四個概念在這裡各司其職：

```
開 PR
  ↓
Hook（PreToolUse／CI 階段）：強制跑 lint、test，不合格直接擋下，不靠 AI 判斷
  ↓
Skill（review）：教 AI 審查標準——先查安全性，再查效能，用固定格式輸出結果
  ↓
MCP（GitHub）：AI 讀取 PR 的 diff 內容，並把審查結果留言回 PR、視結果標記 review 狀態
  ↓
Plugin（pr-reviewer）：把上面的 Skill + Hook + MCP 設定打包成一個 plugin，
                        推到團隊的 marketplace，其他人 `/plugin install pr-reviewer@team` 就能直接用
```

分工上很清楚：**Hook 負責「不管怎樣都要做」的硬規則**（跑 lint/test），**Skill 負責「AI 該怎麼判斷」的知識**（審查標準），**MCP 負責「AI 要連到哪裡拿資料、送結果」**（讀 diff、留言），**Plugin 則是把這一整套流程包起來方便分享**，讓團隊不用每個人各自重新設定一次。

---

## 建議上手順序

1. 先寫 **CLAUDE.md**（專案規則）
2. 重複的手順抽成 **Skill**
3. 「必須執行」的事寫成 **Hook**
4. 需要連外部服務才加 **MCP**
5. 要跨專案／團隊共享才打包成 **Plugin**

---

## 總結

| | 解決什麼問題 | 靠誰判斷 |
|---|---|---|
| Skill | AI 不知道怎麼做某類任務 | 模型自行判斷是否載入 |
| MCP | AI 連不到外部系統／資料 | 模型呼叫工具 |
| Hook | 某件事必須每次都發生，不能靠模型自由心證 | 事件觸發，確定性執行 |
| Plugin | 一整套設定要跨專案／團隊分享 | 安裝時打包帶走 |

功能更新很快，細節以官方文件為準：[code.claude.com/docs](https://code.claude.com/docs)
