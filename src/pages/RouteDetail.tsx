import RouteView from '../components/RouteView';
import type { FavoriteStop } from '../types';
import type { StationTarget } from './StationPage';

interface Props {
  fav: FavoriteStop;
  favorites: FavoriteStop[];
  onBack: () => void;
  onStation: (s: StationTarget) => void;
}

export default function RouteDetail({ fav, favorites, onBack, onStation }: Props) {
  return (
    <div className="page">
      <header className="topbar">
        <button className="text-btn" onClick={onBack}>
          ‹ 返回
        </button>
        <h1>{fav.routeName} 路線動態</h1>
        <span style={{ width: 48 }} />
      </header>
      <RouteView
        city={fav.city}
        routeName={fav.routeName}
        routeUID={fav.routeUID}
        initialDirection={fav.direction}
        highlightStopUID={fav.stopUID}
        favorites={favorites}
        onStation={onStation}
      />
    </div>
  );
}
