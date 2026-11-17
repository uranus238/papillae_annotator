import { ImagePlus, Plus, FlaskConical, SlidersHorizontal, X } from 'lucide-react';
import type { ImageRecord, Project, Session, Metadata } from './domain';
import type { DisplaySettings } from './images';
type Props = {
  project: Project;
  image?: ImageRecord;
  session?: Session;
  onSelectImage: (v: string) => void;
  onSelectSession: (v: string) => void;
  onNewSession: () => void;
  onMetadata: (v: Partial<Metadata>) => void;
  onObserver: (v: string) => void;
  onImport: () => void;
  display: DisplaySettings;
  setDisplay: (v: DisplaySettings) => void;
  resetDisplay: () => void;
  onClose?: () => void;
  onConfigExport?: () => void;
  onConfigImport?: () => void;
};
export function MetadataPanel(p: Props) {
  const m = p.image?.metadata;
  const field = (name: keyof Metadata, label: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        value={m?.[name] ?? ''}
        disabled={!m}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 'any' : undefined}
        onChange={(e) =>
          p.onMetadata({
            [name]:
              type === 'number'
                ? e.target.value === ''
                  ? null
                  : Number(e.target.value)
                : e.target.value,
          })
        }
      />
    </label>
  );
  return (
    <aside
      className="left-panel"
      role={p.onClose ? 'dialog' : undefined}
      aria-modal={p.onClose ? true : undefined}
      aria-label={p.onClose ? '画像・個体情報' : undefined}
    >
      <div className="panel-title">
        <span>画像・個体情報</span>
        {p.onClose ? (
          <button className="mobile-close" aria-label="パネルを閉じる" onClick={p.onClose}>
            <X size={20} />
          </button>
        ) : (
          <span className="section-number">01</span>
        )}
      </div>
      <div className="left-scroll">
        <div className="section-intro">
          <span>
            IMAGES <b>{p.project.images.length.toString().padStart(2, '0')}</b>
          </span>
          <button className="compact" title="画像を追加" onClick={p.onImport}>
            <Plus size={16} />
          </button>
        </div>
        <div className="image-list">
          {p.project.images.length ? (
            p.project.images.map((im, i) => (
              <button
                key={im.image_id}
                className={`image-item ${p.image?.image_id === im.image_id ? 'selected' : ''}`}
                onClick={() => p.onSelectImage(im.image_id)}
              >
                <img src={im.display_data_url} alt="" />
                <span>
                  <b>{im.metadata.ID || `画像 ${String(i + 1).padStart(2, '0')}`}</b>
                  <small title={im.image_filename}>{im.image_filename}</small>
                </span>
                <em>{im.metadata.side}</em>
              </button>
            ))
          ) : (
            <button className="upload-tile" onClick={p.onImport}>
              <ImagePlus size={22} />
              <span>画像を追加</span>
              <small>JPG / PNG / TIFF</small>
            </button>
          )}
        </div>
        {p.onClose && (
          <div className="mobile-project-tools">
            <button onClick={p.onConfigExport}>カテゴリ設定保存</button>
            <button onClick={p.onConfigImport}>設定読込</button>
          </div>
        )}
        <div className="section-divider" />
        <div className="section-intro">
          <span>SPECIMEN INFORMATION</span>
          <FlaskConical size={14} />
        </div>
        <div className="metadata-fields">
          {field('ID', '個体 ID *')}
          <div className="two-columns">
            <label>
              side *
              <select
                aria-label="side"
                value={m?.side ?? 'L'}
                disabled={!m}
                onChange={(e) => p.onMetadata({ side: e.target.value as 'L' | 'R' })}
              >
                <option>L</option>
                <option>R</option>
              </select>
            </label>
            <label>
              sex
              <select
                aria-label="sex"
                value={m?.sex ?? ''}
                disabled={!m}
                onChange={(e) => p.onMetadata({ sex: e.target.value as '' | 'M' | 'F' })}
              >
                <option value="">未入力</option>
                <option>M</option>
                <option>F</option>
              </select>
            </label>
          </div>
          {field('species', '種名')}
          {field('locality', '採集地')}
          <div className="two-columns">
            {field('SL_mm', 'SL (mm)', 'number')}
            {field('HL_mm', 'HL (mm)', 'number')}
          </div>
          {field('pixel_size_um', 'ピクセルサイズ (µm/px)', 'number')}
          <label>
            備考
            <textarea
              value={m?.notes ?? ''}
              disabled={!m}
              rows={2}
              onChange={(e) => p.onMetadata({ notes: e.target.value })}
            />
          </label>
        </div>
        <div className="section-divider" />
        <div className="section-intro">
          <span>ANNOTATION SESSION</span>
          <button
            title="別セッションを作成"
            className="compact"
            disabled={!m}
            onClick={p.onNewSession}
          >
            <Plus size={16} />
          </button>
        </div>
        <label>
          セッション
          <select
            aria-label="セッション"
            value={p.session?.annotation_session_id ?? ''}
            disabled={!m}
            onChange={(e) => p.onSelectSession(e.target.value)}
          >
            {p.project.sessions
              .filter((s) => s.image_id === p.image?.image_id)
              .map((s, i) => (
                <option value={s.annotation_session_id} key={s.annotation_session_id}>
                  {i + 1}. {s.observer || '計数者未入力'} · {s.annotation_session_id.slice(0, 6)}
                </option>
              ))}
          </select>
        </label>
        <label>
          計数者 observer *
          <input
            aria-label="計数者"
            value={p.session?.observer ?? ''}
            disabled={!p.session}
            onChange={(e) => p.onObserver(e.target.value)}
          />
        </label>
        <p className="muted note">
          * 必須情報。未入力でも下書き保存します。別の計数者は新規セッションで記録。
        </p>
        <details className="display-settings" open>
          <summary>
            <SlidersHorizontal size={14} />
            画像の表示調整
          </summary>
          {(
            [
              { key: 'brightness', label: '明度', min: -0.8, max: 0.8, step: 0.05 },
              { key: 'contrast', label: 'コントラスト', min: 0.2, max: 3, step: 0.1 },
              { key: 'gamma', label: 'ガンマ', min: 0.2, max: 3, step: 0.1 },
            ] as const
          ).map((item) => (
            <label key={item.key}>
              {item.label}
              <span>{p.display[item.key].toFixed(2)}</span>
              <input
                aria-label={item.label}
                type="range"
                min={item.min}
                max={item.max}
                step={item.step}
                value={p.display[item.key]}
                onChange={(e) => p.setDisplay({ ...p.display, [item.key]: +e.target.value })}
              />
            </label>
          ))}
          <label>
            チャンネル
            <select
              aria-label="チャンネル"
              value={p.display.channel}
              onChange={(e) =>
                p.setDisplay({
                  ...p.display,
                  channel: e.target.value as DisplaySettings['channel'],
                })
              }
            >
              {['RGB', 'R', 'G', 'B'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={p.resetDisplay}>
            表示調整をリセット
          </button>
          <p className="muted note">元画像と記録座標は変更されません。</p>
        </details>
      </div>
    </aside>
  );
}
