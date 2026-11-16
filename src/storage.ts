import type { Credentials, FavoriteStop, Group } from './types';

const KEY_CREDS = 'tdx.credentials';
const KEY_FAVS = 'favorites';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 儲存失敗時忽略 */
  }
}

export const loadCredentials = () => read<Credentials | null>(KEY_CREDS, null);
export const saveCredentials = (c: Credentials) => write(KEY_CREDS, c);

export const loadFavorites = () => read<FavoriteStop[]>(KEY_FAVS, []);
export const saveFavorites = (f: FavoriteStop[]) => write(KEY_FAVS, f);

export { read as readJson, write as writeJson };

const KEY_GROUPS = 'groups';
const DEFAULT_GROUPS: Group[] = [
  { id: 'school', name: '上學', start: '05:00', end: '11:00' },
  { id: 'home', name: '回家', start: '15:00', end: '23:59' },
];

export const loadGroups = () => read<Group[]>(KEY_GROUPS, DEFAULT_GROUPS);
export const saveGroups = (g: Group[]) => write(KEY_GROUPS, g);
