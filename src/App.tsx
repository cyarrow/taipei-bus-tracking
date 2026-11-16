import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import Home from './pages/Home';
import AddStop from './pages/AddStop';
import Settings from './pages/Settings';
import { loadCredentials, loadFavorites, saveFavorites } from './storage';
import type { FavoriteStop } from './types';

export type View = 'home' | 'add' | 'settings';

export default function App() {
  const [view, setView] = useState<View>(() => (loadCredentials() ? 'home' : 'settings'));
  const [favorites, setFavorites] = useState<FavoriteStop[]>(loadFavorites);
  const viewRef = useRef(view);
  viewRef.current = view;

  const updateFavorites = useCallback((next: FavoriteStop[]) => {
    setFavorites(next);
    saveFavorites(next);
  }, []);

  // Android 返回鍵：子頁面回首頁，首頁則關閉 App
  useEffect(() => {
    const handle = CapApp.addListener('backButton', () => {
      if (viewRef.current !== 'home') setView('home');
      else CapApp.exitApp();
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, []);

  if (view === 'settings') {
    return <Settings onDone={() => setView('home')} />;
  }
  if (view === 'add') {
    return (
      <AddStop
        favorites={favorites}
        onAdd={(f) => updateFavorites([...favorites, f])}
        onBack={() => setView('home')}
      />
    );
  }
  return (
    <Home
      favorites={favorites}
      onChange={updateFavorites}
      onNavigate={setView}
    />
  );
}
