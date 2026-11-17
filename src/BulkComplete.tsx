import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { GROUPS, STATUS_LABEL } from './config';
import { counts, type Project, type Session } from './domain';

export function BulkComplete({
  project,
  session,
  onComplete,
}: {
  project: Project;
  session: Session;
  onComplete: (categories: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = project.categories.filter((c) =>
    ['unobserved', 'counting'].includes(session.statuses[c.id].observation_status),
  );
  const ids = eligible.map((c) => c.id);
  const chosen = selected.filter((id) => ids.includes(id));
  const values = counts(project, session);
  const toggle = (id: string) =>
    setSelected(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  return (
    <details
      className="bulk-complete"
      onToggle={(e) => {
        if (!e.currentTarget.open) setSelected([]);
      }}
    >
      <summary>
        <CheckCheck size={15} />
        まとめて計数完了
      </summary>
      <div className="bulk-content">
        <p>
          現在の画像・セッションの項目を選択します。未観察の項目は0個で確定します。観察不可・完了済みは対象外です。
        </p>
        <div className="bulk-actions">
          <button type="button" disabled={!ids.length} onClick={() => setSelected(ids)}>
            未完了をすべて選択
          </button>
          <button
            type="button"
            disabled={
              !eligible.some((c) => session.statuses[c.id].observation_status === 'counting')
            }
            onClick={() =>
              setSelected(
                ids.filter((id) => session.statuses[id].observation_status === 'counting'),
              )
            }
          >
            計数中だけ選択
          </button>
          <button type="button" disabled={!chosen.length} onClick={() => setSelected([])}>
            選択解除
          </button>
        </div>
        <div className="bulk-list">
          {GROUPS.map((group) => {
            const groupIds = eligible.filter((c) => c.group === group).map((c) => c.id);
            const all = groupIds.length > 0 && groupIds.every((id) => chosen.includes(id));
            return (
              <fieldset key={group}>
                <legend>{group}</legend>
                <button
                  type="button"
                  className="bulk-group"
                  disabled={!groupIds.length}
                  aria-label={all ? `${group}の選択を解除` : `${group}を選択`}
                  onClick={() =>
                    setSelected(
                      all
                        ? chosen.filter((id) => !groupIds.includes(id))
                        : [...new Set([...chosen, ...groupIds])],
                    )
                  }
                >
                  {all ? 'グループの選択を解除' : 'グループを選択'}
                </button>
                {project.categories
                  .filter((c) => c.group === group)
                  .map((c) => {
                    const status = session.statuses[c.id].observation_status;
                    return (
                      <label className="bulk-option" key={c.id}>
                        <input
                          type="checkbox"
                          aria-label={`${c.id}を一括完了の対象にする`}
                          checked={chosen.includes(c.id)}
                          disabled={!ids.includes(c.id)}
                          onChange={() => toggle(c.id)}
                        />
                        <i style={{ background: c.color }} />
                        <b>{c.id}</b>
                        <span>
                          {status === 'unavailable' ? 'NA' : `${values[c.id] ?? 0}個`} ·{' '}
                          {STATUS_LABEL[status]}
                        </span>
                      </label>
                    );
                  })}
              </fieldset>
            );
          })}
        </div>
        <div className="bulk-review" aria-live="polite">
          <strong>{chosen.length}項目を選択</strong>
          <p>
            {project.categories
              .filter((c) => chosen.includes(c.id))
              .map((c) => `${c.id}: ${values[c.id] ?? 0}個`)
              .join('、') || '対象を選択してください。'}
          </p>
        </div>
        <button
          type="button"
          className="primary bulk-apply"
          disabled={!chosen.length}
          onClick={() => {
            onComplete(chosen);
            setSelected([]);
          }}
        >
          <CheckCheck size={16} />
          選択した{chosen.length}項目を計数完了
        </button>
        <p>一括変更は「元に戻す」1回で取り消せます。</p>
      </div>
    </details>
  );
}
