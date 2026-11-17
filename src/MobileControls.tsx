import {
  Check,
  ChevronUp,
  CircleDot,
  Crosshair,
  Image,
  MousePointer2,
  SkipForward,
  Undo2,
  Redo2,
  EyeOff,
} from 'lucide-react';
import { counts, type Project, type Session } from './domain';
import { STATUS_LABEL, LM_LABEL } from './config';
import type { Mode, Selection } from './Viewer';
type Props = {
  project: Project;
  session?: Session;
  mode: Mode;
  setMode: (v: Mode) => void;
  category: string;
  landmark: string;
  selection: Selection;
  onImages: () => void;
  onAnnotations: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onComplete: () => void;
  onUnavailable: () => void;
  onSkip: () => void;
  disabled: boolean;
};
export function MobileControls(p: Props) {
  const c = p.project.categories.find((c) => c.id === p.category) ?? p.project.categories[0];
  const lm = p.session?.landmarks[p.landmark];
  const value = p.session ? counts(p.project, p.session)[c.id] : null;
  const state = p.session?.statuses[c.id].observation_status ?? 'unobserved';
  return (
    <fieldset className="mobile-dock" disabled={p.disabled}>
      <div className="mobile-mode-row" role="tablist" aria-label="スマホ記録モード">
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
            onClick={() => p.setMode(id)}
            className={p.mode === id ? 'selected' : ''}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <button onClick={p.onImages} aria-label="画像・個体情報を開く">
          <Image size={17} />
          <span>画像</span>
        </button>
        <button aria-label="元に戻す" disabled={!p.canUndo} onClick={p.undo}>
          <Undo2 size={18} />
        </button>
        <button aria-label="やり直す" disabled={!p.canRedo} onClick={p.redo}>
          <Redo2 size={18} />
        </button>
      </div>
      <div className="mobile-category-row">
        <button
          className="mobile-category-select"
          onClick={p.onAnnotations}
          aria-label={p.mode === 'edit' ? '点の編集パネルを開く' : 'カテゴリ一覧を開く'}
        >
          {p.mode === 'papillae' ? (
            <>
              <i style={{ background: c.color }} />
              <strong>{c.id}</strong>
              <span>
                {value ?? 'NA'}
                {state === 'counting' ? '*' : ''} · {STATUS_LABEL[state]}
              </span>
            </>
          ) : p.mode === 'landmark' ? (
            <>
              <Crosshair size={17} />
              <strong>
                {p.project.landmark_definitions.find((l) => l.id === p.landmark)?.label}
              </strong>
              <span>{LM_LABEL[lm?.observation_status ?? 'unrecorded']}</span>
            </>
          ) : (
            <>
              <MousePointer2 size={17} />
              <strong>{p.selection ? '選択点を修正' : '点をタップして選択'}</strong>
            </>
          )}
          <ChevronUp size={16} />
        </button>
        {p.mode === 'papillae' && (
          <>
            <button onClick={p.onComplete} disabled={!p.session} aria-label="計数完了">
              <Check size={17} />
              <span>完了</span>
            </button>
            <button onClick={p.onUnavailable} disabled={!p.session} aria-label="観察不可">
              <EyeOff size={17} />
              <span>不可</span>
            </button>
          </>
        )}
        {p.mode === 'landmark' && (
          <>
            <button onClick={p.onSkip} disabled={!p.session} aria-label="スキップ">
              <SkipForward size={17} />
            </button>
            <button
              onClick={p.onUnavailable}
              disabled={!p.session || lm?.observation_status === 'recorded'}
              aria-label="観察不可"
            >
              <EyeOff size={17} />
              <span>不可</span>
            </button>
          </>
        )}
      </div>
    </fieldset>
  );
}
