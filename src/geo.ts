import { AppLauncher } from '@capacitor/app-launcher';

export interface LatLon {
  lat: number;
  lon: number;
}

/** 取得目前位置（1 分鐘內的快取可接受） */
export function getLocation(timeout = 10_000): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('此裝置不支援定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) =>
        reject(
          new Error(e.code === e.PERMISSION_DENIED ? '未允許定位權限' : '無法取得目前位置'),
        ),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout },
    );
  });
}

/** 兩點直線距離（公尺） */
export function distanceM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 粗估步行分鐘數：直線距離 × 1.3（街道繞路係數）÷ 每分鐘 75 公尺
 */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round((meters * 1.3) / 75));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} 公尺` : `${(m / 1000).toFixed(1)} 公里`;
}

/** 用 Google Maps 開啟步行導航 */
export async function openWalkingNav(dest: LatLon) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lon}&travelmode=walking`;
  try {
    await AppLauncher.openUrl({ url });
  } catch {
    window.open(url, '_blank');
  }
}
