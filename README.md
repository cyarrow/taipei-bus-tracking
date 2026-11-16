# 台北公車到站

簡單的 Android App，查詢你常用站牌的公車預估到站時間（資料來源：交通部 TDX 平臺）。

## 功能
- 搜尋路線（同時查台北市、新北市），選方向、選站牌加入「我的站牌」
- 首頁列出所有我的站牌的到站時間，每 30 秒自動更新
- 顏色提示：紅色＝進站中、橘色＝3 分鐘內、綠色＝一般、灰色＝未發車／末班已過等
- 不需要伺服器，App 直接呼叫 TDX；金鑰只存在手機上

## 安裝 APK
1. 到 GitHub 的 **Actions** 頁籤 → 點最新一次成功的「Build APK」
2. 在頁面下方 **Artifacts** 下載 `taipei-bus-apk`（是 zip，解壓後得到 `.apk`）
3. 把 APK 傳到手機安裝（需允許「安裝未知來源的應用程式」）
4. 第一次開啟，輸入 TDX 的 Client ID / Client Secret

### 申請 TDX 金鑰
1. 到 https://tdx.transportdata.tw 註冊會員
2. 會員中心 → 資料服務 → API 金鑰，取得 Client ID 與 Client Secret

## 開發
```bash
npm install
npm run dev      # 在瀏覽器開發（注意：瀏覽器可能因 CORS 擋掉 TDX 請求，實機上走原生 HTTP 不受影響）
npm run build    # 型別檢查＋打包網頁
```

本機自己編譯 APK（需安裝 Android Studio / Android SDK、JDK 21）：
```bash
npm run build
npx cap add android   # 只需第一次
npx cap sync android
cd android && ./gradlew assembleDebug
```

## 技術
React + TypeScript + Vite，以 Capacitor 包成 Android App。
`signing/debug.keystore` 是固定的 debug 簽章（密碼 `android`），只用於自用安裝，讓新版 APK 能覆蓋舊版。
