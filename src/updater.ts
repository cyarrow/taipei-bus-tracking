import { App } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { readJson, writeJson } from './storage';

const REPO = 'cyarrow/taipei-bus-tracking';
const KEY_TOKEN = 'github.token';
const KEY_LAST_CHECK = 'update.lastCheck';
const CHECK_INTERVAL = 3 * 3600 * 1000;

interface ApkUpdaterPlugin {
  canInstall(): Promise<{ value: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(opts: { url: string; token?: string }): Promise<void>;
  addListener(
    event: 'progress',
    cb: (e: { percent: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

export interface UpdateInfo {
  build: number;
  name: string;
  notes: string;
  assetUrl: string;
  publishedAt: string;
}

export class UpdateError extends Error {}

export const loadGithubToken = () => readJson<string>(KEY_TOKEN, '');
export const saveGithubToken = (t: string) => writeJson(KEY_TOKEN, t);

export const isNative = () => Capacitor.isNativePlatform();

/** 目前安裝的版本（versionCode 與版本名稱） */
export async function currentVersion(): Promise<{ build: number; name: string }> {
  if (!isNative()) return { build: 0, name: '網頁版' };
  const info = await App.getInfo();
  return { build: Number(info.build) || 0, name: info.version };
}

interface ReleaseJson {
  tag_name: string;
  name: string;
  body?: string;
  published_at: string;
  assets: { name: string; url: string }[];
}

/** 查詢 GitHub 上最新一版（公開 repo 不需要權杖；有設定權杖時一併帶上） */
export async function fetchLatestRelease(token = loadGithubToken()): Promise<UpdateInfo> {
  let res: Response;
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers });
  } catch {
    throw new UpdateError('無法連線到 GitHub');
  }
  if (res.status === 401) throw new UpdateError('GitHub 權杖無效或已過期');
  if (res.status === 403) throw new UpdateError('GitHub 查詢次數已達上限，請稍後再試');
  if (res.status === 404) throw new UpdateError('找不到版本資料');
  if (!res.ok) throw new UpdateError(`GitHub 回應錯誤（${res.status}）`);
  const r = (await res.json()) as ReleaseJson;
  const build = Number(r.tag_name.replace(/^build-/, ''));
  const asset = r.assets.find((a) => a.name.endsWith('.apk'));
  if (!build || !asset) throw new UpdateError('最新版本沒有 APK 檔');
  return {
    build,
    name: r.name,
    notes: (r.body ?? '').trim(),
    assetUrl: asset.url,
    publishedAt: r.published_at,
  };
}

/** 若有比目前更新的版本則回傳；force=false 時 3 小時內只檢查一次 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | undefined> {
  if (!isNative()) return undefined;
  const last = readJson<number>(KEY_LAST_CHECK, 0);
  if (!force && Date.now() - last < CHECK_INTERVAL) return undefined;
  const [latest, cur] = await Promise.all([fetchLatestRelease(), currentVersion()]);
  writeJson(KEY_LAST_CHECK, Date.now());
  return latest.build > cur.build ? latest : undefined;
}

export type InstallResult = 'started' | 'need-permission';

/** 下載並開啟安裝畫面；沒有「安裝不明應用程式」權限時先開設定頁 */
export async function installUpdate(
  info: UpdateInfo,
  onProgress: (percent: number) => void,
): Promise<InstallResult> {
  const { value } = await ApkUpdater.canInstall();
  if (!value) {
    await ApkUpdater.openInstallSettings();
    return 'need-permission';
  }
  const handle = await ApkUpdater.addListener('progress', (e) => onProgress(e.percent));
  try {
    await ApkUpdater.downloadAndInstall({
      url: info.assetUrl,
      token: loadGithubToken() || undefined,
    });
    return 'started';
  } catch (e) {
    throw new UpdateError(e instanceof Error ? e.message : '下載失敗');
  } finally {
    handle.remove();
  }
}
