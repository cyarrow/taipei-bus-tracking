import { useEffect, useMemo, useState } from 'react';
import RouteView, { type StopPick } from '../components/RouteView';
import { fetchRouteIndex, matchRoutes, TdxError } from '../tdx';
import { CITY_LABEL, type FavoriteStop, type Group, type RouteInfo } from '../types';

interface Props {
  favorites: FavoriteStop[];
  groups: Group[];
  defaultGroupId?: string;
  onAdd: (f: FavoriteStop) => void;
  onBack: () => void;
}

export default function AddStop({ favorites, groups, defaultGroupId, onAdd, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<RouteInfo[]>();
  const [indexError, setIndexError] = useState<string>();
  const [route, setRoute] = useState<RouteInfo>();
  const [groupId, setGroupId] = useState(defaultGroupId ?? '');
  const [added, setAdded] = useState<string>();

  useEffect(() => {
    fetchRouteIndex()
      .then(setIndex)
      .catch((e) => setIndexError(e instanceof TdxError ? e.message : '路線清單載入失敗'));
  }, []);

  const matches = useMemo(() => (index ? matchRoutes(index, query) : []), [index, query]);
  const multiCity = (r: RouteInfo) =>
    matches.some((m) => m.routeName === r.routeName && m.city !== r.city);

  const pick = (p: StopPick) => {
    onAdd({
      id: `${p.city}-${p.routeUID}-${p.direction}-${p.stopUID}`,
      ...p,
      groupId: groupId || undefined,
    });
    setAdded(p.stopName);
    window.setTimeout(() => setAdded(undefined), 2000);
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="text-btn" onClick={route ? () => setRoute(undefined) : onBack}>
          ‹ 返回
        </button>
        <h1>{route ? `${route.routeName}` : '新增站牌'}</h1>
        <span style={{ width: 48 }} />
      </header>

      <label className="group-picker">
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

      {route ? (
        <RouteView
          key={route.routeUID}
          city={route.city}
          routeName={route.routeName}
          routeUID={route.routeUID}
          favorites={favorites}
          onPick={pick}
        />
      ) : (
        <>
          <div className="search">
            <input
              placeholder="輸入路線或站名，例如 295、南京三民"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {indexError && <p className="error pad">{indexError}</p>}
          {!index && !indexError && <p className="muted pad">載入路線清單中…</p>}
          {index && query.trim() && matches.length === 0 && (
            <p className="muted pad">找不到符合「{query.trim()}」的路線</p>
          )}
          {matches.length > 0 && (
            <ul className="stop-list">
              {matches.map((r) => (
                <li key={r.routeUID}>
                  <button className="stop-row route-row" onClick={() => setRoute(r)}>
                    <span className="route-name">{r.routeName}</span>
                    <span className="name route-ends">
                      {r.departure && r.destination ? `${r.departure} ⇄ ${r.destination}` : ''}
                      {multiCity(r) && <span className="city-tag">{CITY_LABEL[r.city]}</span>}
                    </span>
                    <span className="add-mark">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {added && <div className="toast">已加入「{added}」</div>}
    </div>
  );
}
