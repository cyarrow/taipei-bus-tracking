import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tw.bustracker.taipei',
  appName: '台北公車到站',
  webDir: 'dist',
  plugins: {
    // 讓 fetch 走 Android 原生 HTTP，避免 WebView 的 CORS 限制
    CapacitorHttp: { enabled: true },
  },
};

export default config;
