import { ComponentView } from "../business/surveyController";
import { BuildingFilter, JointFilter } from "../business/surveyController";
import { JOINT_TYPES } from "../business/markerTransform";

interface ComponentListProps {
  views: ComponentView[];
  buildings: string[];
  buildingFilter: BuildingFilter;
  jointFilter: JointFilter;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBuildingFilter: (building: string) => void;
  onJointFilter: (joint: JointFilter) => void;
}

export default function ComponentList({
  views,
  buildings,
  buildingFilter,
  jointFilter,
  selectedId,
  onSelect,
  onBuildingFilter,
  onJointFilter,
}: ComponentListProps) {
  return (
    <div className="component-list">
      <div className="filter-block">
        <small>单栋建筑</small>
        <div className="chips">
          {buildings.map((building) => (
            <button
              key={building}
              type="button"
              className={buildingFilter === building ? "chip-on" : ""}
              onClick={() => onBuildingFilter(building)}
            >
              {building}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <small>榫卯类型筛选</small>
        <div className="chips">
          {(["全部", ...JOINT_TYPES] as JointFilter[]).map((joint) => (
            <button
              key={joint}
              type="button"
              className={jointFilter === joint ? "chip-on" : ""}
              onClick={() => onJointFilter(joint)}
            >
              {joint}
            </button>
          ))}
        </div>
      </div>

      <div className="list-rows">
        {views.length === 0 && <p className="empty-hint">当前筛选下暂无构件</p>}
        {views.map((view) => (
          <button
            type="button"
            key={view.id}
            className={["list-row", selectedId === view.id ? "row-on" : ""].join(" ")}
            onClick={() => onSelect(view.id)}
          >
            <div className="row-main">
              <b>{view.code}</b>
              <span>
                {view.wood} · {view.joint}
              </span>
              <small>
                {view.lengthMm}×{view.widthMm}×{view.heightMm}mm
              </small>
            </div>
            <div className="row-badges">
              <span className="badge badge-all" title="病害点总数">{view.markerCount}</span>
              <span
                className={"badge " + (view.pendingCount > 0 ? "badge-pending" : "badge-ok")}
                title="待校正 / 有效"
              >
                {view.pendingCount > 0 ? `${view.pendingCount} 待校` : `${view.validCount} 有效`}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
