# hikelog — 登山行程工具

郁文（Nick）個人的登山工具組。他是登山嚮導與初嚮訓練總教官，工具用於一般登山、百岳、日本登山、長程健行與嚮導帶隊。所有介面文字、說明、commit message 用**繁體中文**（台灣用語）。

## 這個 repo 有什麼

| 路徑 | 內容 |
|---|---|
| `index.html` | 登山行程紀錄 App（PWA，單一檔案、vanilla JS、資料存 localStorage） |
| `sw.js` | Service Worker 離線快取 |
| `manifest.webmanifest`、`icon-*.png` | 安裝到主畫面用 |
| `itinerary.html` | 行程圖產生器：貼上試算表每日頁 → 產生計劃書附件二格式的 PNG（html2canvas 1.4.1，cdnjs） |
| `apps-script/計劃書.gs` | 計劃書產生器（Google Apps Script，綁在試算表上）→ 產生 Google 文件＋Word |
| `apps-script/.clasp-*.json`、`push-all.sh` | 用 clasp 把腳本推到各試算表 |
| `tools/gpx-import/` | GPX → 每日頁資料的 Python 參考實作（嘉明湖・新康橫斷那次用的） |
| `docs/總覽.md` | 給使用者看的總覽：所有連結、用法、後續計畫 |

部署：GitHub Pages（main 分支根目錄）。App：https://keyw007.github.io/hikelog/ ，產生器：https://keyw007.github.io/hikelog/itinerary.html 。推上 main 約 1 分鐘生效。

## 改版規則（一定要做）

### App（index.html）
1. 改 `index.html` 的 `APP_VERSION`，並在 `CHANGELOG` 陣列**最前面**加一筆 `{v, date, items:[…]}`。
2. 同時把 `sw.js` 第一行的 `VERSION` 改成 `hikelog-v<同版號>`，否則手機不會更新。
3. 資料格式（localStorage 裡的行程結構）要向下相容；改結構時寫遷移程式，不能讓舊紀錄打不開。使用者在山上離線使用，資料遺失無法補救。
4. 介面以 iPhone、單手、戴手套操作為前提：按鈕大、對比高；有夜間紅光模式與大字模式。

### 行程圖產生器（itinerary.html）
- 依「標題文字開頭」找欄位（`col('預計抵達')` 這種），不要寫死欄位位置；新舊版試算表都要能貼。
- 圖寬要能放進 Word A4 直式一頁。

### 計劃書腳本（apps-script/計劃書.gs）
- 改完把 `PLAN_VERSION` 與檔頭的「版本」一起改。
- 只能用 Apps Script 真的存在的 API。注意 `Paragraph.setText()` 回傳 void，不能鏈式呼叫。
- 讀資料一律 `getDisplayValues()`，依 A 欄名稱或標題列文字找位置。
- 推到試算表：`./apps-script/push-all.sh`（需要先 `clasp login`，並在 https://script.google.com/home/usersettings 開啟 Apps Script API）。會推到下表兩個專案；推完到試算表重新整理，選單「計劃書 → 產生計劃書」測試。

### Commit
- 訊息用繁體中文，第一行簡述改了什麼。

## Google 試算表（在使用者的 Google 雲端硬碟，未公開分享）

| 用途 | 試算表 ID | Apps Script 專案 ID |
|---|---|---|
| 空白範本（新行程都從這份「建立副本」） | `1kWIf83NgfNwnDB1QXUDm6YaKybGq8SnDzYM0cNZbg74` | `1WJotsAF4uxhfmfaWGUfUFVaKCL3Ngl6Pm4f__kip8aFixr9Rt_Tf4-PX` |
| 嘉明湖・新康橫斷（GPX 匯入，含完整計劃書資料，拿來測試） | `1-n-RFUMWCFbHQ6qsmtVZmUpLS4guEVJNpEZ4pKNOJMc` | `1NEUjR2LtIrwVQnrveXhmPBamjyUID5E6jsjQlTvuQr804fGeapIb_OSo` |
| 嘉明湖・新康橫斷（示範，舊版，沒有計劃書分頁） | `1NS5-1KR3DGA8SLiV7mybRYACs15b-KCPN75CdEa-D4M` | — |

改試算表結構時，**範本和 GPX 匯入版要一起改**（示範版至少改每日頁與時間參數）。改完用 GPX 匯入版驗證：總覽每天抵達時間應為 D1 14:15、D2 17:06、D3 16:15、D4 17:27、D5 16:17；費用每人合計 3810；公裝每人背負重量依成員順序為 1235、815、1065、1105、523、605。
注意：GPX 匯入版 D2 的 E15:E22、示範版 D2 的 E17:E22 是手動填的速度係數 0.8（蓋過公式），改 E 欄公式時不要覆蓋。

