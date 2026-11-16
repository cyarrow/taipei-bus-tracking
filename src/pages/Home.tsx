import { useCallback, useEffect, useState } from 'react';
import { describeEta, pickBest } from '../eta';
import { fetchEta, TdxError } from '../tdx';
import type { Eta, FavoriteStop } from '../types';
import type { View } from '../App';

const REFRESH_MS = 30_000;

interface Props {
  favorites: FavoriteStop[];
  onChange: (f: FavoriteStop[]) => void;
  onNavigate: (v: View) => void;
}

export default function Home({ favorites, onChange, onNavigate }: Props) {
  const [etas, setEtas] = useState<Record<string, Eta | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    if (favorites.length === 0) return;
    setLoading(true);
    setError(undefined);
    try {
      // 同一條路線只查一次
      const groups = new Map<string, FavoriteStop[]>();
      for (const f of favorites) {
        const k = `${f.city}|${f.routeName}`;
        groups.set(k, [...(groups.get(k) ?? []), f]);
      }
      const next: Record<string, Eta | undefined> = {};
      await Promise.all(
        [...groups.values()].map(async (favs) => {
          const rows = await fetchEta(favs[0].city, favs[0].routeName);
          for (const f of favs) {
            next[f.id] = pickBest(
              rows.filter(
                (r) =>
                  r.StopUID === f.stopUID &&
                  r.Direction === f.direction &&
                  r.RouteUID === f.routeUID,
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
  }, [favorites]);

  // 畫面顯示時每 30 秒自動更新；App 切到背景時暫停
  useEffect(() => {
    refresh();
    let timer = window.setInterval(refresh, REFRESH_MS);
    const onVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState === 'visible') {
        refresh();
        timer = window.setInterval(refresh, REFRESH_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= favorites.length) return;
    const next = [...favorites];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

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
          <button className="icon-btn" aria-label="設定" onClick={() => onNavigate('settings')}>
            ⚙
          </button>
        </div>
      </header>

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
        ) : null}
        {favorites.length > 0 && (
          <button className="text-btn" onClick={refresh} disabled={loading}>
            重新整理
          </button>
        )}
      </div>

      {favorites.length === 0 ? (
        <div className="empty">
          <p>還沒有加入任何站牌</p>
          <p className="muted">按下方「＋ 新增站牌」，搜尋路線並選擇你的上車站</p>
        </div>
      ) : (
        <ul className="cards">
          {favorites.map((f, i) => {
            const d = describeEta(etas[f.id]);
            return (
              <li key={f.id} className={`card tone-${d.tone}`}>
                <div className="card-main">
                  <div className="route">{f.routeName}</div>
                  <div className="card-info">
                    <div className="stop">{f.stopName}</div>
                    <div className="headsign">{f.headsign}</div>
                  </div>
                </div>
                {editing ? (
                  <div className="edit-actions">
                    <button className="icon-btn" aria-label="上移" onClick={() => move(i, -1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="下移"
                      onClick={() => move(i, 1)}
                      disabled={i === favorites.length - 1}
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
                ) : (
                  <div className="eta">
                    <div className="eta-text">{etas[f.id] || updatedAt ? d.text : '…'}</div>
                    {d.sub && <div className="eta-sub">{d.sub}</div>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button className="fab" onClick={() => onNavigate('add')}>
        ＋ 新增站牌
      </button>
    </div>
  );
}
