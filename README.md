# 台北公車到站

簡單的 Android App，查詢你常用站牌的公車預估到站時間（資料來源：交通部 TDX 平臺）。

## 功能
- 搜尋路線（同時查台北市、新北市，可用路線號碼或起訖站名），選方向、選站牌加入「我的站牌」
- 首頁列出所有我的站牌的到站時間，每 30 秒自動更新；同一站的多條路線合併成一張卡片
- 分組（例如上學／回家），可設定時段自動切換
- 路線動態：整條路線的到站時間、公車位置、「最近一班還有幾站」，可切換地圖檢視
- 附近站牌：依 GPS 列出附近站位與經過路線的到站時間
- 步行時間與建議出門時間（以直線距離粗估），一鍵用 Google Maps 導航到站牌
- 顏色提示：紅色＝進站中、橘色＝3 分鐘內、綠色＝一般、灰色＝未發車／末班已過等
- 不需要伺服器，App 直接呼叫 TDX；金鑰只存在手機上
- 地圖使用 OpenStreetMap（Leaflet），免金鑰

## 安裝 APK
1. 到 GitHub 的 **Releases** 下載最新版的 `taipei-bus.apk`
2. 在手機上安裝（需允許「安裝未知來源的應用程式」）
3. 第一次開啟，輸入 TDX 的 Client ID / Client Secret

之後 App 會自動檢查新版本，在首頁按「更新」即可在 App 內下載安裝。

### 申請 TDX 金鑰
1. 到 https://tdx.transportdata.tw 註冊會員
2. 會員中心 → 資料服務 → API 金鑰，取得 Client ID 與 Client Secret

## 開發
```bash
npm install
npm run dev      # 在瀏覽器開發（注意：瀏覽器可能因 CORS 擋掉 TDX 請求，實機上走原生 HTTP 不受影響）
npm run build    # 型別檢查＋打包網頁
```

本機自己編譯 APK（需安裝 Android Studio / Android SDK、JDK 21；使用預設 debug 簽章，無法覆蓋安裝 CI 版本）：
```bash
npm run build
npx cap add android   # 只需第一次
node scripts/patch-android.mjs
npx cap sync android
cd android && ./gradlew assembleDebug
```

## 發佈流程
每次 push，GitHub Actions 會：
1. 用 Secret `ANDROID_SIGNING_PASSWORD` 解密 `signing/release.keystore.enc`（固定簽章，新版才能覆蓋安裝）
2. 產生 Android 專案並套用 `scripts/patch-android.mjs`（權限、原生更新外掛、版本號＝build 編號）
3. 編譯 APK、確認簽章正確，發佈到 GitHub Releases（`build-N`）

## 技術
React + TypeScript + Vite，以 Capacitor 包成 Android App。