### 分頁
使用說明、設定、時間參數、總覽、D0～D5、計劃書資料、成員、費用、公裝、公裝分工、公裝清單、伙食、裝備清單、固定內容。

### 每日頁（D0、D1…）
- 第 1 列：A1「天數」B1 天數；C1「日期」D1 公式；E1「日出」F1；G1「日落」H1；I1「當日速度係數」J1；K1「負重」L1；M1「出發時間」N1。
- 第 2 列：A2「路線」，C2 路線文字。
- 第 3、4 列：小計標題與數值（A 行走、B 休息〔含停留欄〕、C 行動時間、D 抵達、E 距離、F 爬升、G 下降、H 路線常數、I 消耗、J 失水、K 午餐、L 行動糧、M 碳水、N 行動糧重、O 需水、P 日落前餘裕）。
- 第 5 列：欄位標題；第 6～45 列：資料；第 47 列 A47「備註」、C47 內容。
- 資料欄：A 類型（行走／休息／營地／交通）、B 地點、C 預計抵達、D 上河時間、E 速度係數、F 自訂時間、G 花費時間、H 距離、I 爬升、J 下降、K 海拔、L 座標系、M/N 輸入座標、O/P TWD97、Q/R WGS84、S 地圖、T 水源、U 通訊點、V 營地、W 撤退點、X 備註、Y 關門時間、Z 估算時間（GPX）、AA 實際紀錄、AB 停留、AC 出發時間、AD 地形條件、AE 地形估算、AF 上坡 %、AG 下坡 %。
- 花費時間順序：自訂 → 上河×係數 → 地形估算 → GPX 估算×係數。
- 預計抵達 = max(出發時間, 前面各列的抵達與出發) ＋ 花費時間。

### 其他分頁重點
- 設定：B4 行程名稱、B5 D0 日期、B6 體重、B7 負重、B8 預設速度係數、B9 碳水 g/h、B10 補給比例、B11 補水比例、B12 午餐麵包 kcal、B13 麵包密度；第 17～21 列行動糧類別。
- 時間參數：B4 並行係數 k（預設 0.5）；第 7 列起地形條件（A 名稱、B 平地 km/h、C 上坡 m/h、D 下坡 m/h）。
- 總覽：第 4～9 列 D0～D5（A 工作表…R 路線），第 10 列合計；「沿途重點」表 A25:E30（水源、營地、通訊點、撤退點，空的顯示「—」）。
- 計劃書資料：A 欄是名稱（腳本依名稱讀，不能改名），B 值，C 說明；底部「每日撤退方案」表。
- 公裝：A 品項、B 數目、C 單重、D 提供者（可多人，用「、」分隔）、E 起成員名字（由成員頁自動帶入）、M 備註；第 30 列每人背負重量。
- 公裝分工：每人自己帶／幫別人背（附提供者）／交給別人背／背負重量，全部公式。

## 座標與估算公式
- TWD97 ↔ WGS84：TM2，中央經線 121°，k0 = 0.9999，假東 250000。
- TWD67 → TWD97：x+807.8+0.00001549x+0.000006521y、y−248.6+0.00001549y+0.000006521x（誤差約 1～3 m）。
- 路線常數（山本正嘉）：1.8×時間 h＋0.3×km＋10×爬升 km＋0.6×下降 km；消耗 kcal＝（體重＋負重）×路線常數。
- GPX 估算：Tobler v = 6·exp(−3.5|s+0.05|) km/h，再用當天有上河時間的路段校正係數。
- 地形估算（Naismith）：平地時間＝km÷平地速度；坡度時間＝爬升÷上坡速度＋下降÷下坡速度；估算＝較大者＋k×較小者。

## 後續計畫
1. 使用者實際上山測試 App → 修正 → v1.0（資料格式定案）。
2. Firebase 同步（Spark 免費方案、Google 登入、離線照常記錄）。
3. 隊伍共享（隊伍代碼、領隊／隊員權限、QR Code 離線交換）。
4. 之後再考慮：App 內計畫時間對照（現場顯示超前／落後）、匯入試算表行程。

## 安全與隱私
- 計劃書含成員電話與緊急聯絡人（使用者決定保留，只給領隊、留守人、隊員）。不要把成員資料、MapShare 密碼放進 repo 或任何公開檔案。
- repo 是公開的。
