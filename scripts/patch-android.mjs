// 在 Capacitor 產生的 AndroidManifest.xml 加入定位權限（附近站牌、步行時間用）
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'android/app/src/main/AndroidManifest.xml';
let xml = readFileSync(path, 'utf8');
const perms = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];
for (const p of perms) {
  if (!xml.includes(p)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}
writeFileSync(path, xml);
console.log('AndroidManifest patched with location permissions');
