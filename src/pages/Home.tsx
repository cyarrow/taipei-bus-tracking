import { useCallback, useMemo, useRef, useState } from 'react';
import { describeEta, pickBest, type EtaDisplay } from '../eta';
import UpdateBanner from '../components/UpdateBanner';
import type { UpdateInfo } from '../updater';
import type { StationTarget } from './StationPage';
import { distanceM, getLocation, walkMinutes, type LatLon } from '../geo';
import { loadSettings } from '../storage';
import { fetchEtaByStops, fetchStopsOfRoute, TdxError } from '../tdx';
import type { Eta, FavoriteStop, Group } from '../types';
import { usePolling } from '../usePolling';

const REFRESH_MS = 30_000;
export const ALL_TAB = '__all__';
const MAX_WALK_M = 3000;

/** 已嘗試補過座標／站位的站牌，避免重複查詢 */
const backfilled = new Set<string>();

/** 依步行時間與到站時間，給出出門建議 */
function walkHint(f: FavoriteStop, eta: Eta | undefined, me?: LatLon) {
  if (!me || f.lat == null || f.lon == null) return undefined;
  const dist = distanceM(me, { lat: f.lat, lon: f.lon });
  if (dist > MAX_WALK_M) return undefined;
  const walk = walkMinutes(dist);
  if (dist < 60) return { text: '你就在站牌附近', late: false };
  if (!eta || eta.StopStatus !== 0 || eta.EstimateTime == null) {
    return { text: `步行約 ${walk} 分`, late: false };
  }
  const leave = Math.floor(eta.EstimateTime / 60) - walk;
  if (leave >= 1) return { text: `步行 ${walk} 分・${leave} 分內出門`, late: false };
  if (leave === 0) return { text: `步行 ${walk} 分・現在出門`, late: false };
  return { text: `步行 ${walk} 分・可能趕不上這班`, late: true };
}

interface Props {
  favorites: FavoriteStop[];
  groups: Group[];
  activeTab: string;
  onTab: (t: string) => void;
  onChange: (f: FavoriteStop[]) => void;
  onOpenRoute: (f: FavoriteStop) => void;
  onAdd: () => void;
  onSettings: () => void;
  onGroups: () => void;
  onNearby: () => void;
  update?: UpdateInfo;
  onDismissUpdate: () => void;
  onStation: (s: StationTarget) => void;
}

const stationOf = (f: FavoriteStop): StationTarget | undefined =>
  f.stationID
    ? { city: f.city, stationID: f.stationID, name: f.stopName, lat: f.lat, lon: f.lon, routeUID: f.routeUID }
    : undefined;

interface Card {
  key: string;
  stopName: string;
  items: {
    fav: FavoriteStop;
    d: EtaDisplay;
    loaded: boolean;
    hint?: { text: string; late: boolean };
  }[];
}

