import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import Home, { ALL_TAB } from './pages/Home';
import AddStop from './pages/AddStop';
import Settings from './pages/Settings';
import Groups from './pages/Groups';
import RouteDetail from './pages/RouteDetail';
import Nearby from './pages/Nearby';
import { groupForNow } from './groups';
import { loadCredentials, loadFavorites, loadGroups, saveFavorites, saveGroups } from './storage';
import type { FavoriteStop, Group } from './types';

type View =
  | { name: 'home' }
  | { name: 'add' }
  | { name: 'settings' }
  | { name: 'groups' }
  | { name: 'nearby' }
  | { name: 'route'; fav: FavoriteStop };

const autoTab = (groups: Group[]) => groupForNow(groups)?.id ?? ALL_TAB;

export default function App() {
  const [stack, setStack] = useState<View[]>(() =>
    loadCredentials() ? [{ name: 'home' }] : [{ name: 'home' }, { name: 'settings' }],
  );
  const [favorites, setFavorites] = useState<FavoriteStop[]>(loadFavorites);
  const [groups, setGroups] = useState<Group[]>(loadGroups);
  const [activeTab, setActiveTab] = useState(() => autoTab(loadGroups()));
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const view = stack[stack.length - 1];
  const push = (v: View) => setStack((s) => [...s, v]);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const updateFavorites = useCallback((next: FavoriteStop[]) => {
    setFavorites(next);
    saveFavorites(next);
  }, []);

  const updateGroups = (next: Group[]) => {
    setGroups(next);
    saveGroups(next);
    const ids = new Set(next.map((g) => g.id));
    if (favorites.some((f) => f.groupId && !ids.has(f.groupId))) {
      updateFavorites(
        favorites.map((f) => (f.groupId && !ids.has(f.groupId) ? { ...f, groupId: undefined } : f)),
      );
    }
    if (activeTab !== ALL_TAB && !ids.has(activeTab)) setActiveTab(ALL_TAB);
  };

  // 每次 App 回到前景，依時段自動切換分組
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setActiveTab(autoTab(loadGroups()));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Android 返回鍵
  useEffect(() => {
    const handle = CapApp.addListener('backButton', () => {
      if (stackRef.current.length > 1) back();
      else CapApp.exitApp();
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [back]);

  switch (view.name) {
    case 'settings':
      return <Settings onDone={back} />;
    case 'groups':
      return <Groups groups={groups} onChange={updateGroups} onBack={back} />;
    case 'nearby':
      return (
        <Nearby
          favorites={favorites}
          groups={groups}
          defaultGroupId={activeTab === ALL_TAB ? undefined : activeTab}
          onAdd={(f) => updateFavorites([...favorites, f])}
          onOpenRoute={(fav) => push({ name: 'route', fav })}
          onBack={back}
        />
      );
    case 'route':
      return <RouteDetail fav={view.fav} favorites={favorites} onBack={back} />;
    case 'add':
      return (
        <AddStop
          favorites={favorites}
          groups={groups}
          defaultGroupId={activeTab === ALL_TAB ? undefined : activeTab}
          onAdd={(f) => updateFavorites([...favorites, f])}
          onBack={back}
        />
      );
    default:
      return (
        <Home
          favorites={favorites}
          groups={groups}
          activeTab={activeTab}
          onTab={setActiveTab}
          onChange={updateFavorites}
          onOpenRoute={(fav) => push({ name: 'route', fav })}
          onAdd={() => push({ name: 'add' })}
          onSettings={() => push({ name: 'settings' })}
          onGroups={() => push({ name: 'groups' })}
          onNearby={() => push({ name: 'nearby' })}
        />
      );
  }
}
