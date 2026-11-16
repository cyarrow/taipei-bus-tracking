import { useCallback, useEffect, useMemo, useState } from 'react';
import StationCard from '../components/StationCard';
import { distanceM, getLocation, openWalkingNav, formatDistance, walkMinutes, type LatLon } from '../geo';
import { fetchEtaByStops, fetchStation, TdxError } from '../tdx';
import type { City, Eta, FavoriteStop, Group, Station } from '../types';
import { usePolling } from '../usePolling';
import { useRouteIndex } from '../useRouteIndex';

export interface StationTarget {
  city: City;
  stationID: string;
  name: string;
  lat?: number;
  lon?: number;
  /** 從哪條路線點進來，用來標示 */
  routeUID?: string;
}

interface Props {
  target: StationTarget;
  favorites: FavoriteStop[];
  groups: Group[];
  defaultGroupId?: string;
  onAdd: (f: FavoriteStop) => void;
  onOpenRoute: (f: FavoriteStop) => void;
  onBack: () => void;
}

export default function StationPage({ target, favorites, groups, defaultGroupId, onAdd, onOpenRoute, onBack }: Props) {
  const [station, setStation] = useState<Station>();
  const [etas, setEtas] = useState<Eta[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<LatLon>();
  const [groupId, setGroupId] = useState(defaultGroupId ?? '');
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [added, setAdded] = useState<string>();
  const routes = useRouteIndex();

  useEffect(() => {
    if (!target.stationID) {
      setError('這個站牌沒有站位資料，無法查詢其他路線');
      setLoading(false);
      return;
    }
    fetchStation(target.city, target.stationID)
      .then((st) => {
        if (!st) setError('找不到這個站位的資料');
        setStation(st);
      })
      .catch((e) => setError(e instanceof TdxError ? e.message : '載入失敗'))
      .finally(() => setLoading(false));
    getLocation()
      .then(setMe)
      .catch(() => {});
  }, [target.city, target.stationID]);

  const refresh = useCallback(async () => {
    if (!station) return;
    try {
      setEtas(await fetchEtaByStops(target.city, station.Stops.map((s) => s.StopUID)));
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof TdxError ? e.message : '到站時間更新失敗');
    }
  }, [station, target.city]);

  usePolling(refresh, 30_000, !!station);

  const etaByStop = useMemo(() => {
    const m = new Map<string, Eta[]>();
    for (const e of etas) m.set(e.StopUID, [...(m.get(e.StopUID) ?? []), e]);
    return m;
  }, [etas]);

  const pos: LatLon | undefined = station
    ? { lat: station.StationPosition.PositionLat, lon: station.StationPosition.PositionLon }
    : target.lat != null && target.lon != null
      ? { lat: target.lat, lon: target.lon }
      : undefined;
  const dist = pos && me ? distanceM(me, pos) : undefined;

  const add = (f: FavoriteStop) => {
    onAdd(f);
    setAdded(`${f.routeName} ${f.stopName}`);
    window.setTimeout(() => setAdded(undefined), 2000);
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="text-btn" onClick={onBack}>
          ‹ 返回
        </button>
        <h1>{station?.StationName.Zh_tw ?? target.name}</h1>
        <span style={{ width: 48 }} />
      </header>

      <div className="nearest station-summary">
        <span className="summary-text">
          {station ? `${station.Stops.length} 條路線經過此站` : '本站路線'}
          {dist != null && (
            <small className="muted">
              {formatDistance(dist)}・步行約 {walkMinutes(dist)} 分
            </small>
          )}
        </span>
        {pos && (
          <button className="nav-btn" onClick={() => openWalkingNav(pos)}>
            🚶 導航
          </button>
        )}
      </div>

      <div className="status-line">
        <span>
          {updatedAt ? `更新於 ${updatedAt.toLocaleTimeString('zh-TW', { hour12: false })}` : ''}
        </span>
        <label className="group-picker inline">
          加入分組
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">不分組</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error pad">{error}</p>}
      {loading && <p className="muted pad">載入中…</p>}

      {station && (
        <ul className="cards">
          <StationCard
            city={target.city}
            station={station}
            etaByStop={etaByStop}
            etasLoaded={etas.length > 0}
            routes={routes}
            favorites={favorites}
            groupId={groupId}
            highlightRouteUID={target.routeUID}
            showHeader={false}
            onAdd={add}
            onOpenRoute={onOpenRoute}
          />
        </ul>
      )}
      {added && <div className="toast">已加入「{added}」</div>}
    </div>
  );
}
