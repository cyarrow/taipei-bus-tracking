import { useEffect, useState } from 'react';
import UpdateBanner from '../components/UpdateBanner';
import { loadCredentials, loadSettings, saveCredentials, saveSettings } from '../storage';
import { testCredentials, TdxError } from '../tdx';
import {
  checkForUpdate,
  currentVersion,
  fetchLatestRelease,
  isNative,
  loadGithubToken,
  saveGithubToken,
  UpdateError,
  type UpdateInfo,
} from '../updater';

export default function Settings({ onDone }: { onDone: () => void }) {
  const initial = loadCredentials();
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState(initial?.clientSecret ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [prefs, setPrefs] = useState(loadSettings);
  const [version, setVersion] = useState<string>();
  const [ghToken, setGhToken] = useState(loadGithubToken);
  const [updateMsg, setUpdateMsg] = useState<{ ok: boolean; text: string }>();
  const [update, setUpdate] = useState<UpdateInfo>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    currentVersion().then((v) => setVersion(v.build ? `${v.name}（第 ${v.build} 版）` : v.name));
  }, []);

  const saveToken = async () => {
    const t = ghToken.trim();
    setChecking(true);
    setUpdateMsg(undefined);
    try {
      await fetchLatestRelease(t);
      saveGithubToken(t);
      setUpdateMsg({ ok: true, text: '權杖驗證成功，已儲存' });
      await check();
    } catch (e) {
      setUpdateMsg({ ok: false, text: e instanceof UpdateError ? e.message : '驗證失敗' });
    } finally {
      setChecking(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setUpdate(undefined);
    try {
      const u = await checkForUpdate(true);
      if (u) setUpdate(u);
      else setUpdateMsg({ ok: true, text: '已經是最新版本' });
    } catch (e) {
      setUpdateMsg({ ok: false, text: e instanceof UpdateError ? e.message : '檢查失敗' });
    } finally {
      setChecking(false);
    }
  };

  const setWalkHint = (walkHint: boolean) => {
    const next = { ...prefs, walkHint };
    setPrefs(next);
    saveSettings(next);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const creds = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
    setBusy(true);
    setMessage(undefined);
    try {
      await testCredentials(creds);
      saveCredentials(creds);
      setMessage({ ok: true, text: '驗證成功，已儲存' });
      window.setTimeout(onDone, 600);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof TdxError ? err.message : '驗證失敗' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        {initial ? (
          <button className="text-btn" onClick={onDone}>
            ‹ 返回
          </button>
        ) : (
          <span style={{ width: 48 }} />
        )}
        <h1>設定</h1>
        <span style={{ width: 48 }} />
      </header>

      <form className="settings" onSubmit={save}>
        <p>
          本 App 使用交通部 TDX 平臺的公車資料。請到 TDX 會員中心申請 API 金鑰，並在下方輸入。
          金鑰只會儲存在這支手機上。
        </p>
        <label>
          Client ID
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          Client Secret
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button
          className="primary-btn"
          type="submit"
          disabled={busy || !clientId.trim() || !clientSecret.trim()}
        >
          {busy ? '驗證中…' : '驗證並儲存'}
        </button>
        {message && <p className={message.ok ? 'success' : 'error'}>{message.text}</p>}
        <p className="muted">申請網址：https://tdx.transportdata.tw（會員中心 → API 金鑰）</p>
      </form>

      <section className="settings pref">
        <h2>顯示</h2>
        <label className="switch-row">
          <span>
            首頁顯示步行時間與建議出門時間
            <small className="muted">
              使用手機定位，以直線距離粗估步行時間（距離站牌 3 公里內才顯示）
            </small>
          </span>
          <input
            type="checkbox"
            checked={prefs.walkHint}
            onChange={(e) => setWalkHint(e.target.checked)}
          />
        </label>
        <p className="muted">地圖資料 © OpenStreetMap 貢獻者</p>
      </section>

      <section className="settings pref">
        <h2>App 更新</h2>
        <p className="muted">目前版本：{version ?? '…'}</p>
        {isNative() ? (
          <>
            <p className="muted">
              新版本放在私人 GitHub repo，需要一組「只能讀取這個 repo」的 GitHub 權杖才能檢查與下載。
              權杖只會儲存在這支手機上。設定後，App 每 3 小時會自動檢查一次。
            </p>
            <label>
              GitHub 權杖
              <input
                type="password"
                value={ghToken}
                onChange={(e) => setGhToken(e.target.value)}
                placeholder="github_pat_…"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <div className="btn-row">
              <button
                className="primary-btn"
                onClick={saveToken}
                disabled={checking || !ghToken.trim() || ghToken.trim() === loadGithubToken()}
              >
                儲存權杖
              </button>
              <button className="primary-btn ghost" onClick={check} disabled={checking || !loadGithubToken()}>
                {checking ? '檢查中…' : '立即檢查更新'}
              </button>
            </div>
            {updateMsg && <p className={updateMsg.ok ? 'success' : 'error'}>{updateMsg.text}</p>}
            {update && <UpdateBanner info={update} />}
          </>
        ) : (
          <p className="muted">網頁版不需要更新</p>
        )}
      </section>
    </div>
  );
}
