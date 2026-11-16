// 修改 Capacitor 產生的 Android 專案：
// 1. 權限：定位（附近站牌、步行時間）、安裝套件（App 內更新）
// 2. 加入 ApkUpdater 原生外掛並在 MainActivity 註冊
// 3. 固定簽章：明確指定 repo 內的 keystore，新版 APK 才能覆蓋安裝
// 4. 版本號：versionCode 用 CI 的 build 編號，才能覆蓋安裝並判斷新舊
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const pkgDir = 'android/app/src/main/java/tw/bustracker/taipei';

// 1. 權限
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = readFileSync(manifestPath, 'utf8');
for (const p of [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.REQUEST_INSTALL_PACKAGES',
]) {
  if (!xml.includes(p)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}
writeFileSync(manifestPath, xml);

// 2. 原生外掛
copyFileSync('native/ApkUpdaterPlugin.java', `${pkgDir}/ApkUpdaterPlugin.java`);
writeFileSync(
  `${pkgDir}/MainActivity.java`,
  `package tw.bustracker.taipei;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
);

const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf8');

// 3. 固定簽章
if (!gradle.includes('signingConfigs')) {
  gradle = gradle
    .replace(
      /android \{/,
      `android {
    signingConfigs {
        fixed {
            storeFile rootProject.file('../signing/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`,
    )
    .replace(
      /buildTypes \{/,
      `buildTypes {
        debug {
            signingConfig signingConfigs.fixed
        }`,
    );
}

// 4. 版本號
const build = Number(process.env.BUILD_NUMBER ?? '1');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${build}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}.${build}"`);
writeFileSync(gradlePath, gradle);

console.log(`Android project patched (versionCode ${build}, versionName ${version}.${build})`);
