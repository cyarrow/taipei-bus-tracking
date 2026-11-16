import { useEffect, useState } from 'react';
import { fetchRouteIndex } from './tdx';
import type { RouteInfo } from './types';

/** 路線清單（以 RouteUID 為鍵），用來顯示「往 XX」 */
export function useRouteIndex(): Map<string, RouteInfo> {
  const [routes, setRoutes] = useState<Map<string, RouteInfo>>(new Map());
  useEffect(() => {
    fetchRouteIndex()
      .then((idx) => setRoutes(new Map(idx.map((r) => [r.routeUID, r]))))
      .catch(() => {});
  }, []);
  return routes;
}
