import { ComponentView } from "../business/surveyController";

interface RelationViewProps {
  building: string;
  buildings: string[];
  views: ComponentView[];
  selectedId: string | null;
  onBuilding: (building: string) => void;
  onSelect: (id: string) => void;
}

const W = 720;
const H = 360;
const R = 132;

interface NodePos {
  id: string;
  x: number;
  y: number;
}

export default function RelationView({
  building,
  buildings,
  views,
  selectedId,
  onBuilding,
  onSelect,
}: RelationViewProps) {
  const nodes: NodePos[] = views.map((view, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(views.length, 1);
    return {
      id: view.id,
      x: W / 2 + R * Math.cos(angle),
      y: H / 2 + R * Math.sin(angle),
    };
  });
  const posOf = new Map(nodes.map((node) => [node.id, node]));
  const edges: { a: NodePos; b: NodePos; label: string; key: string }[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const vi = views[i];
      const vj = views[j];
      edges.push({
        a: nodes[i],
        b: nodes[j],
        label: `${vi.joint} ⇄ ${vj.joint}`,
        key: `${nodes[i].id}-${nodes[j].id}`,
      });
    }
  }

  return (
    <section className="panel relation-panel">
      <div className="heading">
        <div>
          <p>单栋建筑构件关系视图</p>
          <h2>{building} 榫卯关系图</h2>
        </div>
        <div className="chips">
          {buildings.map((name) => (
            <button
              key={name}
              type="button"
              className={building === name ? "chip-on" : ""}
              onClick={() => onBuilding(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {views.length === 0 ? (
        <p className="empty-hint">该栋建筑暂无构件</p>
      ) : (
        <div className="relation-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="relation-svg" role="img" aria-label={`${building}构件关系图`}>
            {edges.map((edge) => {
                const mx = (edge.a.x + edge.b.x) / 2;
                const my = (edge.a.y + edge.b.y) / 2;
                return (
                  <g key={edge.key} className="edge">
                    <line x1={edge.a.x} y1={edge.a.y} x2={edge.b.x} y2={edge.b.y} />
                    <text x={mx} y={my - 4} textAnchor="middle">
                      {edge.label}
                    </text>
                  </g>
                );
              })}
            {views.map((view) => {
              const pos = posOf.get(view.id)!;
              const statusClass =
                view.pendingCount > 0 ? "node-pending" : view.validCount > 0 ? "node-disease" : "node-clean";
              return (
                <g
                  key={view.id}
                  className={"rel-node " + statusClass + (selectedId === view.id ? " node-on" : "")}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => onSelect(view.id)}
                  role="button"
                >
                  <circle r={30} />
                  <text className="node-code" y={2} textAnchor="middle">
                    {view.code}
                  </text>
                  <text className="node-sub" y={48} textAnchor="middle">
                    {view.joint} · {view.wood}
                  </text>
                  <text className="node-sub" y={63} textAnchor="middle">
                    {view.pendingCount > 0
                      ? `${view.pendingCount} 待校 / ${view.validCount} 有效`
                      : `${view.markerCount} 病害点`}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="map-legend">
            <span><i className="dot node-clean-dot" />无病害</span>
            <span><i className="dot node-disease-dot" />有有效病害</span>
            <span><i className="dot is-pending" />含待校正标记</span>
          </div>
        </div>
      )}
    </section>
  );
}
