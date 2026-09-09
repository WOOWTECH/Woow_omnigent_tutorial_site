# Woow Omnigent 完整指南

WoowTech 製作的 Omnigent 繁體中文教學站，22 章 + 3 附錄，中英雙語。

- **正體中文**：https://omnigent-guide.woowtech.io/
- **English**：https://omnigent-guide.woowtech.io/en/

## 這本書在教什麼

Omnigent 是一個 meta-harness：它不自己當 AI，而是把 pi、Claude Code、Codex 等不同代理，
與散在各處的機器，收攏到同一個介面下指揮。

本書以**終端使用者**為主要讀者——假設服務已經架好，第 1 章從登入畫面開始，
不從安裝講起。自架的三種部署方式收在第五部與附錄 A。

| 分部 | 章次 | 內容 |
|---|---|---|
| 第一部 · 先把它用起來 | 1–5 | 定位、登入、四個核心名詞、第一個 Session、Composer |
| 第二部 · 把工作交出去 | 6–10 | Host/Harness 選擇、Workspace、Project、Inbox、Automations |
| 第三部 · 多人、成本與治理 | 11–14 | 成員邀請、Policy、Usage 判讀、安全基線 |
| 第四部 · 接上你自己的機器 | 15–18 | Runner 概念、註冊主機、Harness 生態、疑難排解 |
| 第五部 · 自己架一台 | 19–22 | 部署決策、HA 附加元件、Rootless Podman、k3s Helm |
| 附錄 | A–C | 安裝速查、疑難排解全集、中英名詞對照 |

## 版本基準

以 **Home Assistant 附加元件** 的版本為準；其他部署方式的版本差異在各章明列。
三個部署套件的實際版本存在漂移，逐章的固定來源以
[`docs/research/source-lock.json`](docs/research/source-lock.json) 的 exact commit 為準。

## 安全聲明

**本書所有帳號、密碼、權杖皆為示範用佔位值。**
`data/content-rules.json` 把實際憑證字串列為禁用詞，`scripts/check_sensitive.js`
會在 CI 阻擋任何把真實憑證寫進內容的提交。

## 站內結構

```
chapters.json          全站唯一事實來源（章節順序、標題、SEO 文案、分部）
ch*.html               22 章正文（作者只寫 <section>，其餘由 build_nav.js 生成）
appendix_*.html        3 篇附錄
en/                    英文鏡像站根，由 scripts/mirror_locale.js 產生
i18n/                  翻譯政策、詞彙表與 ledger
data/content-rules.json  禁用詞與語氣規則
docs/research/source-lock.json  固定來源（每筆釘 commit 與可用章節範圍）
scripts/               建置與檢查工具
assets/og/             1200×630 分享卡（每語系一張）
```

## 開發

```bash
npm ci
npm run check        # build_nav --check + check_links + check_content + check_sensitive
npm run check:i18n   # 雙語系導覽、連結與翻譯閘門
node scripts/build_nav.js          # 重新生成導覽、分頁器、sitemap、首頁目錄
SITE_ROOT=en node scripts/build_nav.js
node scripts/build_og.js           # 補產缺少的分享卡
```

### 房規（由 CI 強制）

- 每章 **8–12** 個 `<section id data-nav>`
- `steps` 區塊必須是 `<ol class="steps">` 且至少 **4** 步
- `troubleshoot` 區塊至少 **4** 個頂層清單項
- `sources` 區塊至少一個 source-lock 允許用於該章的 **exact commit** 連結
- 每章至少 **4** 則 `<details class="faq">`

## 授權

內容採 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.zh-hant)。
Omnigent、Home Assistant、Kubernetes 等名稱與商標屬各自權利人，本站與其無隸屬關係。
