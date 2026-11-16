import type { Group } from './types';

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 找出目前時間落在其時段內的分組（支援跨午夜，例如 22:00～02:00） */
export function groupForNow(groups: Group[], now = new Date()): Group | undefined {
  const cur = now.getHours() * 60 + now.getMinutes();
  return groups.find((g) => {
    if (!g.start || !g.end) return false;
    const s = toMin(g.start);
    const e = toMin(g.end);
    return s <= e ? cur >= s && cur <= e : cur >= s || cur <= e;
  });
}