export default function Home(props: Props) {
  const { favorites, groups, activeTab, onTab, onChange, onOpenRoute } = props;
  const [etas, setEtas] = useState<Record<string, Eta | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [editing, setEditing] = useState(false);
  const [me, setMe] = useState<LatLon>();

  const visible = useMemo(
    () =>
      activeTab === ALL_TAB ? favorites : favorites.filter((f) => f.groupId === activeTab),
    [favorites, activeTab],
  );

  const refresh = useCallback(async () => {
    if (favorites.length === 0) return;
    setLoading(true);
    setError(undefined);
    if (loadSettings().walkHint) {
      getLocation()
        .then(setMe)
        .catch(() => setMe(undefined));
    }
    try {
      // 所有站牌合併查詢：每個縣市只送一次請求
      const byCity = new Map<string, FavoriteStop[]>();
      for (const f of favorites) byCity.set(f.city, [...(byCity.get(f.city) ?? []), f]);
      const next: Record<string, Eta | undefined> = {};
      await Promise.all(
        [...byCity.values()].map(async (favs) => {
          const rows = await fetchEtaByStops(
            favs[0].city,
            [...new Set(favs.map((f) => f.stopUID))],
          );
          for (const f of favs) {
            next[f.id] = pickBest(
              rows.filter(
                (r) =>
                  r.StopUID === f.stopUID && r.Direction === f.direction && r.RouteUID === f.routeUID,
              ),
            );
          }
        }),
      );
      setEtas(next);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof TdxError ? e.message : '更新失敗');
    } finally {
      setLoading(false);
    }
    backfillRef.current();
  }, [favorites]);

  // 舊版加入的站牌沒有站位 ID／座標，背景補上（不影響到站時間顯示）
  const backfill = async () => {
    const need = favorites.filter(
      (f) => (f.stationID === undefined || f.lat == null) && !backfilled.has(f.id),
    );
    if (need.length === 0) return;
    const fix = new Map<string, Partial<FavoriteStop>>();
    const routes = new Map<string, FavoriteStop[]>();
    for (const f of need) {
      backfilled.add(f.id);
      const k = `${f.city}|${f.routeName}`;
      routes.set(k, [...(routes.get(k) ?? []), f]);
    }
    for (const favs of routes.values()) {
      const sor = await fetchStopsOfRoute(favs[0].city, favs[0].routeName).catch(() => []);
      for (const f of favs) {
        const stop = sor
          .filter((r) => r.RouteUID === f.routeUID && r.Direction === f.direction)
          .flatMap((r) => r.Stops)
          .find((s) => s.StopUID === f.stopUID);
        fix.set(f.id, {
          stationID: f.stationID ?? stop?.StationID ?? '',
          lat: f.lat ?? stop?.StopPosition?.PositionLat,
          lon: f.lon ?? stop?.StopPosition?.PositionLon,
        });
      }
    }
    onChange(favorites.map((f) => (fix.has(f.id) ? { ...f, ...fix.get(f.id) } : f)));
  };
  const backfillRef = useRef(backfill);
  backfillRef.current = backfill;


  usePolling(refresh, REFRESH_MS, favorites.length > 0);

  // 同一個站位（StationID）的不同路線合併成一張卡片
  const cards = useMemo<Card[]>(() => {
    const map = new Map<string, Card>();
    for (const f of visible) {
      const key = f.stationID ? `st:${f.city}:${f.stationID}` : `uid:${f.id}`;
      const card = map.get(key) ?? { key, stopName: f.stopName, items: [] };
      card.items.push({
        fav: f,
        d: describeEta(etas[f.id]),
        loaded: !!updatedAt,
        hint: walkHint(f, etas[f.id], me),
      });
      map.set(key, card);
    }
    for (const c of map.values()) c.items.sort((a, b) => a.d.sortKey - b.d.sortKey);
    return [...map.values()];
  }, [visible, etas, updatedAt, me]);

  const move = (f: FavoriteStop, d: -1 | 1) => {
    const vi = visible.indexOf(f);
    const other = visible[vi + d];
    if (!other) return;
    const next = [...favorites];
    const i = next.indexOf(f);
    const j = next.indexOf(other);
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const setGroup = (f: FavoriteStop, groupId: string) =>
    onChange(favorites.map((x) => (x.id === f.id ? { ...x, groupId: groupId || undefined } : x)));

  const tabs = [{ id: ALL_TAB, name: '全部' }, ...groups];

  return (
    <div className="page">
      <header className="topbar">
        <h1>我的站牌</h1>
        <div className="topbar-actions">
          {favorites.length > 0 && (
            <button className="text-btn" onClick={() => setEditing(!editing)}>
              {editing ? '完成' : '編輯'}
            </button>
          )}
          <button className="icon-btn" aria-label="附近站牌" onClick={props.onNearby}>
            📍
          </button>
          <button className="icon-btn" aria-label="設定" onClick={props.onSettings}>
            ⚙
          </button>
        </div>
      </header>

      {props.update && <UpdateBanner info={props.update} onDismiss={props.onDismissUpdate} />}

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${t.id === activeTab ? 'active' : ''}`}
            onClick={() => onTab(t.id)}
          >
            {t.name}
          </button>
        ))}
        <button className="tab tab-ghost" onClick={props.onGroups}>
          管理分組
        </button>
      </div>

      <div className="status-line">
        {error ? (
          <span className="error">{error}</span>
        ) : updatedAt ? (
          <span>
            {loading ? '更新中…' : `更新於 ${updatedAt.toLocaleTimeString('zh-TW', { hour12: false })}`}
            ・每 30 秒自動更新
          </span>
        ) : loading ? (
          <span>載入中…</span>
        ) : (
          <span />
        )}
        {favorites.length > 0 && (
          <button className="text-btn" onClick={refresh} disabled={loading}>
            重新整理
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <p>{favorites.length === 0 ? '還沒有加入任何站牌' : '這個分組還沒有站牌'}</p>
          <p className="muted">按下方「＋ 新增站牌」，搜尋路線並選擇你的上車站</p>
        </div>
      ) : editing ? (
        <ul className="cards">
          {visible.map((f, i) => (
            <li key={f.id} className="card edit-card">
              <div className="edit-top">
                <div className="route small">{f.routeName}</div>
                <div className="card-info">
                  <div className="stop">{f.stopName}</div>
                  <div className="headsign">{f.headsign}</div>
                </div>
              </div>
              <div className="edit-actions">
                <select value={f.groupId ?? ''} onChange={(e) => setGroup(f, e.target.value)}>
                  <option value="">不分組</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button className="icon-btn" aria-label="上移" onClick={() => move(f, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button
                  className="icon-btn"
                  aria-label="下移"
                  onClick={() => move(f, 1)}
                  disabled={i === visible.length - 1}
                >
                  ↓
                </button>
                <button
                  className="danger-btn"
                  onClick={() => onChange(favorites.filter((x) => x.id !== f.id))}
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="cards">
          {cards.map((c) =>
            c.items.length === 1 ? (
              <SingleCard
                key={c.key}
                item={c.items[0]}
                onOpen={onOpenRoute}
                onStation={props.onStation}
              />
            ) : (
              <li key={c.key} className={`card multi tone-${c.items[0].d.tone}`}>
                <div className="multi-head station-head">
                  <span>{c.stopName}</span>
                  {stationOf(c.items[0].fav) && (
                    <button
                      className="station-btn"
                      onClick={() => props.onStation(stationOf(c.items[0].fav)!)}
                    >
                      🚏 本站路線
                    </button>
                  )}
                </div>
                {c.items.map(({ fav, d, loaded, hint }) => (
                  <button key={fav.id} className="multi-row" onClick={() => onOpenRoute(fav)}>
                    <span className="route small">{fav.routeName}</span>
                    <span className="headsign grow">
                      {fav.headsign}
                      {hint && <span className={`walk-hint ${hint.late ? 'late' : ''}`}>{hint.text}</span>}
                    </span>
                    <span className={`eta-inline tone-${d.tone}`}>
                      {loaded ? d.text : '…'}
                      {d.sub && <small> {d.sub}</small>}
                    </span>
                  </button>
                ))}
              </li>
            ),
          )}
        </ul>
      )}

      <button className="fab" onClick={props.onAdd}>
        ＋ 新增站牌
      </button>
    </div>
  );
}

function SingleCard({
  item,
  onOpen,
  onStation,
}: {
  item: Card['items'][number];
  onOpen: (f: FavoriteStop) => void;
  onStation: (s: StationTarget) => void;
}) {
  const st = stationOf(item.fav);
  const { fav, d, loaded, hint } = item;
  return (
    <li className={`card tone-${d.tone}`}>
      <button className="card-btn" onClick={() => onOpen(fav)}>
        <div className="card-main">
          <div className="route">{fav.routeName}</div>
          <div className="card-info">
            <div className="stop">{fav.stopName}</div>
            <div className="headsign">{fav.headsign}</div>
            {hint && <div className={`walk-hint ${hint.late ? 'late' : ''}`}>{hint.text}</div>}
          </div>
        </div>
        <div className="eta">
          <div className="eta-text">{loaded ? d.text : '…'}</div>
          {d.sub && <div className="eta-sub">{d.sub}</div>}
        </div>
      </button>
      {st && (
        <button className="station-btn icon" aria-label="本站路線" onClick={() => onStation(st)}>
          🚏
        </button>
      )}
    </li>
  );
}
