import type { Group } from '../types';

interface Props {
  groups: Group[];
  onChange: (g: Group[]) => void;
  onBack: () => void;
}

export default function Groups({ groups, onChange, onBack }: Props) {
  const update = (id: string, patch: Partial<Group>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const add = () =>
    onChange([...groups, { id: `g${Date.now()}`, name: `分組 ${groups.length + 1}` }]);

  const remove = (g: Group) => {
    if (window.confirm(`刪除分組「${g.name}」？裡面的站牌會變成不分組。`)) {
      onChange(groups.filter((x) => x.id !== g.id));
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="text-btn" onClick={onBack}>
          ‹ 返回
        </button>
        <h1>管理分組</h1>
        <span style={{ width: 48 }} />
      </header>

      <p className="muted pad">
        設定時段後，在這段時間打開 App 會自動顯示該分組。時段可以留空。
      </p>

      <ul className="group-list">
        {groups.map((g) => (
          <li key={g.id} className="group-item">
            <input
              className="group-name"
              value={g.name}
              onChange={(e) => update(g.id, { name: e.target.value })}
              aria-label="分組名稱"
            />
            <div className="group-time">
              <input
                type="time"
                value={g.start ?? ''}
                onChange={(e) => update(g.id, { start: e.target.value || undefined })}
                aria-label="開始時間"
              />
              <span>～</span>
              <input
                type="time"
                value={g.end ?? ''}
                onChange={(e) => update(g.id, { end: e.target.value || undefined })}
                aria-label="結束時間"
              />
              <button className="danger-btn" onClick={() => remove(g)}>
                刪除
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button className="primary-btn wide" onClick={add}>
        ＋ 新增分組
      </button>
    </div>
  );
}
