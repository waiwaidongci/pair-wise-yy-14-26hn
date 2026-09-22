import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { SurveyStore } from "./business/repository";
import {
  SurveyController,
  componentView,
  isPendingRepair,
  markersOfComponent,
  useSurvey,
} from "./business/surveyController";
import { ComponentInput, dimsOf, markerIssues } from "./business/markerTransform";
import ComponentList from "./ui/ComponentList";
import ComponentForm from "./ui/ComponentForm";
import MarkerMap from "./ui/MarkerMap";
import MarkerInspector from "./ui/MarkerInspector";
import RelationView from "./ui/RelationView";

const store = new SurveyStore();
const controller = new SurveyController(store);

function NoticeBar({ text, tone, onClose }: { text: string | null; tone: "info" | "warn"; onClose: () => void }) {
  useEffect(() => {
    if (!text) return;
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [text, onClose]);

  if (!text) return null;
  return (
    <div className={"notice " + tone} role="status">
      <span>{text}</span>
      <button type="button" onClick={onClose} aria-label="关闭提示">×</button>
    </div>
  );
}

function App() {
  const { survey, ui } = useSurvey(controller);
  const [formMode, setFormMode] = useState<"add" | "edit">("edit");

  const buildings = useMemo(
    () => Array.from(new Set(survey.components.map((c) => c.building))),
    [survey.components],
  );

  const filteredComponents = useMemo(
    () =>
      survey.components.filter(
        (c) =>
          (ui.buildingFilter === "" || c.building === ui.buildingFilter) &&
          (ui.jointFilter === "全部" || c.joint === ui.jointFilter),
      ),
    [survey.components, ui.buildingFilter, ui.jointFilter],
  );

  const views = useMemo(
    () => filteredComponents.map((c) => componentView(c, survey.markers)),
    [filteredComponents, survey.markers],
  );

  const selected =
    survey.components.find((c) => c.id === ui.selectedId) ??
    survey.components[0] ??
    null;

  // 选中构件被筛选排除时，自动落到筛选结果首项（不影响标记图/关系图正在查看的建筑数据）
  useEffect(() => {
    if (survey.components.length === 0) return;
    if (filteredComponents.length > 0 && !filteredComponents.some((c) => c.id === ui.selectedId)) {
      controller.selectComponent(filteredComponents[0].id);
    }
  }, [filteredComponents, survey.components.length, ui.selectedId]);

  const selectedMarkers = selected ? markersOfComponent(survey.markers, selected.id) : [];
  const selectedSuggestion = selected
    ? survey.suggestions.find((sg) => sg.componentId === selected.id) ?? null
    : null;

  const totalMarkers = survey.markers.length;
  const totalPending = survey.components.reduce(
    (sum, c) => sum + survey.markers.filter((m) => m.componentId === c.id && markerIssues(m, dimsOf(c)).length > 0).length,
    0,
  );
  const jointCount = new Set(survey.components.map((c) => c.joint)).size;
  const pendingRepair = survey.components.filter((c) =>
    isPendingRepair(c, survey.markers, survey.suggestions),
  ).length;

  const relationViews = useMemo(
    () =>
      survey.components
        .filter((c) => c.building === ui.buildingFilter)
        .map((c) => componentView(c, survey.markers)),
    [survey.components, survey.markers, ui.buildingFilter],
  );

  function handleSave(input: ComponentInput) {
    if (formMode === "edit" && selected) {
      controller.updateComponent(selected.id, input);
    } else {
      controller.addComponent(input);
      setFormMode("edit");
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62013 · 古建筑木结构 · 测绘工作台</p>
        <h1>木结构榫卯构件病害测绘</h1>
        <span>
          在构件示意面上点击，按长宽百分比记录病害位置；位置随构件尺寸换算并持久化，
          重新打开或窗口缩放后保持。同构件相距不足构件长度 2% 的标记自动合并；
          越界或缺等级的标记只能待校正，不能带着问题标记生成修缮建议。
        </span>
      </section>

      <NoticeBar text={ui.notice} tone={ui.noticeTone} onClose={controller.clearNotice} />

      <section className="metrics">
        <article>
          <small>构件数量</small>
          <strong>{survey.components.length}</strong>
        </article>
        <article>
          <small>病害点（待校正 {totalPending}）</small>
          <strong>{totalMarkers}</strong>
        </article>
        <article>
          <small>榫卯类型</small>
          <strong>{jointCount}</strong>
        </article>
        <article>
          <small>待修缮（有有效病害且无建议）</small>
          <strong>{pendingRepair}</strong>
        </article>
      </section>

      <section className="workspace workspace-main">
        <aside className="panel sidebar">
          <ComponentList
            views={views}
            buildings={buildings}
            buildingFilter={ui.buildingFilter}
            jointFilter={ui.jointFilter}
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              setFormMode("edit");
              controller.selectComponent(id);
            }}
            onBuildingFilter={controller.setBuildingFilter}
            onJointFilter={controller.setJointFilter}
          />
        </aside>

        <section className="panel">
          <ComponentForm
            key={selected?.id ?? "none"}
            mode={formMode}
            component={selected}
            onSave={handleSave}
            onSwitchToAdd={() => setFormMode("add")}
          />
        </section>
      </section>

      {selected ? (
        <section className="panel marker-panel">
          <div className="heading">
            <div>
              <p>病害标记图</p>
              <h2>{selected.building} · {selected.code}</h2>
            </div>
            <button type="button" onClick={controller.resetAll}>恢复示例数据</button>
          </div>
          <div className="marker-workspace">
            <MarkerMap
              component={selected}
              markers={selectedMarkers}
              selectedMarkerId={ui.selectedMarkerId}
              correctingMarkerId={ui.correctingMarkerId}
              onSurfaceClick={(point) => controller.handleSurfaceClick(selected.id, point)}
              onSelectMarker={controller.selectMarker}
              onCancelCorrect={controller.cancelCorrecting}
            />
            <MarkerInspector
              component={selected}
              markers={selectedMarkers}
              selectedMarkerId={ui.selectedMarkerId}
              correctingMarkerId={ui.correctingMarkerId}
              suggestion={selectedSuggestion}
              onSelect={controller.selectMarker}
              onPatch={(id, patch) => controller.updateMarker(id, patch)}
              onStartCorrect={controller.startCorrecting}
              onCancelCorrect={controller.cancelCorrecting}
              onDelete={controller.deleteMarker}
              onGenerate={() => controller.generateSuggestion(selected.id)}
            />
          </div>
        </section>
      ) : (
        <section className="panel">
          <p className="empty-hint">暂无构件，请先新增构件。</p>
        </section>
      )}

      <RelationView
        building={ui.buildingFilter || buildings[0] || ""}
        buildings={buildings}
        views={relationViews}
        selectedId={selected?.id ?? null}
        onBuilding={controller.setBuildingFilter}
        onSelect={(id) => {
          setFormMode("edit");
          controller.selectComponent(id);
        }}
      />

      <footer className="foot-note">
        数据通过 localStorage 持久化（键 hxyfront-62013:survey:v1），刷新或重新打开后清单、标记图、关系图状态一致。
      </footer>
    </main>
  );
}

export default App;
