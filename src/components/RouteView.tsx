import { useEffect, useMemo, useRef, useState } from 'react';
import { describeEta, pickBest } from '../eta';
import { distanceM, formatDistance, getLocation, openWalkingNav, walkMinutes, type LatLon } from '../geo';
import {
  fetchBusGps,
  fetchBusPositions,
  fetchEta,
  fetchShape,
  fetchStopsOfRoute,
  TdxError,
} from '../tdx';
import type { BusGps, BusPosition, City, Eta, FavoriteStop, Shape, StopOfRoute } from '../types';
import { usePolling } from '../usePolling';
import BusMap, { parseWkt, type MapStop } from './BusMap';

export interface StopPick {
  city: City;
  routeUID: string;
  routeName: string;
  direction: number;
  headsign: string;
  stopUID: string;
  stopName: string;
  stationID?: string;
  lat?: number;
  lon?: number;
}

interface Props {
  city: City;
  routeName: string;
  routeUID: string;
  initialDirection?: number;
  highlightStopUID?: string;
  favorites: FavoriteStop[];
  /** 有傳入時，每個站牌可點擊加入 */
  onPick?: (p: StopPick) => void;
}

interface Option {
  key: string;
  route: StopOfRoute;
  headsign: string;
  label: string;
}

export default function RouteView(props: Props) {
  const { city, routeName, routeUID, initialDirection, highlightStopUID, favorites, onPick } = props;
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<string>();
  const [etas, setEtas] = useState<Eta[]>([]);
  const [buses, setBuses] = useState<BusPosition[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [gps, setGps] = useState<BusGps[]>([]);
  const [shapes, setShapes] = useState<Shape[]>();
  const [me, setMe] = useState<LatLon>();
  const highlightRef = useRef<HTMLLIElement>(null);
  const scrolled = useRef(false);

  // 載入路線站序
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    fetchStopsOfRoute(city, routeName)
      .then((list) => {
        if (cancelled) return;
        const mine = list
          .filter((r) => r.RouteUID === routeUID && r.Stops.length > 0)
          .sort((a, b) => a.Direction - b.Direction);
        const opts = mine.map<Option>((r) => {
          const stops = [...r.Stops].sort((a, b) => a.StopSequence - b.StopSequence);
          const headsign = `往 ${stops[stops.length - 1].StopName.Zh_tw}`;
          const sub =
            r.SubRouteName.Zh_tw !== r.RouteName.Zh_tw ? `（${r.SubRouteName.Zh_tw}）` : '';
          return {
            key: `${r.SubRouteUID}|${r.Direction}`,
            route: { ...r, Stops: stops },
            headsign,
            label: headsign + sub,
          };
        });
        setOptions(opts);
        const initial =
          opts.find(
            (o) =>
              o.route.Direction === initialDirection &&
              (!highlightStopUID || o.route.Stops.some((s) => s.StopUID === highlightStopUID)),
          ) ?? opts[0];
        setSelected(initial?.key);
        if (opts.length === 0) setError('找不到這條路線的站牌資料');
      })
      .catch((e) => !cancelled && setError(e instanceof TdxError ? e.message : '載入失敗'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [city, routeName, routeUID, initialDirection, highlightStopUID]);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  // 切到地圖時載入路線形狀與公車 GPS
  useEffect(() => {
    if (mode !== 'map') return;
    fetchBusGps(city, routeName)
      .then((g) => setGps(g.filter((x) => x.RouteUID === routeUID)))
      .catch(() => {});
    if (!shapes) {
      fetchShape(city, routeName)
        .then((sh) => setShapes(sh.filter((x) => x.RouteUID === routeUID)))
        .catch(() => setShapes([]));
    }
  }, [mode, city, routeName, routeUID, shapes]);

  // 取得目前位置（用於步行時間與地圖），失敗就略過
  useEffect(() => {
    getLocation()
      .then(setMe)
      .catch(() => {});
  }, []);

  // 每 30 秒更新到站時間與公車位置
  usePolling(
    async () => {
      try {
        const [e, b, g] = await Promise.all([
          fetchEta(city, routeName),
          fetchBusPositions(city, routeName).catch(() => [] as BusPosition[]),
          modeRef.current === 'map'
            ? fetchBusGps(city, routeName).catch(() => [] as BusGps[])
            : Promise.resolve(undefined),
        ]);
        setEtas(e.filter((x) => x.RouteUID === routeUID));
        setBuses(b.filter((x) => x.RouteUID === routeUID));
        if (g) setGps(g.filter((x) => x.RouteUID === routeUID));
        setUpdatedAt(new Date());
      } catch (e) {
        setError(e instanceof TdxError ? e.message : '更新失敗');
      }
    },
    30_000,
    options.length > 0,
  );

  const current = options.find((o) => o.key === selected);

  const etaByStop = useMemo(() => {
    const m = new Map<string, Eta[]>();
    if (!current) return m;
    for (const e of etas) {
      if (e.Direction !== current.route.Direction) continue;
      m.set(e.StopUID, [...(m.get(e.StopUID) ?? []), e]);
    }
    return m;
  }, [etas, current]);

  const busByStop = useMemo(() => {
    const m = new Map<string, BusPosition[]>();
    if (!current) return m;
    for (const b of buses) {
      if (b.Direction !== current.route.Direction) continue;
      m.set(b.StopUID, [...(m.get(b.StopUID) ?? []), b]);
    }
    return m;
  }, [buses, current]);

  // 「最近一班還有幾站」
  const nearest = useMemo(() => {
    if (!current || !highlightStopUID) return undefined;
    const idx = new Map(current.route.Stops.map((s, i) => [s.StopUID, i]));
    const target = idx.get(highlightStopUID);
    if (target == null) return undefined;
    let best: { stops: number; plate: string } | undefined;
    for (const b of buses) {
      if (b.Direction !== current.route.Direction) continue;
      const i = idx.get(b.StopUID);
      if (i == null || i > target) continue;
      const n = target - i;
      if (!best || n < best.stops) best = { stops: n, plate: b.PlateNumb };
    }
    return best;
  }, [buses, current, highlightStopUID]);

  const hlStop = current?.route.Stops.find((s) => s.StopUID === highlightStopUID);
  const hlPos: LatLon | undefined = hlStop?.StopPosition
    ? { lat: hlStop.StopPosition.PositionLat, lon: hlStop.StopPosition.PositionLon }
    : undefined;
  const hlDist = hlPos && me ? distanceM(me, hlPos) : undefined;

  const mapStops = useMemo<MapStop[]>(() => {
    if (!current) return [];
    return current.route.Stops.filter((s) => s.StopPosition).map((s) => {
      const d = describeEta(pickBest(etaByStop.get(s.StopUID) ?? []));
      return {
        id: s.StopUID,
        lat: s.StopPosition!.PositionLat,
        lon: s.StopPosition!.PositionLon,
        name: s.StopName.Zh_tw,
        label: `${s.StopSequence}. ${s.StopName.Zh_tw}${etas.length ? `｜${d.text}` : ''}`,
        highlight: s.StopUID === highlightStopUID,
      };
    });
  }, [current, etaByStop, etas.length, highlightStopUID]);

  const mapLines = useMemo<[number, number][][]>(() => {
    if (!current) return [];
    const forDir = shapes?.filter((x) => x.Direction === current.route.Direction) ?? [];
    const use = forDir.length ? forDir : (shapes ?? []).filter((x) => x.Direction == null);
    const parsed = use.flatMap((x) => parseWkt(x.Geometry));
    if (parsed.length) return parsed;
    return [mapStops.map((s) => [s.lat, s.lon] as [number, number])];
  }, [shapes, current, mapStops]);

  const mapBuses = useMemo(
    () =>
      current
        ? gps
            .filter((b) => b.Direction === current.route.Direction && b.BusPosition)
            .map((b) => ({
              plate: b.PlateNumb,
              lat: b.BusPosition!.PositionLat,
              lon: b.BusPosition!.PositionLon,
            }))
        : [],
    [gps, current],
  );

  useEffect(() => {
    if (!scrolled.current && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center' });
      scrolled.current = true;
    }
  }, [current]);

  const isFav = (stopUID: string) =>
    !!current &&
    favorites.some(
      (f) =>
        f.stopUID === stopUID && f.direction === current.route.Direction && f.routeUID === routeUID,
    );

  if (loading) return <p className="muted pad">載入中…</p>;

  return (
    <>
      {error && <p className="error pad">{error}</p>}

      {options.length > 1 && (
        <div className="tabs">
          {options.map((o) => (
            <button
              key={o.key}
              className={`tab ${o.key === selected ? 'active' : ''}`}
              onClick={() => setSelected(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {options.length === 1 && current && <p className="pad headsign-line">{current.label}</p>}

      {highlightStopUID && current?.route.Stops.some((s) => s.StopUID === highlightStopUID) && (
        <div className="nearest">
          {nearest
            ? nearest.stops === 0
              ? `最近一班已在你的站（${nearest.plate}）`
              : `最近一班還有 ${nearest.stops} 站（${nearest.plate}）`
            : '目前沒有公車駛向你的站'}
          {hlPos && (
            <div className="nearest-walk">
              <span>
                {hlDist != null
                  ? `距離 ${formatDistance(hlDist)}・步行約 ${walkMinutes(hlDist)} 分`
                  : ''}
              </span>
              <button className="nav-btn" onClick={() => openWalkingNav(hlPos)}>
                🚶 導航到站牌
              </button>
            </div>
          )}
        </div>
      )}

      <div className="segmented">
        <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>
          列表
        </button>
        <button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}>
          地圖
        </button>
      </div>

      <div className="status-line">
        <span>
          {onPick ? '點選站牌加入我的站牌' : updatedAt ? `更新於 ${updatedAt.toLocaleTimeString('zh-TW', { hour12: false })}` : ''}
        </span>
        <span className="legend">{mode === 'map' ? '🚌 GPS 位置・🔵 我' : '🚌 公車位置'}</span>
      </div>

      {current && mode === 'map' && (
        <BusMap
          key={current.key}
          stops={mapStops}
          lines={mapLines}
          buses={mapBuses}
          me={me}
          height="62vh"
          fit={highlightStopUID ? 'highlight' : 'stops'}
        />
      )}

      {current && mode === 'list' && (
        <ul className="stop-list">
          {current.route.Stops.map((s) => {
            const fav = isFav(s.StopUID);
            const d = describeEta(pickBest(etaByStop.get(s.StopUID) ?? []));
            const here = busByStop.get(s.StopUID) ?? [];
            const hl = s.StopUID === highlightStopUID;
            const content = (
              <>
                <span className="seq">{s.StopSequence}</span>
                <span className="name">
                  {s.StopName.Zh_tw}
                  {here.map((b) => (
                    <span key={b.PlateNumb} className="bus-tag">
                      🚌 {b.PlateNumb}
                      {b.A2EventType === 1 ? ' 進站' : b.A2EventType === 0 ? ' 離站' : ''}
                    </span>
                  ))}
                </span>
                <span className={`mini-eta tone-${d.tone}`}>{etas.length ? d.text : ''}</span>
                {onPick && <span className="add-mark">{fav ? '✓' : '＋'}</span>}
              </>
            );
            return (
              <li
                key={`${s.StopUID}-${s.StopSequence}`}
                ref={hl ? highlightRef : undefined}
                className={hl ? 'highlight' : undefined}
              >
                {onPick && current ? (
                  <button
                    className={`stop-row ${fav ? 'fav' : ''}`}
                    disabled={fav}
                    onClick={() =>
                      onPick({
                        city,
                        routeUID,
                        routeName,
                        direction: current.route.Direction,
                        headsign: current.headsign,
                        stopUID: s.StopUID,
                        stopName: s.StopName.Zh_tw,
                        stationID: s.StationID,
                        lat: s.StopPosition?.PositionLat,
                        lon: s.StopPosition?.PositionLon,
                      })
                    }
                  >
                    {content}
                  </button>
                ) : (
                  <div className={`stop-row ${fav ? 'fav' : ''}`}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
