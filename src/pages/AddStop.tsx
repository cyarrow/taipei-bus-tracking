import { useMemo, useState } from 'react';
import { describeEta, pickBest } from '../eta';
import { fetchEta, searchRoute, TdxError } from '../tdx';
import { CITY_LABEL, type City, type Eta, type FavoriteStop, type StopOfRoute } from '../types';

interface Props {
  favorites: FavoriteStop[];
  onAdd: (f: FavoriteStop) => void;
  onBack: () => void;
}

interface Option {
  key: string;
  city: City;
  route: StopOfRoute;
  headsign: string;
  label: string;
}

export default function AddStop({ favorites, onAdd, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<string>();
  const [etas, setEtas] = useState<Eta[]>([]);
  const [added, setAdded] = useState<string>();

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = query.trim();
    if (!name) return;
    setLoading(true);
    setError(undefined);
    setOptions([]);
    setSelected(undefined);
    setEtas([]);
    try {
      const results = await searchRoute(name);
      const opts: Option[] = [];
      const multiCity = results.length > 1;
      for (const { city, routes } of results) {
        const sorted = [...routes].sort((a, b) => a.Direction - b.Direction);
        for (const r of sorted) {
          if (r.Stops.length === 0) continue;
          const stops = [...r.Stops].sort((a, b) => a.StopSequence - b.StopSequence);
          const headsign = `往 ${stops[stops.length - 1].StopName.Zh_tw}`;
          const sub = r.SubRouteName.Zh_tw !== r.RouteName.Zh_tw ? `（${r.SubRouteName.Zh_tw}）` : '';
          opts.push({
            key: `${city}|${r.SubRouteUID}|${r.Direction}`,
            city,
            route: { ...r, Stops: stops },
            headsign,
            label: `${headsign}${sub}${multiCity ? `・${CITY_LABEL[city]}` : ''}`,
          });
        }
      }
      if (opts.length === 0) {
        setError(`找不到路線「${name}」`);
      } else {
        setOptions(opts);
        await choose(opts[0]);
      }
    } catch (err) {
      setError(err instanceof TdxError ? err.message : '查詢失敗');
    } finally {
      setLoading(false);
    }
  };

  const choose = async (opt: Option) => {
    setSelected(opt.key);
    try {
      setEtas(await fetchEta(opt.city, opt.route.RouteName.Zh_tw));
    } catch {
      setEtas([]);
    }
  };

  const current = options.find((o) => o.key === selected);

  const etaByStop = useMemo(() => {
    const m = new Map<string, Eta[]>();
    if (!current) return m;
    for (const e of etas) {
      if (e.Direction !== current.route.Direction || e.RouteUID !== current.route.RouteUID) continue;
      m.set(e.StopUID, [...(m.get(e.StopUID) ?? []), e]);
    }
    return m;
  }, [etas, current]);

  const isFav = (stopUID: string) =>
    !!current &&
    favorites.some(
      (f) =>
        f.stopUID === stopUID &&
        f.direction === current.route.Direction &&
        f.routeUID === current.route.RouteUID,
    );

  const add = (stopUID: string, stopName: string) => {
    if (!current || isFav(stopUID)) return;
    onAdd({
      id: `${current.city}-${current.route.RouteUID}-${current.route.Direction}-${stopUID}`,
      city: current.city,
      routeUID: current.route.RouteUID,
      routeName: current.route.RouteName.Zh_tw,
      direction: current.route.Direction,
      headsign: current.headsign,
      stopUID,
      stopName,
    });
    setAdded(stopName);
    window.setTimeout(() => setAdded(undefined), 2000);
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="text-btn" onClick={onBack}>
          ‹ 返回
        </button>
        <h1>新增站牌</h1>
        <span style={{ width: 48 }} />
      </header>

      <form className="search" onSubmit={search}>
        <input
          inputMode="text"
          placeholder="輸入路線，例如 295"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button type="submit" className="primary-btn" disabled={loading || !query.trim()}>
          {loading ? '搜尋中' : '搜尋'}
        </button>
      </form>

      {error && <p className="error pad">{error}</p>}

      {options.length > 0 && (
        <div className="tabs">
          {options.map((o) => (
            <button
              key={o.key}
              className={`tab ${o.key === selected ? 'active' : ''}`}
              onClick={() => choose(o)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {current && (
        <>
          <p className="muted pad">點選你要上車的站牌加入「我的站牌」</p>
          <ul className="stop-list">
            {current.route.Stops.map((s) => {
              const fav = isFav(s.StopUID);
              const d = describeEta(pickBest(etaByStop.get(s.StopUID) ?? []));
              return (
                <li key={`${s.StopUID}-${s.StopSequence}`}>
                  <button
                    className={`stop-row ${fav ? 'fav' : ''}`}
                    onClick={() => add(s.StopUID, s.StopName.Zh_tw)}
                    disabled={fav}
                  >
                    <span className="seq">{s.StopSequence}</span>
                    <span className="name">{s.StopName.Zh_tw}</span>
                    <span className={`mini-eta tone-${d.tone}`}>{etas.length ? d.text : ''}</span>
                    <span className="add-mark">{fav ? '✓' : '＋'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {added && <div className="toast">已加入「{added}」</div>}
    </div>
  );
}
