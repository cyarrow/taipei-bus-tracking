import { useState } from 'react';
import { installUpdate, UpdateError, type UpdateInfo } from '../updater';

interface Props {
  info: UpdateInfo;
  onDismiss?: () => void;
}

export default function UpdateBanner({ info, onDismiss }: Props) {
  const [percent, setPercent] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setMessage(undefined);
    setPercent(0);
    try {
      const r = await installUpdate(info, setPercent);
      if (r === 'need-permission') {
        setMessage('請在設定中允許本 App「安裝不明應用程式」，回來後再按一次「更新」');
        setPercent(undefined);
      } else {
        setMessage('下載完成，請在安裝畫面按「更新」');
      }
    } catch (e) {
      setMessage(e instanceof UpdateError ? e.message : '更新失敗');
      setPercent(undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="update-banner">
      <div className="update-text">
        <strong>有新版本：{info.name}</strong>
        {info.notes && <span className="update-notes">{info.notes}</span>}
        {busy && percent != null && (
          <div className="progress">
            <div style={{ width: `${percent}%` }} />
          </div>
        )}
        {message && <span className="update-msg">{message}</span>}
      </div>
      <div className="update-actions">
        <button className="primary-btn small" onClick={start} disabled={busy}>
          {busy ? `${percent ?? 0}%` : '更新'}
        </button>
        {onDismiss && !busy && (
          <button className="text-btn" onClick={onDismiss}>
            稍後
          </button>
        )}
      </div>
    </div>
  );
}
