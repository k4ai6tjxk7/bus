# 改版前後比對工具

在 headless 瀏覽器裡跑 App 的使用流程，記下每個流程送出的 TDX 查詢和畫面結果，再比對兩個版本有沒有不一樣。畫面不變的重構用它確認行為沒變（見 CODING_STANDARDS.md 的 S10）。

- TDX 用假資料回應，時鐘也是假的，所以同一個版本每次跑的結果都一樣。
- 站名、路線、金鑰全部是假的，不會連到真的 TDX。
- 這不是 `node --test` 的一部分，需要另外安裝套件；網站上也不會發佈這個資料夾。

## 需要

- Python 3
- Playwright：`pip install playwright`，再執行 `playwright install chromium`
- 要用別的瀏覽器時，設環境變數 `CHROME=<執行檔路徑>`

## 用法

```sh
# 1. 把改版前的版本放到另一個資料夾
git worktree add ../bus-before main

# 2. 兩個版本各跑一次（群組可省略，省略就全跑）
python3 tools/compare/run.py ../bus-before tools/compare/out/before.json
python3 tools/compare/run.py .              tools/compare/out/after.json

# 3. 比對
python3 tools/compare/diff.py tools/compare/out/before.json tools/compare/out/after.json
```

只跑某一群流程時，在最後加上群組名稱：

| 群組 | 內容 |
|---|---|
| `route` | 找路線：重找、新增組合、換轉乘站、找轉乘站 |
| `update` | 到站更新：倒數（含跨過 3 分鐘時交給 3D 場景）、切段、切換組合、閒置、離開後回來、錯誤、示範資料 |
| `usage` | 使用習慣：自動選組合、停留 20 秒才記、刪除與清除 |
| `style` | 畫面風格：開啟時就是別款、看板上換風格（扣秒、只留一個畫布）、風格檔載入失敗、畫法出錯後換回別款 |
| `theme` | 深淺色：手動深色開 App 第一眼就是深色、設定頁切換（不重建場景、不多查 API）、自動跟系統／手動不跟 |

`diff.py` 完全一樣時結束代碼是 0，有差異或 JS 錯誤時是 1。`out/` 已經被 `.gitignore` 擋住，結果不會進 repo。

## 加新流程

流程寫在 `run.py` 的 `FLOWS`，每個流程包含：組合、目前組合、步驟，以及可省略的「到站查詢失敗」和「其他 localStorage」。修 Bug 時加一個能重現它的流程，先在修之前的版本確認它跑得出 Bug，再修。
