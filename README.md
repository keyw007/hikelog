# 登山行程紀錄（PWA 原型）

> 整個工具組（App、行程圖產生器、計劃書腳本、試算表）的說明請看 [docs/總覽.md](docs/總覽.md)；用 Claude Code 開發請看 [CLAUDE.md](CLAUDE.md)。

離線可用的登山時間紀錄 App。資料存在手機本機，山區無網路照常記錄。

## 部署到 GitHub Pages（約 5 分鐘，免費）

1. 登入 GitHub → 右上角「+」→ **New repository**，名稱例如 `hikelog`，選 **Public**，建立。
2. 在 repository 頁面按 **Add file → Upload files**，把這個資料夾裡的全部檔案拖進去（index.html、sw.js、manifest.webmanifest、三個 icon），按 **Commit changes**。
3. 進 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`，按 **Save**。
4. 約 1 分鐘後網址會出現：`https://你的帳號.github.io/hikelog/`

## 安裝到 iPhone

1. 用 **Safari** 打開上面的網址（一定要 Safari）。
2. 按下方「分享」→ **加入主畫面**。
3. 之後從主畫面圖示開啟。**第一次開啟要在有網路的地方**，之後就能離線使用。

> 一定要從主畫面圖示使用。直接用 Safari 分頁開，資料可能在一段時間沒用後被系統清除。

Android：用 Chrome 開網址 → 選單 →「安裝應用程式」。

## 使用方式

- 登山口按 **記錄出發** → 到每個點按 **記錄抵達** → 要走時按 **記錄離開**。
- 按完會出現「命名」「復原」，按錯可以馬上復原。
- 點任何一站可以改名稱、備註、手動修正時間（忘記按時很好用）。
- 多天行程的時間會顯示 D2、D3。營地過夜計入休息時間。
- 「⋯」可以匯出 CSV 或直接複製表格貼到 Excel／Google 試算表／Notion。

## 計算方式

| 項目 | 算法 |
|---|---|
| 各站休息 | 該站離開 − 該站抵達 |
| 路段行走 | 本站抵達 − 上一站離開 |
| 累積經過 | 最後時間（進行中為現在）− 出發時間 |
| 累積休息 | 各站休息加總（含正在休息的這一站） |
| 實際行走 | 累積經過 − 累積休息 |

## 備份

列表頁「備份全部（JSON）」→ 存到檔案或傳給自己。換手機時用「從備份還原」。
雲端同步（Firebase）是下一階段。

## 更新 App

修改 index.html 後，把 `sw.js` 第一行的 `VERSION` 改成新值（例如 `hikelog-v2`）再上傳，手機下次連網開啟就會更新。
