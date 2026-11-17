import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from './db';
import { emptyProject, historyPush, type Project } from './domain';
export function useProject() {
  const [project, setProject] = useState<Project>(emptyProject);
  const ref = useRef(project);
  const [ready, setReady] = useState(false),
    [locked, setLocked] = useState(false),
    [saveState, setSaveState] = useState('読み込み中');
  const past = useRef<Project[]>([]),
    future = useRef<Project[]>([]);
  const [revision, setRevision] = useState(0);
  const dirty = useRef(false),
    queue = useRef(Promise.resolve());
  const loadFailed = useRef(false);
  const enqueued = useRef<Project | null>(null);
  const persist = useCallback((snapshot: Project) => {
    if (loadFailed.current || enqueued.current === snapshot) return;
    enqueued.current = snapshot;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        try {
          await db.save(snapshot);
          if (ref.current === snapshot) {
            dirty.current = false;
            setSaveState('ローカル保存済み');
          }
        } catch (e) {
          setSaveState(`保存失敗: ${String(e)}。JSONを保存してください`);
        } finally {
          if (enqueued.current === snapshot) enqueued.current = null;
        }
      });
  }, []);
  useEffect(() => {
    let alive = true;
    let release: () => void = () => {};
    const initialize = async () => {
      try {
        const stored = await db.load();
        if (alive && stored) {
          ref.current = stored;
          setProject(stored);
        }
        if (alive) {
          setReady(true);
          setSaveState('ローカル保存済み');
        }
      } catch (e) {
        loadFailed.current = true;
        if (alive) {
          setReady(true);
          setSaveState(`保存領域の読込失敗: ${String(e)}。JSONを保存してください`);
        }
      }
    };
    if (navigator.locks) {
      void navigator.locks.request('papillae-writer', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          if (alive) {
            setLocked(true);
            setReady(true);
            setSaveState('別タブが編集中');
          }
          return;
        }
        await initialize();
        await new Promise<void>((resolve) => {
          release = resolve;
          if (!alive) resolve();
        });
      });
    } else {
      setLocked(true);
      setReady(true);
      setSaveState(
        'このブラウザは安全な同時編集制御に未対応です。Chrome / Edge / Firefoxの最新版を使用してください',
      );
    }
    return () => {
      alive = false;
      release();
    };
  }, []);
  const commit = useCallback(
    (fn: (p: Project) => Project) => {
      if (!ready || locked) return;
      const before = ref.current;
      const after = fn(before);
      if (after === before) return;
      past.current = historyPush(past.current, before);
      future.current = [];
      ref.current = after;
      dirty.current = true;
      setProject(after);
      setSaveState('保存待ち…');
      setRevision((v) => v + 1);
    },
    [ready, locked],
  );
  const undo = useCallback(() => {
    if (locked || !past.current.length) return;
    const prev = past.current.pop()!;
    future.current.push(ref.current);
    ref.current = prev;
    dirty.current = true;
    setProject(prev);
    setSaveState('保存待ち…');
    setRevision((v) => v + 1);
  }, [locked]);
  const redo = useCallback(() => {
    if (locked || !future.current.length) return;
    const next = future.current.pop()!;
    past.current.push(ref.current);
    ref.current = next;
    dirty.current = true;
    setProject(next);
    setSaveState('保存待ち…');
    setRevision((v) => v + 1);
  }, [locked]);
  useEffect(() => {
    if (!ready || locked || !dirty.current) return;
    const timer = setTimeout(() => {
      if (!dirty.current) return;
      if (loadFailed.current) {
        setSaveState('自動保存停止中（読込失敗）。JSONで手動保存してください');
        return;
      }
      persist(project);
    }, 350);
    return () => clearTimeout(timer);
  }, [project, revision, ready, locked, persist]);
  useEffect(() => {
    const flush = () => {
      if (ready && !locked && dirty.current) persist(ref.current);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [ready, locked, persist]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return {
    project,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    ready,
    locked,
    saveState,
  };
}
