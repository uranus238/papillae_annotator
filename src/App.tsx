import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleDot,
  ShieldCheck,
  FolderInput,
  Download,
  Undo2,
  Redo2,
  HelpCircle,
  X,
  FileJson,
  Table2,
  Image as ImageIcon,
  Archive,
  Settings2,
} from 'lucide-react';
import { AnnotationPanel } from './AnnotationPanel';
import { MetadataPanel } from './MetadataPanel';
import { Viewer, type Mode, type Selection, type ROI } from './Viewer';
import { useProject } from './useProject';
import {
  addPoint,
  editPoint,
  mergeProject,
  newSession,
  nextLandmark,
  now,
  patchSession,
  recordLandmark,
  setStatus,
  validateProject,
  type ImageRecord,
  type Metadata,
  type Project,
  type Session,
  type Status,
  type XY,
} from './domain';
import { DEFAULT_DISPLAY, importImage } from './images';
import { csvZip, download, importCSVs, parseProject, serializeProject, zipBackup } from './io';
import JSZip from 'jszip';
import { ZodError } from 'zod';
function message(e: unknown) {
  return e instanceof ZodError
    ? 'データ形式が不正です: ' +
        e.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')} (${i.message})`)
          .join(' / ')
    : String(e instanceof Error ? e.message : e);
}
export default function App() {
  const store = useProject();
  const { project, commit } = store;
  const [imageId, setImageId] = useState(''),
    [sessionId, setSessionId] = useState('');
  const image = project.images.find((i) => i.image_id === imageId) ?? project.images[0];
  const session =
    project.sessions.find(
      (s) => s.annotation_session_id === sessionId && s.image_id === image?.image_id,
    ) ?? project.sessions.find((s) => s.image_id === image?.image_id);
  const [mode, setMode] = useState<Mode>('papillae'),
    [category, setCategory] = useState('a1'),
    [landmark, setLandmark] = useState('eye');
  const [selection, setSelection] = useState<Selection>(null),
    [auto, setAuto] = useState(true),
    [skipped, setSkipped] = useState<string[]>([]),
    [space, setSpace] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]),
    [show, setShow] = useState(true),
    [radius, setRadius] = useState(4),
    [opacity, setOpacity] = useState(0.85),
    [display, setDisplay] = useState(DEFAULT_DISPLAY),
    [roi, setROI] = useState<ROI | null>(null);
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [exports, setExports] = useState(false),
    [help, setHelp] = useState(false),
    [drag, setDrag] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null),
    dataInput = useRef<HTMLInputElement>(null),
    configInput = useRef<HTMLInputElement>(null),
    exportRef = useRef<((includeLandmarks: boolean) => Promise<Blob>) | null>(null);
  const latest = useRef(project);
  latest.current = project;
  useEffect(() => {
    setSelection(null);
    setSkipped([]);
    setROI(null);
    setDisplay(DEFAULT_DISPLAY);
    if (auto && session) {
      const first = nextLandmark(project, session);
      if (first) setLandmark(first);
    }
  }, [image?.image_id, session?.annotation_session_id]);
  useEffect(() => {
    if (!project.categories.some((c) => c.id === category)) setCategory(project.categories[0].id);
    if (!project.landmark_definitions.some((l) => l.id === landmark))
      setLandmark(project.landmark_definitions[0].id);
  }, [project.categories, project.landmark_definitions]);
  const act = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setNotice(message(e));
    }
  };
  const asyncAct = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  };
  const updateSession = (fn: (s: Session) => Session) => {
    if (session) commit((p) => patchSession(p, session.annotation_session_id, fn));
  };
  const changeMetadata = (change: Partial<Metadata>) => {
    if (!image) return;
    if (
      Object.entries(change).some(
        ([k, v]) =>
          ['SL_mm', 'HL_mm', 'pixel_size_um'].includes(k) &&
          v !== null &&
          (!Number.isFinite(v) || Number(v) < 0 || (k === 'pixel_size_um' && Number(v) === 0)),
      )
    ) {
      setNotice('長さは0以上、ピクセルサイズは0より大きい数値にしてください');
      return;
    }
    commit((p) => ({
      ...p,
      updated_at: now(),
      images: p.images.map((im) =>
        im.image_id === image.image_id ? { ...im, metadata: { ...im.metadata, ...change } } : im,
      ),
    }));
  };
  const importFiles = async (files: File[]) =>
    asyncAct(async () => {
      const loaded: ImageRecord[] = [];
      const messages: string[] = [];
      for (const file of files) {
        try {
          const result = await importImage(file);
          loaded.push(result.image);
          if (result.warning) messages.push(result.warning);
        } catch (e) {
          messages.push(`${file.name}: ${String(e)}`);
        }
      }
      if (loaded.length) {
        commit((p) => {
          const images = [...p.images];
          const sessions = [...p.sessions];
          for (const im of loaded) {
            if (p.images.some((i) => i.sha256 === im.sha256))
              messages.push(`${im.image_filename}: 同じ元画像が登録済みです（別画像IDで保持）`);
            images.push(im);
            sessions.push(newSession(p, im.image_id, ''));
          }
          return { ...p, images, sessions, updated_at: now() };
        });
        setImageId(loaded[0].image_id);
        setSessionId('');
      }
      setNotice(messages.join('\n') || `${loaded.length}画像を登録しました`);
    });
  const demo = () =>
    asyncAct(async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}sample.png`);
      if (!response.ok) throw new Error('サンプルを読み込めません');
      await importFiles([
        new File([await response.blob()], 'sample_synthetic.png', { type: 'image/png' }),
      ]);
    });
  const onAdd = (pos: XY) => {
    if (!session) return;
    act(() => {
      if (mode === 'papillae') updateSession((s) => addPoint(s, category, pos));
      else if (mode === 'landmark') {
        const existing = session.landmarks[landmark].observation_status === 'recorded';
        if (existing) {
          setNotice('記録済みです。編集モードで点を移動・削除してください。');
          setSelection({ kind: 'landmark', id: landmark });
          setMode('edit');
          return;
        }
        const changed = recordLandmark(session, landmark, pos);
        updateSession(() => changed);
        if (auto) {
          const next = nextLandmark(project, changed, skipped);
          if (next) setLandmark(next);
          else
            setNotice(
              Object.values(changed.landmarks).every((l) => l.observation_status === 'recorded')
                ? '全ランドマークを記録しました'
                : '自動入力の対象は終了しました。欠測項目はそのまま保存できます。',
            );
        }
      }
    });
  };
  const onMove = (sel: NonNullable<Selection>, pos: XY) => {
    if (
      !image ||
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      pos.x < 0 ||
      pos.y < 0 ||
      pos.x >= image.width ||
      pos.y >= image.height
    ) {
      setNotice('画像範囲内の座標を指定してください');
      return;
    }
    updateSession((s) =>
      sel.kind === 'papillae'
        ? editPoint(s, sel.id, { x_px: pos.x, y_px: pos.y })
        : recordLandmark(s, sel.id, pos),
    );
  };
  const onDelete = () => {
    if (!selection) return;
    updateSession((s) =>
      selection.kind === 'papillae'
        ? editPoint(s, selection.id, null)
        : recordLandmark(s, selection.id, null),
    );
    setSelection(null);
  };
  const onSkip = () => {
    if (!session) return;
    const list = [...new Set([...skipped, landmark])];
    setSkipped(list);
    const next = nextLandmark(project, session, list);
    if (next) setLandmark(next);
    else setNotice('次の未記録項目はありません。スキップした項目は欠測として保存します。');
  };
  const onLMStatus = (unavailable: boolean) => {
    if (!session || session.landmarks[landmark].observation_status === 'recorded') return;
    const s = recordLandmark(session, landmark, null, unavailable);
    updateSession(() => s);
    if (auto && unavailable) {
      const next = nextLandmark(project, s, skipped);
      if (next) setLandmark(next);
    }
  };
  const toggleAuto = (v: boolean) => {
    setAuto(v);
    if (v && session) {
      const next = nextLandmark(project, session, skipped);
      if (next) setLandmark(next);
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (busy || store.locked || !store.ready) return;
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (e.key === 'Escape') {
        setSelection(null);
        setExports(false);
        setHelp(false);
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
        }
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          store.redo();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete();
        return;
      }
      if (e.altKey) return;
      const c = project.categories.find((c) => c.shortcut === e.key.toLowerCase());
      if (c) {
        setCategory(c.id);
        setMode('papillae');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  });
  const readData = (files: File[]) =>
    asyncAct(async () => {
      if (!files.length) return;
      let result: { project: Project; report: string };
      if (files.every((f) => /\.csv$/i.test(f.name))) {
        const map: Record<string, string> = {};
        for (const f of files) map[f.name] = await f.text();
        result = importCSVs(latest.current, map);
      } else {
        if (files.length !== 1) throw new Error('JSONまたはZIPを1つ選択してください');
        const file = files[0];
        let text: string;
        if (/\.zip$/i.test(file.name)) {
          const zip = await JSZip.loadAsync(file);
          const entry = zip.file('project.json');
          if (!entry) throw new Error('ZIPにproject.jsonがありません');
          text = await entry.async('string');
        } else text = await file.text();
        const incoming = await parseProject(text);
        if (!latest.current.images.length && !latest.current.sessions.length)
          result = {
            project: incoming,
            report: `${incoming.images.length}画像・${incoming.sessions.length}セッションを復元しました`,
          };
        else result = mergeProject(latest.current, incoming);
      }
      commit(() => result.project);
      setNotice(result.report);
    });
  const exportData = (kind: string) =>
    asyncAct(async () => {
      setExports(false);
      const missing =
        project.images.some((i) => !i.metadata.ID.trim()) ||
        project.sessions.some((s) => !s.observer.trim());
      if (missing)
        setNotice('IDまたはobserverが未入力の下書きを含めて出力します。解析前に補完してください。');
      if (kind === 'json') download(serializeProject(project), 'project.json', 'application/json');
      if (kind === 'csv') download(await csvZip(project), 'papillae_csv.zip');
      if (kind === 'zip') download(await zipBackup(project), 'papillae_backup.zip');
      if (kind === 'png' || kind === 'png-papillae' || kind === 'png-landmarks') {
        if (!exportRef.current || !image || !session) throw new Error('画像を読み込んでください');
        const render = exportRef.current;
        const prefix = `annotated_${image.image_id.slice(0, 8)}_${session.annotation_session_id.slice(0, 8)}`;
        if (kind === 'png') {
          const zip = new JSZip();
          zip.file(`${prefix}_papillae.png`, await render(false));
          zip.file(`${prefix}_with_landmarks.png`, await render(true));
          download(await zip.generateAsync({ type: 'blob' }), `${prefix}_2versions.zip`);
        } else {
          const includeLandmarks = kind === 'png-landmarks';
          download(
            await render(includeLandmarks),
            `${prefix}_${includeLandmarks ? 'with_landmarks' : 'papillae'}.png`,
          );
        }
      }
    });
  const configImport = (file: File) =>
    asyncAct(async () => {
      const config = JSON.parse(await file.text());
      const p = latest.current;
      if (
        p.sessions.some(
          (s) =>
            s.points.length ||
            Object.values(s.landmarks).some((l) => l.observation_status !== 'unrecorded') ||
            Object.values(s.statuses).some((c) => c.observation_status !== 'unobserved'),
        )
      )
        throw new Error(
          '記録開始後のカテゴリ変更はできません。設定を出力し、新しいブラウザプロファイルで画像登録前に読み込んでください。',
        );
      const changed = validateProject({
        ...p,
        categories: config.categories,
        landmark_definitions: config.landmark_definitions,
        sessions: [],
      });
      changed.sessions = p.sessions.map((s) => ({
        ...newSession(changed, s.image_id, s.observer),
        annotation_session_id: s.annotation_session_id,
        created_at: s.created_at,
      }));
      commit(() => changed);
      setNotice('カテゴリ設定を読み込みました');
    });
  const requestImport = useCallback(() => imageInput.current?.click(), []);
  const duplicate =
    image &&
    project.images.some(
      (i) =>
        i.image_id !== image.image_id &&
        i.sha256 === image.sha256 &&
        i.metadata.ID === image.metadata.ID &&
        i.metadata.side === image.metadata.side,
    );
  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!store.locked && !busy) void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <CircleDot size={25} />
          </div>
          <div>
            <h1>
              Papillae <span>Annotator</span>
            </h1>
            <p>感覚孔器・ランドマーク記録</p>
          </div>
          <span className="version">v1.0</span>
        </div>
        <div className="header-actions">
          <span
            className={`save-indicator ${store.saveState.includes('失敗') ? 'error' : ''}`}
            role="status"
          >
            <span className="live-dot" />
            {store.saveState}
          </span>
          <button
            onClick={() => dataInput.current?.click()}
            disabled={!store.ready || store.locked || busy}
          >
            <FolderInput size={16} />
            データ読込
          </button>
          <div className="export-wrapper">
            <button
              className="primary"
              aria-expanded={exports}
              onClick={() => setExports((v) => !v)}
              disabled={!store.ready || busy}
            >
              <Download size={16} />
              書き出す
            </button>
            {exports && (
              <div className="export-menu">
                <button onClick={() => exportData('json')}>
                  <FileJson size={17} />
                  <span>
                    プロジェクト JSON<small>画像・全セッションを保存</small>
                  </span>
                </button>
                <button onClick={() => exportData('csv')}>
                  <Table2 size={17} />
                  <span>
                    CSV 5種 ZIP<small>計数・座標・状態・個体情報</small>
                  </span>
                </button>
                <button onClick={() => exportData('png')}>
                  <ImageIcon size={17} />
                  <span>
                    注釈つき PNG 2種 ZIP<small>Papillaeのみ / ＋Landmark</small>
                  </span>
                </button>
                <button onClick={() => exportData('png-papillae')}>
                  <ImageIcon size={17} />
                  <span>
                    Papillaeのみ PNG<small>全孔器をカテゴリ別の色で出力</small>
                  </span>
                </button>
                <button onClick={() => exportData('png-landmarks')}>
                  <ImageIcon size={17} />
                  <span>
                    Papillae＋Landmark PNG<small>Landmarkは共通の黄色</small>
                  </span>
                </button>
                <button onClick={() => exportData('zip')}>
                  <Archive size={17} />
                  <span>
                    完全バックアップ ZIP<small>JSON + 元画像 + CSV</small>
                  </span>
                </button>
              </div>
            )}
          </div>
          <button
            className="icon-button"
            title="ヘルプ"
            aria-label="ヘルプ"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={19} />
          </button>
        </div>
      </header>
      <div className="workspace-bar">
        <span>
          <b>WORKSPACE</b>
          <i>/</i>
          {image?.metadata.ID || '新しいプロジェクト'}
          {image && <span className="side-badge">{image.metadata.side} side</span>}
          {duplicate && <span className="warning-text">同一ID・side・画像の重複あり</span>}
        </span>
        <div>
          <button
            title="Undo (Ctrl+Z)"
            aria-label="元に戻す"
            disabled={!store.canUndo}
            onClick={store.undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            title="Redo (Ctrl+Y)"
            aria-label="やり直す"
            disabled={!store.canRedo}
            onClick={store.redo}
          >
            <Redo2 size={16} />
          </button>
          <i />
          <span className="privacy">
            <ShieldCheck size={14} />
            ローカルのみ · 外部送信なし
          </span>
        </div>
      </div>
      <fieldset className="workspace" disabled={!store.ready || store.locked || busy}>
        <MetadataPanel
          project={project}
          image={image}
          session={session}
          onSelectImage={(v) => {
            setImageId(v);
            setSessionId('');
          }}
          onSelectSession={setSessionId}
          onNewSession={() => {
            if (image) {
              const s = newSession(project, image.image_id, '');
              commit((p) => ({ ...p, sessions: [...p.sessions, s], updated_at: now() }));
              setSessionId(s.annotation_session_id);
              setNotice('新しいセッションを作成しました。計数者を入力してください。');
            }
          }}
          onMetadata={changeMetadata}
          onObserver={(v) => {
            if (!session || !image) return;
            commit((p) => ({
              ...patchSession(p, session.annotation_session_id, (s) => ({ ...s, observer: v })),
              images: p.images.map((im) =>
                im.image_id === image.image_id
                  ? { ...im, metadata: { ...im.metadata, observer: v } }
                  : im,
              ),
            }));
          }}
          onImport={requestImport}
          display={display}
          setDisplay={setDisplay}
          resetDisplay={() => setDisplay(DEFAULT_DISPLAY)}
        />
        <Viewer
          project={project}
          image={image}
          session={session}
          mode={mode}
          category={category}
          landmark={landmark}
          selection={selection}
          setSelection={setSelection}
          onAdd={onAdd}
          onMove={onMove}
          onImport={requestImport}
          onDemo={demo}
          display={display}
          radius={radius}
          opacity={opacity}
          hidden={hidden}
          show={show}
          setShow={setShow}
          space={space}
          roi={roi}
          setROI={setROI}
          onError={setNotice}
          exportRef={exportRef}
        />
        <AnnotationPanel
          project={project}
          session={session}
          mode={mode}
          setMode={(v) => {
            setMode(v);
            if (v === 'landmark' && auto && session) {
              const first = nextLandmark(project, session, skipped);
              if (first) setLandmark(first);
            }
          }}
          category={category}
          setCategory={setCategory}
          landmark={landmark}
          setLandmark={setLandmark}
          auto={auto}
          setAuto={toggleAuto}
          skipped={skipped}
          onSkip={onSkip}
          onStatus={(v: Status) => act(() => updateSession((s) => setStatus(s, category, v)))}
          onLMStatus={onLMStatus}
          hidden={hidden}
          setHidden={setHidden}
          radius={radius}
          setRadius={setRadius}
          opacity={opacity}
          setOpacity={setOpacity}
          onColor={(v) =>
            commit((p) => ({
              ...p,
              categories: p.categories.map((c) => (c.id === category ? { ...c, color: v } : c)),
              updated_at: now(),
            }))
          }
          selection={selection}
          onDelete={onDelete}
          onReclassify={(c) => {
            if (selection?.kind === 'papillae')
              updateSession((s) => editPoint(s, selection.id, { category: c }));
          }}
          onPosition={(x, y) => {
            if (selection) onMove(selection, { x, y });
          }}
          onClearSkip={() => setSkipped([])}
        />
      </fieldset>
      <footer className="app-footer">
        <span>
          PAPILLAE ANNOTATOR <b>·</b> 手動アノテーション
        </span>
        <span>
          {project.images.length} images <b>·</b> {project.sessions.length} sessions <b>·</b>{' '}
          <button
            onClick={() =>
              download(
                JSON.stringify(
                  {
                    categories: project.categories,
                    landmark_definitions: project.landmark_definitions,
                  },
                  null,
                  2,
                ),
                'categories.json',
                'application/json',
              )
            }
          >
            <Settings2 size={12} />
            設定保存
          </button>
          <button disabled={store.locked} onClick={() => configInput.current?.click()}>
            設定読込
          </button>
        </span>
      </footer>
      <input
        ref={imageInput}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.tif,.tiff"
        hidden
        onChange={(e) => {
          void importFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={dataInput}
        type="file"
        multiple
        accept=".json,.zip,.csv"
        hidden
        onChange={(e) => {
          void readData(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={configInput}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void configImport(e.target.files[0]);
          e.target.value = '';
        }}
      />
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button aria-label="通知を閉じる" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {drag && <div className="drop-overlay">画像をドロップして追加</div>}
      {busy && (
        <div className="busy-overlay">
          <div className="spinner" />
          処理中… この画面を閉じずにお待ちください
        </div>
      )}
      {store.locked && (
        <div className="locked-banner">
          {store.saveState}。別タブを閉じてから、この画面を再読み込みしてください。
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-label="使い方"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close-modal" aria-label="閉じる" onClick={() => setHelp(false)}>
              <X size={20} />
            </button>
            <span className="eyebrow">QUICK GUIDE</span>
            <h2>観察から、解析用データへ。</h2>
            <ol>
              <li>画像を読み込み、個体ID・side・計数者を入力。</li>
              <li>
                Papillaeカテゴリを選び、画像上をクリック。観察が終わったら「計数完了」。0個でも完了を指定します。
              </li>
              <li>
                Landmarkモードでは1点記録すると次の未記録項目へ。写らない項目は観察不可またはスキップ。
              </li>
              <li>編集モードで点をドラッグ。選択点は座標・カテゴリを変更、Deleteで削除。</li>
              <li>JSONまたは完全バックアップZIPを定期保存。共同研究者のJSONは追加統合します。</li>
            </ol>
            <div className="help-keys">
              <kbd>Ctrl Z</kbd> 元に戻す <kbd>Ctrl Y</kbd> やり直す <kbd>Space</kbd> パン{' '}
              <kbd>Esc</kbd> 選択解除
            </div>
            <p>
              カテゴリのキーは各ボタン右上に表示。座標は画像左上原点の元画像pxです。未観察・観察不可はNA、計数中は暫定値。完全合計は全対象カテゴリが完了するまでNAです。
            </p>
            <p className="muted">
              データはこの端末・ブラウザ・URLに保存されます。ブラウザのデータ消去で失われるため、JSON/ZIPバックアップを保管してください。画像表示調整・ROI・スキップは作業中の表示設定です。
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              作業をはじめる
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
