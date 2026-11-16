import type { Eta } from './types';

export type EtaTone = 'arriving' | 'soon' | 'normal' | 'inactive';

export interface EtaDisplay {
  text: string;
  sub?: string;
  tone: EtaTone;
  /** 排序用，越小越前面 */
  sortKey: number;
}

function hhmm(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei',
  });
}

/** 同一站可能有多筆（子路線），取最快到站的那一筆 */
export function pickBest(rows: Eta[]): Eta | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => rank(a) - rank(b))[0];
}

function rank(e: Eta): number {
  if (e.StopStatus === 0 && e.EstimateTime != null) return e.EstimateTime;
  return 1e6 + e.StopStatus;
}

export function describeEta(e: Eta | undefined): EtaDisplay {
  if (!e) return { text: '無資料', tone: 'inactive', sortKey: 1e7 };

  const next = hhmm(e.NextBusTime);
  switch (e.StopStatus) {
    case 0: {
      const sec = e.EstimateTime;
      if (sec == null) {
        return { text: next ?? '—', sub: next ? '預計發車' : undefined, tone: 'inactive', sortKey: 1e6 };
      }
      if (sec <= 60) return { text: '進站中', tone: 'arriving', sortKey: sec };
      const min = Math.floor(sec / 60);
      if (min <= 3) return { text: `${min} 分`, sub: '即將進站', tone: 'soon', sortKey: sec };
      return { text: `${min} 分`, tone: 'normal', sortKey: sec };
    }
    case 1:
      return {
        text: next ?? '尚未發車',
        sub: next ? '預計發車' : undefined,
        tone: 'inactive',
        sortKey: 1e6 + 1,
      };
    case 2:
      return { text: '不停靠', sub: '交管', tone: 'inactive', sortKey: 1e6 + 2 };
    case 3:
      return { text: '末班已過', tone: 'inactive', sortKey: 1e6 + 3 };
    case 4:
      return { text: '今日未營運', tone: 'inactive', sortKey: 1e6 + 4 };
    default:
      return { text: '—', tone: 'inactive', sortKey: 1e7 };
  }
}
