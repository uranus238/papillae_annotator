import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KImage, Circle, Group, Line, Text } from 'react-konva';
import Konva from 'konva';
import { Crosshair, ImagePlus, Maximize, Minus, Plus, RotateCcw, Scan, Eye } from 'lucide-react';
import type { Project, Session, ImageRecord, XY, View, Point } from './domain';
import { screenToImage, zoomAt } from './domain';
import { adjustedImage, loadImage, type DisplaySettings } from './images';
import { LANDMARK_COLOR } from './config';
export type Mode = 'papillae' | 'landmark' | 'edit' | 'pan';
export type Selection = { kind: 'papillae' | 'landmark'; id: string } | null;
export type ROI = { x: number; y: number; width: number; height: number };
type Props = {
  image?: ImageRecord;
  session?: Session;
  project: Project;
  mode: Mode;
  category: string;
  landmark: string;
  selection: Selection;
  setSelection: (s: Selection) => void;
  onAdd: (pos: XY) => void;
  onMove: (selection: NonNullable<Selection>, pos: XY) => void;
  onImport: () => void;
  onDemo: () => void;
  display: DisplaySettings;
  radius: number;
  opacity: number;
  hidden: string[];
  show: boolean;
  setShow: (v: boolean) => void;
  space: boolean;
  roi: ROI | null;
  setROI: (r: ROI | null) => void;
  onError: (s: string) => void;
  exportRef: React.RefObject<((includeLandmarks: boolean) => Promise<Blob>) | null>;
};
const Marker = memo(function Marker({
  point,
  color,
  scale,
  radius,
  opacity,
  edit,
  selected,
  onSelect,
  onMove,
}: {
  point: Point;
  color: string;
  scale: number;
  radius: number;
  opacity: number;
  edit: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, pos: XY) => void;
}) {
  return (
    <Circle
      x={point.x_px}
      y={point.y_px}
      radius={radius / scale}
      fill={color}
      opacity={opacity}
      stroke={selected ? '#fff' : '#071b22'}
      strokeWidth={(selected ? 2 : 1) / scale}
      hitStrokeWidth={10 / scale}
      draggable={edit}
      listening={edit}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        if (edit) onSelect(point.point_id);
      }}
      onClick={(e) => {
        e.cancelBubble = true;
        if (edit) onSelect(point.point_id);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        onMove(point.point_id, { x: e.target.x(), y: e.target.y() });
      }}
    />
  );
});
export function Viewer(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [raster, setRaster] = useState<HTMLCanvasElement>();
  const cursorReadout = useRef<HTMLSpanElement>(null);
  const cursorPosition = useRef<XY | null>(null);
  const cursorFrame = useRef<number | null>(null);
  // Pointer tracking updates only this text node, without reconciling the canvas and every mark.
  const updateCursor = (pos: XY | null) => {
    cursorPosition.current = pos;
    if (cursorFrame.current !== null) return;
    cursorFrame.current = requestAnimationFrame(() => {
      cursorFrame.current = null;
      const current = cursorPosition.current;
      if (cursorReadout.current)
        cursorReadout.current.textContent = current
          ? `X ${current.x.toFixed(2)}  /  Y ${current.y.toFixed(2)} px`
          : '原点：画像左上 · 単位：px';
    });
  };
  useEffect(
    () => () => {
      if (cursorFrame.current !== null) cancelAnimationFrame(cursorFrame.current);
    },
    [],
  );
  const [roiMode, setROIMode] = useState(false);
  const [roiDraft, setROIDraft] = useState<ROI | null>(null);
  const start = useRef<XY | null>(null);
  const suppressClickUntil = useRef(0);
  const stage = useRef<Konva.Stage>(null);
  const source = useRef<HTMLImageElement | undefined>(undefined);
  // Stable handlers let unchanged marks skip React work during continuous counting.
  const handlers = useRef({ onMove: p.onMove, setSelection: p.setSelection, image: p.image });
  handlers.current = { onMove: p.onMove, setSelection: p.setSelection, image: p.image };
  const selectPoint = useCallback((id: string) => {
    handlers.current.setSelection({ kind: 'papillae', id });
  }, []);
  const movePoint = useCallback((id: string, pos: XY) => {
    const im = handlers.current.image;
    if (im)
      handlers.current.onMove(
        { kind: 'papillae', id },
        {
          x: Math.max(0, Math.min(im.width - 0.0001, pos.x)),
          y: Math.max(0, Math.min(im.height - 0.0001, pos.y)),
        },
      );
  }, []);
  const fit = (roi = p.roi) => {
    if (!p.image) return;
    const region = roi ?? { x: 0, y: 0, width: p.image.width, height: p.image.height };
    const scale = Math.min((size.width - 32) / region.width, (size.height - 32) / region.height);
    setView({
      scale,
      x: (size.width - region.width * scale) / 2 - region.x * scale,
      y: (size.height - region.height * scale) / 2 - region.y * scale,
    });
  };
  useEffect(() => {
    const ob = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    if (host.current) ob.observe(host.current);
    return () => ob.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    updateCursor(null);
    source.current = undefined;
    setRaster(undefined);
    if (p.image)
      loadImage(p.image.display_data_url)
        .then((im) => {
          if (active) {
            source.current = im;
            setRaster(adjustedImage(im, p.display));
          }
        })
        .catch((e) => p.onError(String(e)));
    return () => {
      active = false;
    };
  }, [p.image?.image_id]);
  useEffect(() => {
    if (source.current && p.image) setRaster(adjustedImage(source.current, p.display));
  }, [p.display]);
  useEffect(() => {
    fit();
  }, [p.image?.image_id, size.width, size.height, p.roi]);
  const image = p.image,
    session = p.session;
  const clamp = (pos: XY) => ({
    x: Math.max(0, Math.min(image!.width - 0.0001, pos.x)),
    y: Math.max(0, Math.min(image!.height - 0.0001, pos.y)),
  });
  const inside = (pos: XY) =>
    image &&
    pos.x >= 0 &&
    pos.y >= 0 &&
    pos.x < image.width &&
    pos.y < image.height &&
    (!p.roi ||
      (pos.x >= p.roi.x &&
        pos.y >= p.roi.y &&
        pos.x < p.roi.x + p.roi.width &&
        pos.y < p.roi.y + p.roi.height));
  const pointer = () => {
    const pos = stage.current?.getPointerPosition();
    return pos ? screenToImage(pos, view) : null;
  };
  const zoom = (factor: number) =>
    setView((v) =>
      zoomAt(
        v,
        { x: size.width / 2, y: size.height / 2 },
        Math.max(0.01, Math.min(30, v.scale * factor)),
      ),
    );
  const exportCanvas = async (includeLandmarks: boolean) => {
    if (!image || !raster || !session) throw new Error('画像がありません');
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(raster, 0, 0);
    const r = p.radius / view.scale;
    // Export recorded annotations independently of the viewer's temporary visibility switches.
    for (const pt of session.points) {
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.arc(pt.x_px, pt.y_px, r, 0, 2 * Math.PI);
      ctx.fillStyle = p.project.categories.find((cat) => cat.id === pt.category)!.color;
      ctx.fill();
      ctx.lineWidth = 1 / view.scale;
      ctx.strokeStyle = '#071b22';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const lm of includeLandmarks ? Object.values(session.landmarks) : []) {
      if (lm.observation_status !== 'recorded') continue;
      const x = lm.x_px!,
        y = lm.y_px!,
        rr = 7 / view.scale;
      ctx.strokeStyle = LANDMARK_COLOR;
      ctx.lineWidth = 2 / view.scale;
      ctx.beginPath();
      ctx.moveTo(x - rr, y);
      ctx.lineTo(x + rr, y);
      ctx.moveTo(x, y - rr);
      ctx.lineTo(x, y + rr);
      ctx.stroke();
      ctx.font = `${11 / view.scale}px sans-serif`;
      ctx.fillStyle = LANDMARK_COLOR;
      ctx.fillText(
        p.project.landmark_definitions.find((l) => l.id === lm.landmark)!.label,
        x + rr,
        y - rr,
      );
    }
    return new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG出力に失敗しました'))), 'image/png'),
    );
  };
  useEffect(() => {
    p.exportRef.current = exportCanvas;
    return () => {
      p.exportRef.current = null;
    };
  });
  const edit = p.mode === 'edit' && !p.space;
  return (
    <section className="viewer-section">
      <div className="viewer-toolbar">
        <div className="tool-cluster">
          <button title="縮小" aria-label="縮小" onClick={() => zoom(1 / 1.2)}>
            <Minus size={16} />
          </button>
          <span className="zoom-value" data-testid="zoom">
            {Math.round(view.scale * 100)}%
          </span>
          <button title="拡大" aria-label="拡大" onClick={() => zoom(1.2)}>
            <Plus size={16} />
          </button>
          <i />
          <button onClick={() => fit()} title="画像を全体表示">
            <Maximize size={16} />
            全体表示
          </button>
          <button
            onClick={() => {
              p.setROI(null);
              fit(null);
            }}
            title="ROI解除"
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="tool-cluster">
          <button
            className={roiMode ? 'active' : ''}
            onClick={() => setROIMode((v) => !v)}
            disabled={!image}
            title="ドラッグして表示領域を指定"
          >
            <Scan size={16} />
            ROI
          </button>
          <button
            className={!p.show ? 'active' : ''}
            onClick={() => p.setShow(!p.show)}
            title="注釈の表示切り替え"
          >
            <Eye size={16} />
            <span>注釈</span>
          </button>
        </div>
      </div>
      <div
        ref={host}
        data-testid="viewer"
        className={`canvas-host ${p.space || p.mode === 'pan' ? 'panning' : edit ? 'editing' : p.mode === 'papillae' && !roiMode ? 'papillae-cursor' : ''}`}
      >
        {!image ? (
          <div className="empty-view">
            <div className="empty-cross">
              <Crosshair size={52} strokeWidth={1} />
            </div>
            <span className="eyebrow">OBSERVE · MARK · MEASURE</span>
            <p>
              顕微鏡画像をここにドロップして
              <br />
              孔器の計数とランドマークの記録をはじめましょう。
            </p>
            <button className="primary" onClick={p.onImport}>
              <ImagePlus size={18} />
              画像を読み込む
            </button>
            <button className="text-button" onClick={p.onDemo}>
              検証用サンプルで試す →
            </button>
            <small>JPG / PNG / TIFF · 画像はこのブラウザ内に保存</small>
          </div>
        ) : (
          <Stage
            ref={stage}
            width={size.width}
            height={size.height}
            x={view.x}
            y={view.y}
            scaleX={view.scale}
            scaleY={view.scale}
            draggable={!roiMode && (p.space || p.mode === 'pan')}
            onDragEnd={(e) => {
              if (e.target === stage.current)
                setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
            }}
            onWheel={(e) => {
              e.evt.preventDefault();
              const pos = stage.current!.getPointerPosition()!;
              setView((v) =>
                zoomAt(
                  v,
                  pos,
                  Math.max(0.01, Math.min(30, v.scale * (e.evt.deltaY < 0 ? 1.12 : 1 / 1.12))),
                ),
              );
            }}
            onMouseDown={(e) => {
              if (roiMode && e.evt.button === 0) {
                const pos = pointer();
                if (pos) {
                  start.current = clamp(pos);
                  setROIDraft(null);
                }
              }
            }}
            onMouseMove={() => {
              const pos = pointer();
              updateCursor(pos);
              if (roiMode && start.current && pos) {
                const end = clamp(pos),
                  a = start.current;
                setROIDraft({
                  x: Math.min(a.x, end.x),
                  y: Math.min(a.y, end.y),
                  width: Math.abs(end.x - a.x),
                  height: Math.abs(end.y - a.y),
                });
              }
            }}
            onMouseUp={() => {
              if (roiMode && start.current) {
                suppressClickUntil.current = performance.now() + 150;
                setTimeout(() => {
                  suppressClickUntil.current = 0;
                }, 0);
                if (roiDraft && roiDraft.width > 2 && roiDraft.height > 2) {
                  p.setROI(roiDraft);
                  fit(roiDraft);
                }
                start.current = null;
                setROIDraft(null);
                setROIMode(false);
              }
            }}
            onMouseLeave={() => {
              updateCursor(null);
              if (start.current) {
                start.current = null;
                setROIDraft(null);
              }
            }}
            onClick={(e) => {
              if (
                performance.now() < suppressClickUntil.current ||
                e.evt.button !== 0 ||
                p.space ||
                p.mode === 'pan' ||
                roiMode ||
                stage.current?.isDragging()
              )
                return;
              const pos = pointer();
              if (!pos || !inside(pos)) return;
              if (edit) p.setSelection(null);
              else p.onAdd(pos);
            }}
          >
            <Layer listening={false}>
              <Group clip={p.roi ?? undefined}>
                {raster && <KImage image={raster} width={image.width} height={image.height} />}
              </Group>
            </Layer>
            <Layer>
              <Group listening={!p.space && p.mode !== 'pan' && !roiMode} clip={p.roi ?? undefined}>
                {session &&
                  p.show &&
                  session.points
                    .filter((pt) => !p.hidden.includes(pt.category))
                    .map((pt) => (
                      <Marker
                        key={pt.point_id}
                        point={pt}
                        color={p.project.categories.find((c) => c.id === pt.category)!.color}
                        radius={p.radius}
                        opacity={p.opacity}
                        scale={view.scale}
                        edit={edit}
                        selected={p.selection?.id === pt.point_id}
                        onSelect={selectPoint}
                        onMove={movePoint}
                      />
                    ))}
                {session &&
                  p.show &&
                  Object.values(session.landmarks)
                    .filter((l) => l.observation_status === 'recorded')
                    .map((l) => (
                      <Group
                        key={l.landmark}
                        x={l.x_px!}
                        y={l.y_px!}
                        draggable={edit}
                        listening={edit}
                        onMouseDown={(e) => {
                          e.cancelBubble = true;
                          if (edit) p.setSelection({ kind: 'landmark', id: l.landmark });
                        }}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          if (edit) p.setSelection({ kind: 'landmark', id: l.landmark });
                        }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          p.onMove(
                            { kind: 'landmark', id: l.landmark },
                            clamp({ x: e.target.x(), y: e.target.y() }),
                          );
                        }}
                      >
                        <Circle
                          radius={10 / view.scale}
                          fill="transparent"
                          stroke={p.selection?.id === l.landmark ? '#fff' : undefined}
                          strokeWidth={1 / view.scale}
                        />
                        <Line
                          points={[-7 / view.scale, 0, 7 / view.scale, 0]}
                          stroke={LANDMARK_COLOR}
                          strokeWidth={2 / view.scale}
                          listening={false}
                        />
                        <Line
                          points={[0, -7 / view.scale, 0, 7 / view.scale]}
                          stroke={LANDMARK_COLOR}
                          strokeWidth={2 / view.scale}
                          listening={false}
                        />
                        <Text
                          text={
                            p.project.landmark_definitions.find((def) => def.id === l.landmark)!
                              .label
                          }
                          x={9 / view.scale}
                          y={-14 / view.scale}
                          fontSize={11 / view.scale}
                          fill={LANDMARK_COLOR}
                          listening={false}
                        />
                      </Group>
                    ))}
              </Group>
              {roiDraft && (
                <Group listening={false}>
                  <Line
                    points={[
                      roiDraft.x,
                      roiDraft.y,
                      roiDraft.x + roiDraft.width,
                      roiDraft.y,
                      roiDraft.x + roiDraft.width,
                      roiDraft.y + roiDraft.height,
                      roiDraft.x,
                      roiDraft.y + roiDraft.height,
                    ]}
                    closed
                    stroke="#5ae1d0"
                    strokeWidth={2 / view.scale}
                    dash={[6 / view.scale, 4 / view.scale]}
                  />
                </Group>
              )}
            </Layer>
          </Stage>
        )}
        {image && (
          <>
            <div className="canvas-badge">
              <span className="live-dot" />
              {p.mode === 'papillae'
                ? `Papillae / ${p.category}`
                : p.mode === 'landmark'
                  ? `Landmark / ${p.project.landmark_definitions.find((l) => l.id === p.landmark)?.label}`
                  : p.mode === 'pan'
                    ? '画像の移動'
                    : '点を選択して編集'}
              {roiMode && ' · ROIをドラッグ'}
            </div>
            <div className="image-label">
              {image.image_filename}
              <span>
                {image.width.toLocaleString()} × {image.height.toLocaleString()} px
                {p.roi ? ' · ROI表示中' : ''}
              </span>
            </div>
          </>
        )}
      </div>
      <footer className="viewer-footer">
        <span ref={cursorReadout} data-testid="cursor-position">
          原点：画像左上 · 単位：px
        </span>
        <span>
          <kbd>Space</kbd> パン <b>·</b> ホイールでズーム
        </span>
      </footer>
    </section>
  );
}
