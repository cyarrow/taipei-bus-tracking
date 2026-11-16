import { useEffect, useRef } from 'react';

/** 畫面顯示時每隔 ms 執行一次；App 切到背景時暫停，回到前景立即執行 */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    if (!enabled) return;
    ref.current();
    let timer = window.setInterval(() => ref.current(), ms);
    const onVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState === 'visible') {
        ref.current();
        timer = window.setInterval(() => ref.current(), ms);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms, enabled]);
}
