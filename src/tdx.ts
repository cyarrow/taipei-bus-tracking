import { loadCredentials, readJson, writeJson } from './storage';
import type {
  BusGps,
  BusPosition,
  City,
  Credentials,
  Eta,
  RouteInfo,
  Shape,
  Station,
  StopOfRoute,
} from './types';

const AUTH_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const API_BASE = 'https://tdx.transportdata.tw/api/basic';
const KEY_TOKEN = 'tdx.token';

export class TdxError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
  clientId: string;
}

async function requestToken(creds: Credentials): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  let res: Response;
  try {
    res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    throw new TdxError('無法連線到 TDX，請確認網路連線');
  }
  if (!res.ok) {
    throw new TdxError('TDX 金鑰驗證失敗，請確認 Client ID / Secret 是否正確', res.status);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  const cached: CachedToken = {
    token: data.access_token,
    // 提早 5 分鐘視為過期
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    clientId: creds.clientId,
  };
  writeJson(KEY_TOKEN, cached);
  return cached;
}

let tokenRequest: Promise<CachedToken> | undefined;

async function getToken(force = false): Promise<string> {
  const creds = loadCredentials();
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new TdxError('尚未設定 TDX 金鑰，請到「設定」輸入');
  }
  const cached = readJson<CachedToken | null>(KEY_TOKEN, null);
  if (!force && cached && cached.clientId === creds.clientId && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  // 多個請求同時需要 token 時，只送一次
  tokenRequest ??= requestToken(creds).finally(() => {
    tokenRequest = undefined;
  });
  return (await tokenRequest).token;
}

/** 用指定金鑰測試能否取得 token */
export async function testCredentials(creds: Credentials): Promise<void> {
  await requestToken(creds);
}

// ---- 請求排隊：TDX 免費會員有每秒查詢次數限制，所有請求依序送出 ----
const MIN_INTERVAL_MS = 250; // 每秒最多約 4 次
const MAX_CONCURRENT = 2;
let active = 0;
let lastStart = 0;
const waiting: (() => void)[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquire(): Promise<void> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((r) => waiting.push(r));
  }
  active++;
  const wait = lastStart + MIN_INTERVAL_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_INTERVAL_MS);
  if (wait > 0) await sleep(wait);
}

function release() {
  active--;
  waiting.shift()?.();
}

// ---- 快取與合併相同請求 ----
interface CacheEntry {
  at: number;
  data: unknown;
}
const memCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const PERSIST_PREFIX = 'tdxcache:';

interface GetOptions {
  /** 快取秒數；0 表示不快取 */
  ttl?: number;
  /** 是否同時存到手機（App 重開後仍可用），適合不常變動的資料 */
  persist?: boolean;
}

function readCache<T>(key: string, ttl: number, persist: boolean): T | undefined {
  const now = Date.now();
  const m = memCache.get(key);
  if (m && now - m.at < ttl * 1000) return m.data as T;
  if (persist) {
    const p = readJson<CacheEntry | null>(PERSIST_PREFIX + key, null);
    if (p && now - p.at < ttl * 1000) {
      memCache.set(key, p);
      return p.data as T;
    }
  }
  return undefined;
}

function writeCache(key: string, data: unknown, persist: boolean) {
  const entry = { at: Date.now(), data };
  memCache.set(key, entry);
  if (persist) writeJson(PERSIST_PREFIX + key, entry);
}

async function apiGet<T>(path: string, opts: GetOptions = {}): Promise<T> {
  const { ttl = 0, persist = false } = opts;
  if (ttl > 0) {
    const hit = readCache<T>(path, ttl, persist);
    if (hit !== undefined) return hit;
  }
  const pending = inFlight.get(path);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    const data = await requestWithRetry<T>(path);
    if (ttl > 0) writeCache(path, data, persist);
    return data;
  })();
  inFlight.set(path, p);
  try {
    return await p;
  } finally {
    inFlight.delete(path);
  }
}

