import { describeEta, pickBest } from '../eta';
import { formatDistance, openWalkingNav, walkMinutes, type LatLon } from '../geo';
import type { City, Eta, FavoriteStop, RouteInfo, Station } from '../types';

interface Props {
  city: City;
  station: Station;
  pos?: LatLon;
  /** 與目前位置的距離（公尺） */
  dist?: number;
  etaByStop: Map<string, Eta[]>;
  etasLoaded: boolean;
  routes: Map<string, RouteInfo>;
  favorites: FavoriteStop[];
  groupId?: string;
  /** 標示目前正在看的路線 */
  highlightRouteUID?: string;
  showHeader?: boolean;
  onAdd: (f: FavoriteStop) => void;
  onOpenRoute: (f: FavoriteStop) => void;
  cardRef?: (el: HTMLLIElement | null) => void;
}

export function headsignOf(routes: Map<string, RouteInfo>, routeUID: string, dir?: number) {
  const r = routes.get(routeUID);
  if (!r || dir == null) return '';
  const to = dir === 0 ? r.destination : r.departure;
  return to ? `往 ${to}` : '';
}

/** 一個站位上所有路線的到站時間 */
export default function StationCard(props: Props) {
  const { city, station, pos, dist, etaByStop, etasLoaded, routes, favorites } = props;

  const toFav = (stop: Station['Stops'][number], e: Eta): FavoriteStop => ({
    id: `${city}-${stop.RouteUID}-${e.Direction}-${stop.StopUID}`,
    city,
    routeUID: stop.RouteUID,
    routeName: stop.RouteName.Zh_tw,
    direction: e.Direction,
    headsign: headsignOf(routes, stop.RouteUID, e.Direction) || stop.RouteName.Zh_tw,
    stopUID: stop.StopUID,
    stopName: stop.StopName.Zh_tw,
    stationID: station.StationID,
    lat: pos?.lat,
    lon: pos?.lon,
    groupId: props.groupId || undefined,
  });

  const rows = station.Stops.map((stop) => {
    const e = pickBest(etaByStop.get(stop.StopUID) ?? []);
    return { stop, e, d: describeEta(e) };
  }).sort(
    (a, b) =>
      a.d.sortKey - b.d.sortKey ||
      a.stop.RouteName.Zh_tw.localeCompare(b.stop.RouteName.Zh_tw, 'zh-Hant', { numeric: true }),
  );

  return (
    <li className="card multi" ref={props.cardRef}>
      {props.showHeader !== false && (
        <div className="multi-head station-head">
          <span>
            {station.StationName.Zh_tw}
            {dist != null && (
              <small className="muted">
                {' '}
                {formatDistance(dist)}・步行 {walkMinutes(dist)} 分
              </small>
            )}
          </span>
          {pos && (
            <button className="nav-btn" onClick={() => openWalkingNav(pos)}>
              🚶 導航
            </button>
          )}
        </div>
      )}
      {rows.map(({ stop, e, d }) => {
        const fav = e ? toFav(stop, e) : undefined;
        const isFav = !!fav && favorites.some((f) => f.id === fav.id);
        const hl = stop.RouteUID === props.highlightRouteUID;
        return (
          <div key={stop.StopUID + stop.RouteUID} className={`multi-row ${hl ? 'row-hl' : ''}`}>
            <button className="row-main" disabled={!fav} onClick={() => fav && props.onOpenRoute(fav)}>
              <span className="route small">{stop.RouteName.Zh_tw}</span>
              <span className="headsign grow">{headsignOf(routes, stop.RouteUID, e?.Direction)}</span>
              <span className={`eta-inline tone-${d.tone}`}>{etasLoaded ? d.text : '…'}</span>
            </button>
            <button
              className="add-btn"
              disabled={!fav || isFav}
              aria-label="加入我的站牌"
              onClick={() => fav && props.onAdd(fav)}
            >
              {isFav ? '✓' : '＋'}
            </button>
          </div>
        );
      })}
    </li>
  );
}
