import type { Member } from "../types";
import type { SurveyController } from "../business/useSurvey";
import { markerStats } from "../business/useSurvey";

/**
 * 单栋建筑的构件关系视图：榫卯连接用带类型标签的连线表示。
 * 节点 / 连线与清单、标记图共用同一份 state；连接关系可在图例下方维护。
 */

const W = 900;
const ROW_Y = [110, 250];
const NODE_W = 150;
const NODE_H = 64;

export function RelationView({ survey }: Props) {
  const { state, visibleMembers, selectMember, toggleConnection } = survey;
  const members = visibleMembers;

  const gap = members.length > 1 ? (W - NODE_W) / (members.length - 1) : 0;
  const nodes = new Map<string, { x: number; y: number; member: Member }>();
  members.forEach((m, i) => {
    const x = members.length === 1 ? (W - NODE_W) / 2 : i * gap;
    const y = ROW_Y[i % 2] - NODE_H / 2;
    nodes.set(m.id, { x, y, member: m });
  });

  // 去重：A→B 与 B→A 视为同一条榫卯连接
  const edges: { a: Member; b: Member }[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    for (const targetId of m.connectedTo) {
      const t = members.find((x) => x.id === targetId);
      if (!t) continue;
      const key = [m.id, t.id].sort().join("--");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: m, b: t });
    }
  }

  const H = 330;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>{state.activeBuilding}</p>
          <h2>构件关系视图（榫卯连接）</h2>
        </div>
        <span className="table-hint">连线标注榫卯类型 · 点击节点跳转构件</span>
      </div>

      {members.length === 0 ? (
        <p className="empty">当前建筑 / 筛选下没有构件。</p>
      ) : (
        <div className="relation-scroll">
          <svg viewBox={`0 0 ${W} ${H}`} className="relation-svg" role="img">
            {edges.map(({ a, b }) => {
              const na = nodes.get(a.id)!;
              const nb = nodes.get(b.id)!;
              const x1 = na.x + NODE_W / 2;
              const y1 = na.y + NODE_H / 2;
              const x2 = nb.x + NODE_W / 2;
              const y2 = nb.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              return (
                <g key={`${a.id}-${b.id}`} className="edge">
                  <line x1={x1} y1={y1} x2={x2} y2={y2} />
                  <foreignObject x={mx - 34} y={my - 13} width={68} height={26}>
                    <span className="edge-label">{a.tenon}</span>
                  </foreignObject>
                </g>
              );
            })}

            {members.map((m) => {
              const n = nodes.get(m.id)!;
              const stats = markerStats(m.markers);
              const selected = state.selectedMemberId === m.id;
              return (
                <g
                  key={m.id}
                  className={`node${selected ? " node-on" : ""}${stats.invalid ? " node-warn" : ""}`}
                  onClick={() => selectMember(m.id)}
                >
                  <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={10} />
                  <text x={n.x + NODE_W / 2} y={n.y + 27} className="node-code">
                    {m.code}
                  </text>
                  <text x={n.x + NODE_W / 2} y={n.y + 48} className="node-sub">
                    {m.tenon} · 病害{stats.active}
                    {stats.invalid ? ` · 待校${stats.invalid}` : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* 连接维护：每对构件一行，toggleConnection 内部做双向关联 */}
      <div className="relation-edit">
        <p className="filter-title">维护榫卯连接（双向自动关联）</p>
        <div className="relation-checks">
          {members.flatMap((m, i) =>
            members
              .slice(i + 1)
              .map((other) => {
                const linked =
                  m.connectedTo.includes(other.id) ||
                  other.connectedTo.includes(m.id);
                return (
                  <label key={`${m.id}-${other.id}`} className="check-pill">
                    <input
                      type="checkbox"
                      checked={linked}
                      onChange={() => toggleConnection(m.id, other.id)}
                    />
                    <span>{m.code} ↔ {other.code}</span>
                  </label>
                );
              })
          )}
        </div>
      </div>
    </section>
  );
}

interface Props {
  survey: SurveyController;
}
