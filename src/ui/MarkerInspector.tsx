import {
  BuildingComponent,
  DEFECT_TYPES,
  GRADES,
  Marker,
  RepairSuggestion,
  dimsOf,
  markerIssues,
} from "../business/markerTransform";
import { markerLabel } from "../business/surveyController";

interface MarkerInspectorProps {
  component: BuildingComponent;
  markers: Marker[];
  selectedMarkerId: string | null;
  correctingMarkerId: string | null;
  suggestion: RepairSuggestion | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: { defectType?: Marker["defectType"]; grade?: Marker["grade"]; note?: string }) => void;
  onStartCorrect: (id: string) => void;
  onCancelCorrect: () => void;
  onDelete: (id: string) => void;
  onGenerate: () => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function MarkerInspector({
  component,
  markers,
  selectedMarkerId,
  correctingMarkerId,
  suggestion,
  onSelect,
  onPatch,
  onStartCorrect,
  onCancelCorrect,
  onDelete,
  onGenerate,
}: MarkerInspectorProps) {
  const dims = dimsOf(component);
  const pendingCount = markers.filter((m) => markerIssues(m, dims).length > 0).length;
  const selected = markers.find((m) => m.id === selectedMarkerId) ?? null;

  return (
    <div className="inspector">
      <div className="inspector-summary">
        <h3>病害标记清单</h3>
        <p>
          共 {markers.length} 处
          {pendingCount > 0 ? <b className="text-warn"> · {pendingCount} 处待校正</b> : <b className="text-ok"> · 均有效</b>}
        </p>
      </div>

      <div className="marker-rows">
        {markers.length === 0 && <p className="empty-hint">尚未落标，在左侧示意面上点击即可记录病害位置</p>}
        {markers.map((marker, index) => {
          const issues = markerIssues(marker, dims);
          return (
            <button
              type="button"
              key={marker.id}
              className={[
                "marker-row",
                selectedMarkerId === marker.id ? "marker-row-on" : "",
                issues.length > 0 ? "marker-row-pending" : "",
              ].join(" ")}
              onClick={() => onSelect(marker.id)}
            >
              <span className={"row-dot grade-" + (marker.grade ?? "none")} />
              <span className="row-text">
                <b>{markerLabel(index)}</b>
                <small>
                  {marker.defectType ?? "未分类"} · {marker.grade ?? "缺等级"} · 长 {(marker.xPct * 100).toFixed(1)}% / 宽 {(marker.yPct * 100).toFixed(1)}%
                  {marker.mergedFrom.length > 0 ? ` · 已合并${marker.mergedFrom.length + 1}记录` : ""}
                </small>
                {issues.length > 0 && <em className="row-issues">待校正：{issues.join("、")}</em>}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="marker-editor">
          <div className="editor-head">
            <h4>{selected.note || "标记详情"}</h4>
            <button type="button" className="danger" onClick={() => onDelete(selected.id)}>
              删除标记
            </button>
          </div>

          <label>
            <span>病害类型</span>
            <select
              value={selected.defectType ?? ""}
              onChange={(e) =>
                onPatch(selected.id, {
                  defectType: (e.target.value || null) as Marker["defectType"],
                })
              }
            >
              <option value="">未分类</option>
              {DEFECT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label>
            <span>病害等级（缺等级只能待校正）</span>
            <div className="grade-picker">
              {GRADES.map((grade) => (
                <button
                  type="button"
                  key={grade}
                  className={selected.grade === grade ? `grade-btn grade-${grade} on` : "grade-btn"}
                  onClick={() => onPatch(selected.id, { grade })}
                >
                  {grade}
                </button>
              ))}
              {selected.grade && (
                <button type="button" onClick={() => onPatch(selected.id, { grade: null })}>
                  清除等级
                </button>
              )}
            </div>
          </label>

          <label>
            <span>现场描述</span>
            <textarea
              rows={2}
              value={selected.note}
              placeholder="如：端部顺纹裂缝约 300mm"
              onChange={(e) => onPatch(selected.id, { note: e.target.value })}
            />
          </label>

          <dl className="coord-grid">
            <div><dt>长度方向</dt><dd>{(selected.xPct * 100).toFixed(2)}% · {selected.xMm.toFixed(0)}mm</dd></div>
            <div><dt>宽度方向</dt><dd>{(selected.yPct * 100).toFixed(2)}% · {selected.yMm.toFixed(0)}mm</dd></div>
            <div><dt>记录时间</dt><dd>{formatTime(selected.createdAt)}</dd></div>
            <div><dt>最近更新</dt><dd>{formatTime(selected.updatedAt)}</dd></div>
          </dl>

          <div className="correct-box">
            {correctingMarkerId === selected.id ? (
              <>
                <p className="text-warn">校正模式：在示意面上点击新位置，Esc 取消。校正前位置会只读留档。</p>
                <button type="button" onClick={onCancelCorrect}>取消校正</button>
              </>
            ) : (
              <button type="button" onClick={() => onStartCorrect(selected.id)}>
                校正标记位置（越界时使用）
              </button>
            )}
          </div>

          {selected.history.length > 0 && (
            <details className="archive">
              <summary>换算/校正留档（{selected.history.length} 条，只读）</summary>
              <ol>
                {[...selected.history].reverse().map((entry, i) => (
                  <li key={i}>
                    <p>
                      <b>{entry.reason}</b> · {formatTime(entry.archivedAt)}
                    </p>
                    <small>
                      原尺寸 {entry.dims.lengthMm}×{entry.dims.widthMm}mm；原位置 长 {(entry.point.xPct * 100).toFixed(2)}%（{entry.point.xMm.toFixed(0)}mm）
                      / 宽 {(entry.point.yPct * 100).toFixed(2)}%（{entry.point.yMm.toFixed(0)}mm）
                    </small>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      <div className="suggestion-box">
        <div className="suggestion-head">
          <h4>修缮建议</h4>
          <button type="button" className="primary" onClick={onGenerate} disabled={markers.length === 0}>
            生成修缮建议
          </button>
        </div>
        {pendingCount > 0 && (
          <p className="text-warn">
            存在 {pendingCount} 处待校正标记（越界或缺等级），已禁止生成，请先校正并补录等级。
          </p>
        )}
        {suggestion ? (
          <div className="suggestion-text">
            <small>{formatTime(suggestion.at)} · 依据 {suggestion.markerIds.length} 处有效标记</small>
            <p>{suggestion.text}</p>
          </div>
        ) : (
          <p className="empty-hint">尺寸改动或标记变更后建议自动作废，校正完成后重新生成。</p>
        )}
      </div>
    </div>
  );
}
