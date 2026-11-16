import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLon } from '../geo';

export interface MapStop extends LatLon {
  id: string;
  name: string;
  highlight?: boolean;
  label?: string;
  onClick?: () => void;
}

export interface MapBus extends LatLon {
  plate: string;
}

interface Props {
  stops: MapStop[];
  lines?: [number, number][][];
  buses?: MapBus[];
  me?: LatLon;
  height?: number | string;
  /** 首次載入時要框住的範圍：所有站牌或我的位置附近 */
  fit?: 'stops' | 'me' | 'highlight';
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export default function BusMap({ stops, lines = [], buses = [], me, height = 420, fit = 'stops' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | undefined>(undefined);
  const layer = useRef<L.LayerGroup | undefined>(undefined);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(
      [25.047, 121.517],
      13,
    );
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();

    for (const line of lines) {
      L.polyline(line, { color: '#0f766e', weight: 5, opacity: 0.7 }).addTo(g);
    }
    for (const s of stops) {
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: s.highlight ? 9 : 6,
        color: '#ffffff',
        weight: 2,
        fillColor: s.highlight ? '#dc2626' : '#0f766e',
        fillOpacity: 1,
      }).addTo(g);
      marker.bindTooltip(s.label ?? s.name, { direction: 'top', offset: [0, -6] });
      if (s.onClick) marker.on('click', s.onClick);
    }
    for (const b of buses) {
      L.marker([b.lat, b.lon], {
        icon: L.divIcon({ className: 'bus-marker', html: '🚌', iconSize: [28, 28], iconAnchor: [14, 14] }),
        zIndexOffset: 1000,
      })
        .bindTooltip(b.plate, { direction: 'top', offset: [0, -12] })
        .addTo(g);
    }
    if (me) {
      L.circleMarker([me.lat, me.lon], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
      })
        .bindTooltip('我的位置')
        .addTo(g);
    }

    if (!fitted.current) {
      const hl = stops.find((s) => s.highlight);
      if (fit === 'highlight' && hl) {
        m.setView([hl.lat, hl.lon], 16);
        fitted.current = true;
      } else if (fit === 'me' && me) {
        m.setView([me.lat, me.lon], 16);
        fitted.current = true;
      } else if (stops.length > 0) {
        m.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lon] as [number, number])), {
          padding: [24, 24],
        });
        fitted.current = true;
      }
    }
  }, [stops, lines, buses, me, fit]);

  return <div ref={el} className="bus-map" style={{ height }} />;
}

/** 解析 WKT LINESTRING / MULTILINESTRING 成 [lat, lon] 陣列 */
export function parseWkt(wkt: string): [number, number][][] {
  const out: [number, number][][] = [];
  for (const m of wkt.matchAll(/\(([^()]+)\)/g)) {
    const pts = m[1]
      .split(',')
      .map((p) => p.trim().split(/\s+/).map(Number))
      .filter((p) => p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]))
      .map(([lon, lat]) => [lat, lon] as [number, number]);
    if (pts.length > 1) out.push(pts);
  }
  return out;
}