async function requestWithRetry<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  let authRetried = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken();
    await acquire();
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}${sep}%24format=JSON`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch {
      throw new TdxError('無法連線到 TDX，請確認網路連線');
    } finally {
      release();
    }
    if (res.status === 401 && !authRetried) {
      authRetried = true;
      await getToken(true);
      continue;
    }
    if (res.status === 429) {
      if (attempt < 4) {
        // 依 Retry-After 或指數退避等待後重試
        const ra = Number(res.headers.get('Retry-After'));
        await sleep(ra > 0 ? ra * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new TdxError('TDX 查詢太頻繁，請稍後再試', 429);
    }
    if (res.status === 404) {
      return [] as unknown as T;
    }
    if (!res.ok) {
      throw new TdxError(`TDX 回應錯誤（${res.status}）`, res.status);
    }
    return (await res.json()) as T;
  }
}

const enc = (s: string) => encodeURIComponent(s);

/** 查詢路線的所有站牌（依方向、子路線分組）。只保留名稱完全相同的路線。 */
export async function fetchStopsOfRoute(city: City, routeName: string): Promise<StopOfRoute[]> {
  const list = await apiGet<StopOfRoute[]>(
    `/v2/Bus/StopOfRoute/City/${city}/${enc(routeName)}`,
    { ttl: 24 * 3600, persist: true },
  );
  return list.filter((r) => r.RouteName.Zh_tw === routeName);
}

/** 查詢路線所有站牌的預估到站時間 */
export async function fetchEta(city: City, routeName: string): Promise<Eta[]> {
  const list = await apiGet<Eta[]>(
    `/v2/Bus/EstimatedTimeOfArrival/City/${city}/${enc(routeName)}`,
    { ttl: 15 },
  );
  return list.filter((e) => e.RouteName.Zh_tw === routeName);
}

/** 查詢路線上每台公車目前所在的站 */
export async function fetchBusPositions(city: City, routeName: string): Promise<BusPosition[]> {
  const list = await apiGet<BusPosition[]>(
    `/v2/Bus/RealTimeNearStop/City/${city}/${enc(routeName)}`,
    { ttl: 15 },
  );
  return list.filter((b) => b.RouteName.Zh_tw === routeName);
}

const KEY_ROUTE_INDEX = 'routeIndex.v1';
const ROUTE_INDEX_TTL = 7 * 24 * 3600 * 1000;

interface RouteRow {
  RouteUID: string;
  RouteName: { Zh_tw: string };
  DepartureStopNameZh?: string;
  DestinationStopNameZh?: string;
}

/** 台北＋新北所有路線清單，快取 7 天 */
export async function fetchRouteIndex(): Promise<RouteInfo[]> {
  const cached = readJson<{ at: number; routes: RouteInfo[] } | null>(KEY_ROUTE_INDEX, null);
  if (cached && Date.now() - cached.at < ROUTE_INDEX_TTL && cached.routes.length) {
    return cached.routes;
  }
  const cities: City[] = ['Taipei', 'NewTaipei'];
  const lists = await Promise.all(
    cities.map(async (city) => {
      const rows = await apiGet<RouteRow[]>(
        `/v2/Bus/Route/City/${city}?%24select=RouteUID,RouteName,DepartureStopNameZh,DestinationStopNameZh`,
      );
      return rows.map<RouteInfo>((r) => ({
        city,
        routeUID: r.RouteUID,
        routeName: r.RouteName.Zh_tw,
        departure: r.DepartureStopNameZh ?? '',
        destination: r.DestinationStopNameZh ?? '',
      }));
    }),
  );
  const routes = lists.flat();
  writeJson(KEY_ROUTE_INDEX, { at: Date.now(), routes });
  return routes;
}

/** 依關鍵字找路線：路線名稱完全符合 > 開頭符合 > 包含 > 起訖站名包含 */
export function matchRoutes(index: RouteInfo[], query: string, limit = 40): RouteInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { r: RouteInfo; score: number }[] = [];
  for (const r of index) {
    const name = r.routeName.toLowerCase();
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (r.departure.includes(query.trim()) || r.destination.includes(query.trim())) score = 3;
    if (score >= 0) scored.push({ r, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.r.routeName.length - b.r.routeName.length ||
      a.r.routeName.localeCompare(b.r.routeName, 'zh-Hant', { numeric: true }),
  );
  return scored.slice(0, limit).map((x) => x.r);
}

/** 公車 GPS 位置 */
export async function fetchBusGps(city: City, routeName: string): Promise<BusGps[]> {
  const list = await apiGet<BusGps[]>(
    `/v2/Bus/RealTimeByFrequency/City/${city}/${enc(routeName)}`,
    { ttl: 15 },
  );
  return list.filter((b) => b.RouteName.Zh_tw === routeName);
}

/** 路線形狀（WKT） */
export async function fetchShape(city: City, routeName: string): Promise<Shape[]> {
  return apiGet<Shape[]>(`/v2/Bus/Shape/City/${city}/${enc(routeName)}`, {
    ttl: 24 * 3600,
    persist: true,
  });
}

/** 指定位置附近的站位（含經過的路線） */
export async function fetchNearbyStations(
  city: City,
  lat: number,
  lon: number,
  radius: number,
): Promise<Station[]> {
  const f = encodeURIComponent(`nearby(${lat.toFixed(6)}, ${lon.toFixed(6)}, ${radius})`);
  return apiGet<Station[]>(`/v2/Bus/Station/City/${city}?%24spatialFilter=${f}`, { ttl: 300 });
}

/** 查詢多個站牌的預估到站時間 */
export async function fetchEtaByStops(city: City, stopUIDs: string[]): Promise<Eta[]> {
  if (stopUIDs.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < stopUIDs.length; i += 40) chunks.push(stopUIDs.slice(i, i + 40));
  const lists = await Promise.all(
    chunks.map((c) => {
      const f = encodeURIComponent(c.map((u) => `StopUID eq '${u}'`).join(' or '));
      return apiGet<Eta[]>(`/v2/Bus/EstimatedTimeOfArrival/City/${city}?%24filter=${f}`, {
        ttl: 15,
      });
    }),
  );
  return lists.flat();
}
