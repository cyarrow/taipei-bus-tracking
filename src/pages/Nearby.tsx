import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BusMap, { type MapStop } from '../components/BusMap';
import StationCard from '../components/StationCard';
import { useRouteIndex } from '../useRouteIndex';
import { distanceM, getLocation, type LatLon } from '../geo';
import { fetchEtaByStops, fetchNearbyStations, TdxError } from '../tdx';
import type { City, Eta, FavoriteStop, Group, Station } from '../types';
import { usePolling } from '../usePolling';

const RADIUS = 450;

interface Props {
  favorites: FavoriteStop[];
  groups: Group[];
  defaultGroupId?: string;
  onAdd: (f: FavoriteStop) => void;
  onOpenRoute: (f: FavoriteStop) => void;
  onBack: () => void;
}

interface NearStation {
  city: City;
  station: Station;
  pos: LatLon;
  dist: number;
}

export default function Nearby({ favorites, groups, defaultGroupId, onAdd, onOpenRoute, onBack }: Props) {
  const [me, setMe] = useState<LatLon>();
  const [stations, setStations] = useState<NearStation[]>();
  const [etas, setEtas] = useState<Eta[]>([]);
  const routes = useRouteIndex();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState('定位中…');
  const [groupId, setGroupId] = useState(defaultGroupId ?? '');
  const [added, setAdded] = useState<string>();
  const cardRefs = useRef(new Map<string, HTMLLIElement>());

  const locate = useCallback(async () => {
    setError(undefined);
    setStations(undefined);
    setStatus('定位中…');
    try {
      const pos = await getLocation();
      setMe(pos);
      setStatus('搜尋附近站牌…');
      const cities: City[] = ['Taipei', 'NewTaipei'];
      const lists = await Promise.all(
        cities.map(async (city) =>
          (await fetchNearbyStations(city, pos.lat, pos.lon, RADIUS)).map<NearStation>((st) => {
            const p = { lat: st.StationPosition.PositionLat, lon: st.StationPosition.PositionLon };
            return { city, station: st, pos: p, dist: distanceM(pos, p) };
          }),
        ),
      );
      setStations(
        lists
          .flat()
          .filter((s) => s.station.Stops.length > 0)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 15),
      );
    } catch (e) {
      setError(e instanceof TdxError || e instanceof Error ? e.message : '載入失敗');
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const refreshEta = useCallback(async () => {
    if (!stations?.length) return;
    const byCity = new Map<City, string[]>();
    for (const s of stations) {
      byCity.set(s.city, [...(byCity.get(s.city) ?? []), ...s.station.Stops.map((x) => x.StopUID)]);
    }
    try {
      const lists = await Promise.all(
        [...byCity.entries()].map(([city, uids]) => fetchEtaByStops(city, uids)),
      );
      setEtas(lists.flat());
    } catch (e) {
      setError(e instanceof TdxError ? e.message : '到站時間更新失敗');
    }
  }, [stations]);

  usePolling(refreshEta, 30_000, !!stations?.length);

  const etaByStop = useMemo(() => {
    const m = new Map<string, Eta[]>();
    for (const e of etas) m.set(e.StopUID, [...(m.get(e.StopUID) ?? []), e]);
    return m;
  }, [etas]);

  const mapStops = useMemo<MapStop[]>(
    () =>
      (stations ?? []).map((s) => ({
        id: s.station.StationUID,
        ...s.pos,
        name: s.station.StationName.Zh_tw,
        onClick: () =>
          cardRefs.current
            .get(s.station.StationUID)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      })),
    [stations],
  );

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
        <h1>附近站牌</h1>
        <button className="text-btn" onClick={locate}>
          重新定位
        </button>
      </header>

      {error && <p className="error pad">{error}</p>}
      {!stations && !error && <p className="muted pad">{status}</p>}

      {stations && (
        <>
          <BusMap stops={mapStops} me={me} height={220} fit="me" />
          <label className="group-picker">
            ＋ 加入時的分組
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">不分組</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {stations.length === 0 && (
            <p className="muted pad">方圓 {RADIUS} 公尺內沒有公車站</p>
          )}
          <ul className="cards">
            {stations.map((s) => (
              <StationCard
                key={s.station.StationUID}
                city={s.city}
                station={s.station}
                pos={s.pos}
                dist={s.dist}
                etaByStop={etaByStop}
                etasLoaded={etas.length > 0}
                routes={routes}
                favorites={favorites}
                groupId={groupId}
                onAdd={add}
                onOpenRoute={onOpenRoute}
                cardRef={(el) => {
                  if (el) cardRefs.current.set(s.station.StationUID, el);
                }}
              />
            ))}
          </ul>
        </>
      )}
      {added && <div className="toast">已加入「{added}」</div>}
    </div>
  );
}
