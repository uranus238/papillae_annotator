import {
  Check,
  EyeOff,
  Crosshair,
  MousePointer2,
  Hand,
  CircleDot,
  SkipForward,
  CheckCheck,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { GROUPS, STATUS_LABEL, LM_LABEL } from './config';
import { aggregate, counts, type Project, type Session, type Status } from './domain';
import type { Mode, Selection } from './Viewer';
import { BulkComplete } from './BulkComplete';
type Props = {
  project: Project;
  session?: Session;
  mode: Mode;
  setMode: (v: Mode) => void;
  category: string;
  setCategory: (v: string) => void;
  landmark: string;
  setLandmark: (v: string) => void;
  auto: boolean;
  setAuto: (v: boolean) => void;
  onSkip: () => void;
  skipped: string[];
  onStatus: (status: Status) => void;
  onBulkComplete: (categories: string[]) => void;
  onLMStatus: (unavailable: boolean) => void;
  hidden: string[];
  setHidden: (v: string[]) => void;
  radius: number;
  setRadius: (v: number) => void;
  opacity: number;
  setOpacity: (v: number) => void;
  onColor: (v: string) => void;
  selection: Selection;
  onDelete: () => void;
  onReclassify: (c: string) => void;
  onPosition: (x: number, y: number) => void;
  onClearSkip: () => void;
  onClose?: () => void;
};
export function AnnotationPanel(p: Props) {
  const { project, session: s } = p;
  const count = s ? counts(project, s) : {};
  const status = s?.statuses[p.category]?.observation_status ?? 'unobserved';
  const current = project.categories.find((c) => c.id === p.category) ?? project.categories[0];
  const lm = s?.landmarks[p.landmark];
  const total = s ? aggregate(project, s) : null;
  const selected =
    p.selection?.kind === 'papillae'
      ? s?.points.find((pt) => pt.point_id === p.selection?.id)
      : p.selection
        ? s?.landmarks[p.selection.id]
        : undefined;
  return (
    <aside
      className="right-panel"
      role={p.onClose ? 'dialog' : undefined}
      aria-modal={p.onClose ? true : undefined}
      aria-label={p.onClose ? 'アノテーション' : undefined}
    >
      <div className="panel-title">
        <span>アノテーション</span>
        {p.onClose ? (
          <button className="mobile-close" aria-label="パネルを閉じる" onClick={p.onClose}>
            <X size={20} />
          </button>
        ) : (
          <span className="section-number">02</span>
        )}
      </div>
      <div className="mode-tabs" role="tablist" aria-label="記録モード">
        {(
          [
            { id: 'papillae', label: 'Papillae', Icon: CircleDot },
            { id: 'landmark', label: 'Landmark', Icon: Crosshair },
            { id: 'edit', label: '編集', Icon: MousePointer2 },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={p.mode === id}
            className={p.mode === id ? 'selected' : ''}
            onClick={() => p.setMode(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div className="annotation-scroll">
        <div className="section-intro">
          <span>{p.mode === 'landmark' ? 'LANDMARKS' : 'PAPILLAE CATEGORIES'}</span>
          <button
            className={p.mode === 'pan' ? 'active compact' : 'compact'}
            onClick={() => p.setMode(p.mode === 'pan' ? 'papillae' : 'pan')}
            title="パンモード"
          >
            <Hand size={14} />
          </button>
        </div>
        {p.mode === 'landmark' ? (
          <>
            <label className="auto-toggle">
              <span>
                自動で次へ <small>未記録の項目を順番に</small>
              </span>
              <input
                type="checkbox"
                checked={p.auto}
                onChange={(e) => p.setAuto(e.target.checked)}
              />
            </label>
            <div className="landmark-list">
              {project.landmark_definitions.map((l, i) => {
                const state = s?.landmarks[l.id].observation_status ?? 'unrecorded';
                return (
                  <button
                    key={l.id}
                    data-testid={`landmark-${l.id}`}
                    className={`landmark-button ${p.landmark === l.id ? 'chosen' : ''}`}
                    onClick={() => p.setLandmark(l.id)}
                  >
                    <span className="lm-number">{String(i + 1).padStart(2, '0')}</span>
                    <span>{l.label}</span>
                    <small className={`lm-state ${state}`}>
                      {p.skipped.includes(l.id) && state === 'unrecorded'
                        ? 'スキップ'
                        : LM_LABEL[state]}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className="state-actions">
              <button onClick={p.onSkip} disabled={!s}>
                <SkipForward size={14} />
                スキップ
              </button>
              <button
                onClick={() => p.onLMStatus(true)}
                disabled={!s || lm?.observation_status === 'recorded'}
              >
                <EyeOff size={14} />
                観察不可
              </button>
              <button
                onClick={() => p.onLMStatus(false)}
                disabled={!s || lm?.observation_status === 'recorded'}
              >
                未記録に
              </button>
            </div>
            <button className="text-button" onClick={p.onClearSkip}>
              スキップを解除
            </button>
            {s &&
            project.landmark_definitions.every(
              (l) => s.landmarks[l.id].observation_status === 'recorded',
            ) ? (
              <div className="completion">
                <CheckCheck size={16} />
                全ランドマークの記録完了
              </div>
            ) : (
              <p className="muted note">
                {s
                  ? Object.values(s.landmarks).filter((l) => l.observation_status === 'recorded')
                      .length
                  : 0}{' '}
                / {project.landmark_definitions.length} 記録済み。欠測のまま保存できます。
              </p>
            )}
          </>
        ) : (
          <>
            <div className="category-groups">
              {GROUPS.map((group, index) => (
                <section className="category-group" key={group}>
                  <div className="group-heading">
                    <span>
                      <b>{'ABCD'[index]}</b>
                      {group}
                    </span>
                    <small>
                      {project.categories.filter((c) => c.group === group).length} categories
                    </small>
                  </div>
                  <div className={`category-grid ${group === 'a系列' ? 'six-columns' : ''}`}>
                    {project.categories
                      .filter((c) => c.group === group)
                      .map((c) => {
                        const state = s?.statuses[c.id].observation_status ?? 'unobserved';
                        return (
                          <button
                            key={c.id}
                            data-testid={`category-${c.id}`}
                            className={`category-button ${p.category === c.id ? 'chosen' : ''} ${p.hidden.includes(c.id) ? 'hidden-category' : ''}`}
                            style={{ '--category': c.color } as React.CSSProperties}
                            onClick={() => {
                              p.setCategory(c.id);
                              if (p.mode === 'pan') p.setMode('papillae');
                            }}
                            title={`${c.id} [${c.shortcut}] · ${STATUS_LABEL[state]}`}
                          >
                            <span className="category-top">
                              <b>{c.id}</b>
                              <kbd>{c.shortcut}</kbd>
                            </span>
                            <span className="category-bottom">
                              <strong>
                                {count[c.id] ?? '—'}
                                {state === 'counting' && <em>*</em>}
                              </strong>
                              <span className={`status-dot ${state}`} title={STATUS_LABEL[state]} />
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </section>
              ))}
            </div>
            <div className="category-state">
              <div className="selected-category-label">
                <span style={{ background: current.color }} />
                <b>{p.category}</b>
                <small>{STATUS_LABEL[status]}</small>
                <button
                  className="icon-button"
                  title="このカテゴリの表示切り替え"
                  aria-label="カテゴリ表示切替"
                  onClick={() =>
                    p.setHidden(
                      p.hidden.includes(p.category)
                        ? p.hidden.filter((c) => c !== p.category)
                        : [...p.hidden, p.category],
                    )
                  }
                >
                  <EyeOff size={14} />
                </button>
              </div>
              <div className="state-actions">
                <button
                  className={status === 'complete' ? 'done' : ''}
                  onClick={() => p.onStatus('complete')}
                  disabled={!s}
                >
                  <Check size={14} />
                  計数完了
                </button>
                <button onClick={() => p.onStatus('unavailable')} disabled={!s}>
                  <EyeOff size={14} />
                  観察不可
                </button>
              </div>
              <select
                aria-label="カテゴリ観察状態"
                value={status}
                disabled={!s}
                onChange={(e) => p.onStatus(e.target.value as Status)}
              >
                {Object.entries(STATUS_LABEL).map(([v, label]) => (
                  <option value={v} key={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {s && p.mode === 'papillae' && (
              <BulkComplete
                key={s.annotation_session_id}
                project={project}
                session={s}
                onComplete={p.onBulkComplete}
              />
            )}
            <div className="total-card">
              <div>
                <span>確定小計</span>
                <strong data-testid="total-subtotal">
                  {total?.subtotal ?? 0}
                  <small> 個</small>
                </strong>
              </div>
              <p>
                {total?.complete
                  ? '全カテゴリ計数完了'
                  : `完全合計 NA · 暫定 ${total?.provisional ?? 0} 個`}
                <br />
                <small>
                  a系列 {s ? aggregate(project, s, 'a系列').subtotal : 0} / c系列{' '}
                  {s ? aggregate(project, s, 'c系列').subtotal : 0}（確定小計）
                </small>
              </p>
            </div>
            <p className="legend">
              <span className="status-dot unobserved" />
              未観察 <span className="status-dot counting" />
              計数中* <span className="status-dot complete" />
              完了 <span className="status-dot unavailable" />
              不可
            </p>
          </>
        )}
        {p.mode === 'edit' && (
          <section className="edit-card">
            <h3>選択した点</h3>
            {selected ? (
              <>
                <p>
                  {'category' in selected ? selected.category : selected.landmark} ·{' '}
                  {'x_px' in selected ? selected.x_px?.toFixed(2) : ''}, {selected.y_px?.toFixed(2)}{' '}
                  px
                </p>
                <div className="two-columns">
                  <label>
                    X
                    <input
                      type="number"
                      aria-label="選択点X"
                      value={selected.x_px ?? 0}
                      step="0.1"
                      onChange={(e) => p.onPosition(Number(e.target.value), selected.y_px ?? 0)}
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      aria-label="選択点Y"
                      value={selected.y_px ?? 0}
                      step="0.1"
                      onChange={(e) => p.onPosition(selected.x_px ?? 0, Number(e.target.value))}
                    />
                  </label>
                </div>
                {p.selection?.kind === 'papillae' && (
                  <label>
                    カテゴリ変更
                    <select
                      aria-label="選択点カテゴリ"
                      value={'category' in selected ? selected.category : ''}
                      onChange={(e) => p.onReclassify(e.target.value)}
                    >
                      {project.categories.map((c) => (
                        <option key={c.id}>{c.id}</option>
                      ))}
                    </select>
                  </label>
                )}
                {p.onClose && (
                  <div className="mobile-nudge" aria-label="1ピクセルずつ移動">
                    {(
                      [
                        { label: '左へ1px', dx: -1, dy: 0, Icon: ArrowLeft },
                        { label: '上へ1px', dx: 0, dy: -1, Icon: ArrowUp },
                        { label: '下へ1px', dx: 0, dy: 1, Icon: ArrowDown },
                        { label: '右へ1px', dx: 1, dy: 0, Icon: ArrowRight },
                      ] as const
                    ).map(({ label, dx, dy, Icon }) => (
                      <button
                        key={label}
                        aria-label={label}
                        onClick={() => p.onPosition(selected.x_px! + dx, selected.y_px! + dy)}
                      >
                        <Icon size={20} />
                      </button>
                    ))}
                  </div>
                )}
                <button className="danger" onClick={p.onDelete}>
                  選択点を削除
                </button>
              </>
            ) : (
              <p className="muted">画像上の点を選択。ドラッグで移動、Deleteで削除できます。</p>
            )}
          </section>
        )}
        {s && Object.keys(s.retired_landmarks).length > 0 && (
          <details className="retired-landmarks">
            <summary>以前のLandmark（保全）</summary>
            <p className="muted note">
              現在の項目には含めず、旧データを保全しています。JSON・旧項目CSVに出力されます。
            </p>
            {Object.values(s.retired_landmarks).map((l) => (
              <p key={l.landmark}>
                {l.label}：{LM_LABEL[l.observation_status]}
                {l.x_px !== null ? ` (${l.x_px.toFixed(2)}, ${l.y_px!.toFixed(2)} px)` : ''}
              </p>
            ))}
          </details>
        )}
        <details className="marker-settings">
          <summary>点の表示設定</summary>
          <label>
            半径 <span>{p.radius} px（画面上）</span>
            <input
              type="range"
              min="2"
              max="12"
              value={p.radius}
              onChange={(e) => p.setRadius(+e.target.value)}
            />
          </label>
          <label>
            不透明度 <span>{Math.round(p.opacity * 100)}%</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={p.opacity}
              onChange={(e) => p.setOpacity(+e.target.value)}
            />
          </label>
          <label>
            選択カテゴリの色
            <input
              type="color"
              aria-label="カテゴリ色"
              value={current.color}
              onChange={(e) => p.onColor(e.target.value)}
            />
          </label>
        </details>
      </div>
    </aside>
  );
}
