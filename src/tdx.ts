import { loadCredentials, readJson, writeJson } from './storage';
import type { City, Credentials, Eta, StopOfRoute } from './types';

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

async function getToken(force = false): Promise<string> {
  const creds = loadCredentials();
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new TdxError('尚未設定 TDX 金鑰，請到「設定」輸入');
  }
  const cached = readJson<CachedToken | null>(KEY_TOKEN, null);
  if (!force && cached && cached.clientId === creds.clientId && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  return (await requestToken(creds)).token;
}

/** 用指定金鑰測試能否取得 token */
export async function testCredentials(creds: Credentials): Promise<void> {
  await requestToken(creds);
}

async function apiGet<T>(path: string, retry = true): Promise<T> {
  const token = await getToken();
  const sep = path.includes('?') ? '&' : '?';
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${sep}%24format=JSON`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch {
    throw new TdxError('無法連線到 TDX，請確認網路連線');
  }
  if (res.status === 401 && retry) {
    await getToken(true);
    return apiGet<T>(path, false);
  }
  if (res.status === 429) {
    throw new TdxError('查詢太頻繁，請稍後再試', 429);
  }
  if (res.status === 404) {
    return [] as unknown as T;
  }
  if (!res.ok) {
    throw new TdxError(`TDX 回應錯誤（${res.status}）`, res.status);
  }
  return (await res.json()) as T;
}

const enc = (s: string) => encodeURIComponent(s);

/** 查詢路線的所有站牌（依方向、子路線分組）。只保留名稱完全相同的路線。 */
export async function fetchStopsOfRoute(city: City, routeName: string): Promise<StopOfRoute[]> {
  const list = await apiGet<StopOfRoute[]>(`/v2/Bus/StopOfRoute/City/${city}/${enc(routeName)}`);
  return list.filter((r) => r.RouteName.Zh_tw === routeName);
}

/** 查詢路線所有站牌的預估到站時間 */
export async function fetchEta(city: City, routeName: string): Promise<Eta[]> {
  const list = await apiGet<Eta[]>(
    `/v2/Bus/EstimatedTimeOfArrival/City/${city}/${enc(routeName)}`,
  );
  return list.filter((e) => e.RouteName.Zh_tw === routeName);
}

/** 同時在台北市與新北市搜尋路線 */
export async function searchRoute(
  routeName: string,
): Promise<{ city: City; routes: StopOfRoute[] }[]> {
  const cities: City[] = ['Taipei', 'NewTaipei'];
  const results = await Promise.all(
    cities.map(async (city) => ({ city, routes: await fetchStopsOfRoute(city, routeName) })),
  );
  return results.filter((r) => r.routes.length > 0);
}
