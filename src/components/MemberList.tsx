import type { SurveyController } from "../business/useSurvey";
import { markerStats } from "../business/useSurvey";
import { TENON_TYPES } from "../types";

interface Props {
  survey: SurveyController;
}

export function MemberList({ survey }: Props) {
  const {
    state,
    buildings,
    visibleMembers,
    selectMember,
    setFilterTenon,
    setActiveBuilding,
    addMember,
  } = survey;

  return (
    <aside className="panel list-panel">
      <h2>建筑与构件</h2>

      <div className="building-tabs">
        {buildings.map((b) => (
          <button
            key={b.name}
            className={state.activeBuilding === b.name ? "active" : ""}
            onClick={() => setActiveBuilding(b.name)}
          >
            {b.name}
            <small>{b.members.length}</small>
          </button>
        ))}
      </div>

      <p className="filter-title">榫卯类型筛选</p>
      <div className="chips">
        {["全部", ...TENON_TYPES].map((t) => (
          <button
            key={t}
            className={state.filterTenon === t ? "chip-on" : ""}
            onClick={() => setFilterTenon(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="member-items">
        {visibleMembers.length === 0 && (
          <p className="empty">该筛选下暂无构件。</p>
        )}
        {visibleMembers.map((m) => {
          const stats = markerStats(m.markers);
          const active = stats.active - stats.invalid;
          return (
            <button
              key={m.id}
              type="button"
              className={`member-item${state.selectedMemberId === m.id ? " selected" : ""}`}
              onClick={() => selectMember(m.id)}
            >
              <div className="member-item-main">
                <b>{m.code}</b>
                <span>{m.wood} · {m.tenon}</span>
                <span className="member-dims">
                  {m.dims.length}×{m.dims.width}×{m.dims.height}mm
                </span>
              </div>
              <div className="member-item-badges">
                {active > 0 && <i className="mini-badge">{active} 病害</i>}
                {stats.invalid > 0 && (
                  <i className="mini-badge mini-warn">{stats.invalid} 待校正</i>
                )}
                {stats.archived > 0 && (
                  <i className="mini-badge mini-arch">{stats.archived} 档</i>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button className="add-member" onClick={() => addMember(state.activeBuilding)}>
        + 在「{state.activeBuilding}」新增构件
      </button>
    </aside>
  );
}
