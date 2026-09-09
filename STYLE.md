# 房規 — Woow Omnigent 完整指南

## 讀者與語氣

讀者是**終端使用者**，服務已經架好。不要從安裝講起，不要假設讀者懂 Kubernetes。
用「你」不用「您」（`forbidPoliteYou: true`，CI 會擋）。
技術名詞第一次出現寫成「中文（English）」，之後只用中文。

## 章節骨架

作者只寫 `<section>`。`<head>`、側邊欄、`chapter-header`、分頁器、頁尾由
`scripts/build_nav.js` 生成，**不要手改生成區塊**。

```html
<section id="why" data-nav="為何需要本章"><h2 data-icon="why">…</h2></section>
<section id="concepts" data-nav="核心觀念"><h2 data-icon="concept">…</h2></section>
<section id="prep" data-nav="開始之前"><h2 data-icon="plan">…</h2></section>
<section id="steps" data-nav="操作步驟"><h2 data-icon="steps">…</h2>
  <ol class="steps"><li><h3>…</h3>…</li></ol></section>
<section id="verify" data-nav="怎麼確認做對了"><h2 data-icon="test">…</h2></section>
<section id="troubleshoot" data-nav="故障排除"><h2 data-icon="troubleshoot">…</h2>
  <ul><li><strong>徵狀</strong>：…</li></ul></section>
<section id="sources" data-nav="固定來源"><h2 data-icon="url">…</h2></section>
<section id="faq" data-nav="常見問題"><h2 data-icon="faq">…</h2>
  <details class="faq"><summary>…</summary><div class="body">…</div></details></section>
```

## 硬性閘門（CI 會擋）

| 規則 | 由誰檢查 |
|---|---|
| 每章 8–12 個 section | `check_content.js` |
| `steps` ≥ 4 步且為 `<ol class="steps">` | `check_content.js` |
| `troubleshoot` ≥ 4 個頂層清單項 | `check_content.js` |
| `sources` 含該章允許的 exact commit 連結 | `check_content.js` + `source-lock.json` |
| 每章 ≥ 4 則 FAQ | `check_links.js` |
| 不得出現真實憑證 | `check_sensitive.js` + `content-rules.json` |
| 站內連結、錨點、sitemap 一致 | `check_links.js` |

## 允許的元件

- `div.callout`、`div.callout.terminology`、`div.callout.warning`
- `div.table-scroll[role=region][tabindex=0][aria-label]` 包住每一個 `table.data-table`
- `ol.steps`、`details.faq > div.body`
- `figure.shot` 放標註截圖

## data-icon 詞彙

`why` `concept` `plan` `steps` `test` `integration` `security` `troubleshoot` `url` `faq`

用到新值必須先在 `assets/css/style.css` 定義。

## 憑證與敏感資料

**永遠用佔位值**：`<your-password>`、`你的密碼`、`CHANGE_ME`。
不要寫任何一組真實可登入的帳密，即使它已經出現在別的倉庫裡。
截圖前先確認畫面上沒有真實權杖、Session 內容或成員個資。

## 固定來源

每章的 `sources` 區塊必須連到 `docs/research/source-lock.json` 裡、
`allowedChapterNumbers` 包含該章的 `exactCommitUrl`。
版本說法一律以那個 commit 的內容為準，不要引用 `main` 分支的當下狀態。
