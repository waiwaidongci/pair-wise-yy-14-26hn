import { useState } from "react";
import type { Dimensions, Marker, Member } from "../types";
import {
  DISEASE_KINDS,
  SEVERITIES,
  TENON_TYPES,
} from "../types";
import {
  describePosition,
  invalidReason,
  isInvalidMarker,
} from "../business/markerGeometry";
import { markerStats, type SurveyController } from "../business/useSurvey";
import { MarkerMap } from "./MarkerMap";

interface Props {
  survey: SurveyController;
}

export function MemberDetail({ survey }: Props) {
  const {
    selectedMember: member,
    addMarker,
    updateMarker,
    deleteMarker,
    applyDimensions,
    updateMemberInfo,
    generateSuggestion,
    clearSuggestion,
  } = survey;

  const [newKind, setNewKind] = useState<string>(DISEASE_KINDS[0]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  if (!member) {
    return (
      <section className="panel detail-panel">
        <p className="empty">请在左侧清单中选择一个构件。</p>
      </section>
    );
  }

  const stats = markerStats(member.markers);
  const selected = member.markers.find((m) => m.id === selectedMarkerId) ?? null;

  return (
    <section className="panel detail-panel">
      <div className="heading">
        <div>
          <p>构件测绘</p>
          <h2>{member.building} · {member.code}</h2>
        </div>
        <div className="badge-row">
          <span className="badge">有效 {stats.active - stats.invalid}</span>
          {stats.invalid > 0 && (
            <span className="badge badge-warn">待校正 {stats.invalid}</span>
          )}
          {stats.archived > 0 && (
            <span className="badge badge-arch">留档 {stats.archived}</span>
          )}
        </div>
      </div>

      {/* 基础信息 */}
      <div className="field-grid">
        <label>
          <span>建筑名称</span>
          <input
            value={member.building}
            onChange={(e) => updateMemberInfo(member.id, { building: e.target.value })}
          />
        </label>
        <label>
          <span>构件编号</span>
          <input
            value={member.code}
            onChange={(e) => updateMemberInfo(member.id, { code: e.target.value })}
          />
        </label>
        <label>
          <span>木材种类</span>
          <input
            value={member.wood}
            onChange={(e) => updateMemberInfo(member.id, { wood: e.target.value })}
          />
        </label>
        <label>
          <span>榫卯类型</span>
          <select
            value={member.tenon}
            onChange={(e) => updateMemberInfo(member.id, { tenon: e.target.value })}
          >
            {TENON_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <DimensionsEditor member={member} onApply={(d) => applyDimensions(member.id, d)} />

      <label className="deformation">
        <span>变形情况</span>
        <textarea
          rows={2}
          placeholder="记录下挠、倾斜、歪闪等变形"
          value={member.deformation}
          onChange={(e) => updateMemberInfo(member.id, { deformation: e.target.value })}
        />
      </label>

      {/* 病害标记图 */}
      <div className="map-head">
        <h3>病害标记图（构件示意面：长 × 宽）</h3>
        <label className="kind-pick">
          <span>新标记类型</span>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
            {DISEASE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>
      <MarkerMap
        member={member}
        selectedMarkerId={selectedMarkerId}
        onAdd={(pct) => {
          addMarker(member.id, pct, newKind);
        }}
        onMove={(markerId, pct) => updateMarker(member.id, markerId, pct)}
        onSelect={setSelectedMarkerId}
      />

      {/* 现行标记清单 / 校正 */}
      <MarkerList
        member={member}
        selectedMarkerId={selectedMarkerId}
        onSelect={setSelectedMarkerId}
        onUpdate={(id, patch) => updateMarker(member.id, id, patch)}
        onDelete={(id) => deleteMarker(member.id, id)}
      />

      {/* 留档 */}
      <ArchiveList member={member} />

      {/* 修缮建议 */}
      <SuggestionBox
        member={member}
        invalidCount={stats.invalid}
        onGenerate={() => generateSuggestion(member.id)}
        onClear={() => clearSuggestion(member.id)}
      />
    </section>
  );
}

/* ---------------------- 截面尺寸编辑（两步确认） ---------------------- */

function DimensionsEditor({
  member,
  onApply,
}: {
  member: Member;
  onApply: (d: Dimensions) => void;
}) {
  // 切换构件时父级以 key 重新挂载本面板，state 直接用当前尺寸初始化
  const [dims, setDims] = useState<Dimensions>(member.dims);
  const [armed, setArmed] = useState(false);

  const changed =
    dims.length !== member.dims.length ||
    dims.width !== member.dims.width ||
    dims.height !== member.dims.height;
  const valid = dims.length > 0 && dims.width > 0 && dims.height > 0;

  const set = (key: keyof Dimensions, raw: string) => {
    const n = raw === "" ? 0 : Number(raw);
    setDims((d) => ({ ...d, [key]: n }));
    setArmed(false);
  };

  return (
    <div className="dims-editor">
      <div className="dims-row">
        <label>
          <span>长（mm）</span>
          <input type="number" min={1} value={dims.length || ""} onChange={(e) => set("length", e.target.value)} />
        </label>
        <label>
          <span>宽（mm）</span>
          <input type="number" min={1} value={dims.width || ""} onChange={(e) => set("width", e.target.value)} />
        </label>
        <label>
          <span>高（mm）</span>
          <input type="number" min={1} value={dims.height || ""} onChange={(e) => set("height", e.target.value)} />
        </label>
        <div className="dims-actions">
          {!armed ? (
            <button disabled={!changed || !valid} onClick={() => setArmed(true)}>
              改截面并换算
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => {
                onApply(dims);
                setArmed(false);
              }}
            >
              确认换算留档
            </button>
          )}
          {armed && (
            <button className="link-btn" onClick={() => { setDims(member.dims); setArmed(false); }}>
              取消
            </button>
          )}
        </div>
      </div>
      {armed && (
        <p className="warn-line">
          改动后 {member.markers.filter((m) => !m.archived).length} 处现行标记将按
          毫米位置换算到新截面，原标记转为只读留档；越界标记会进入待校正。
        </p>
      )}
    </div>
  );
}

/* ---------------------- 现行标记列表 ---------------------- */

function MarkerList({
  member,
  selectedMarkerId,
  onSelect,
  onUpdate,
  onDelete,
}: {
  member: Member;
  selectedMarkerId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Marker>) => void;
  onDelete: (id: string) => void;
}) {
  const actives = member.markers.filter((m) => !m.archived);
  return (
    <div className="marker-list">
      <h3>
        病害标记清单
        <small>（缺等级或换算越界的标记只能校正，不能带入修缮建议）</small>
      </h3>
      {actives.length === 0 && <p className="empty">在上方构件示意面上点击即可记录标记。</p>}
      {actives.map((m, index) => {
        const invalid = isInvalidMarker(m);
        return (
          <article
            key={m.id}
            className={`marker-row${invalid ? " is-invalid" : ""}${selectedMarkerId === m.id ? " selected" : ""}`}
            onClick={() => onSelect(m.id)}
          >
            <div className="marker-row-head">
              <span className={`idx sev-${m.severity || "none"}`}>#{index + 1}</span>
              <select
                value={m.kind}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onUpdate(m.id, { kind: e.target.value })}
              >
                {DISEASE_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <select
                className={!m.severity ? "severity-missing" : ""}
                value={m.severity}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onUpdate(m.id, { severity: e.target.value as Marker["severity"] })}
              >
                <option value="">缺等级</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {invalid && <span className="tag-warn">待校正：{invalidReason(m)}</span>}
              <button
                className="link-btn danger"
                onClick={(e) => { e.stopPropagation(); onDelete(m.id); }}
              >
                删除
              </button>
            </div>
            <div className="marker-pos" onClick={(e) => e.stopPropagation()}>
              <label>
                <span>长向 %</span>
                <input
                  type="number"
                  value={m.xPct}
                  step={0.1}
                  onChange={(e) => onUpdate(m.id, { xPct: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>宽向 %</span>
                <input
                  type="number"
                  value={m.yPct}
                  step={0.1}
                  onChange={(e) => onUpdate(m.id, { yPct: Number(e.target.value) })}
                />
              </label>
              <span className="pos-text">{describePosition(m, member.dims)}</span>
            </div>
            <input
              className="note-input"
              placeholder="病害描述（走向、长度、深度…）"
              value={m.note}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdate(m.id, { note: e.target.value })}
            />
          </article>
        );
      })}
    </div>
  );
}

/* ---------------------- 留档列表 ---------------------- */

function ArchiveList({ member }: { member: Member }) {
  const archived = member.markers.filter((m) => m.archived);
  if (archived.length === 0) return null;
  return (
    <div className="archive-list">
      <h3>
        原始标记留档（只读）
        <small>截面改动前的百分比与旧尺寸快照，仅供溯源</small>
      </h3>
      {archived.map((m, i) => (
        <article key={m.id} className="archive-row">
          <span className="idx idx-ghost">档{i + 1}</span>
          <div>
            <b>
              {m.kind} · {m.severity || "缺等级"} · 长向 {m.xPct}% / 宽向 {m.yPct}%
            </b>
            <p>
              旧截面 {m.dimsAtCreation?.length}×{m.dimsAtCreation?.width}×
              {m.dimsAtCreation?.height}mm · {m.archiveReason}
              {m.note ? ` · ${m.note}` : ""}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ---------------------- 修缮建议 ---------------------- */

function SuggestionBox({
  member,
  invalidCount,
  onGenerate,
  onClear,
}: {
  member: Member;
  invalidCount: number;
  onGenerate: () => void;
  onClear: () => void;
}) {
  const activeCount = member.markers.filter((m) => !m.archived).length;
  return (
    <div className="suggestion-box">
      <div className="map-head">
        <h3>修缮建议</h3>
        <div>
          <button className="primary" disabled={invalidCount > 0} onClick={onGenerate}>
            按标记生成建议
          </button>
          {member.suggestion && (
            <button className="link-btn" onClick={onClear}>清空建议</button>
          )}
        </div>
      </div>
      {invalidCount > 0 && (
        <p className="warn-line">
          有 {invalidCount} 处标记待校正（越界或缺等级），不能带着标记生成修缮建议；
          请在图上拖拽或在清单中修正后再生成。
        </p>
      )}
      {member.suggestion ? (
        <p className="suggestion-text">
          {member.suggestion}
          {member.suggestionAt && (
            <small>
              {" "}
              · 生成于 {new Date(member.suggestionAt).toLocaleString("zh-CN")}
            </small>
          )}
        </p>
      ) : (
        <p className="empty">
          {activeCount === 0
            ? "暂无病害标记。"
            : invalidCount === 0
              ? "全部标记有效，可以生成修缮建议。"
              : "待校正标记处理完毕后才能生成。"}
        </p>
      )}
    </div>
  );
}
