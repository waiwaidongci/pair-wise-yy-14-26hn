/**
 * 业务模块 3/3：界面操作
 * SurveyController 编排「标记换算」与「数据持久化」两个模块，
 * 视图层只调用这里的动作，不直接改数据：
 * 点击落标、2% 自动合并、标记补录/校正/删除、构件与截面尺寸维护、修缮建议生成。
 */

import { useSyncExternalStore } from "react";
import { SurveyStore } from "./repository";
import {
  BuildingComponent,
  ComponentInput,
  DefectType,
  Grade,
  Marker,
  PercentPoint,
  SuggestionResult,
  buildRepairSuggestion,
  convertMarkersForDimensions,
  createMarker,
  dimsOf,
  isPending,
  isValidComponentInput,
  markerIssues,
  mergeMarkers,
  relocateMarker,
  shouldMerge,
} from "./markerTransform";

export type JointFilter = BuildingComponent["joint"] | "全部";
export type BuildingFilter = string;

export interface SurveyUiState {
  selectedId: string | null;
  jointFilter: JointFilter;
  buildingFilter: BuildingFilter;
  selectedMarkerId: string | null;
  /** 待校正标记的“校正模式”：此时在示意面点击会移动该标记 */
  correctingMarkerId: string | null;
  notice: string | null;
  noticeTone: "info" | "warn";
}

export type Notice = { text: string; tone: "info" | "warn" } | null;

export interface ComponentView extends BuildingComponent {
  markerCount: number;
  pendingCount: number;
  validCount: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class SurveyController {
  private ui: SurveyUiState;
  private uiListeners = new Set<() => void>();
  private cachedSnapshot: { survey: ReturnType<SurveyStore["getState"]>; ui: SurveyUiState } | null = null;

  constructor(private store: SurveyStore) {
    const state = store.getState();
    this.ui = {
      selectedId: state.components[0]?.id ?? null,
      jointFilter: "全部",
      buildingFilter: state.components[0]?.building ?? "",
      selectedMarkerId: null,
      correctingMarkerId: null,
      notice: null,
      noticeTone: "info",
    };
  }

  private emitUi(): void {
    this.cachedSnapshot = null;
    this.uiListeners.forEach((listener) => listener());
  }

  private setNotice(notice: Notice): void {
    this.ui = {
      ...this.ui,
      notice: notice?.text ?? null,
      noticeTone: notice?.tone ?? "info",
    };
    this.emitUi();
  }

  clearNotice = (): void => {
    if (!this.ui.notice) return;
    this.setNotice(null);
  };

  subscribeUi = (listener: () => void): (() => void) => {
    this.uiListeners.add(listener);
    return () => {
      this.uiListeners.delete(listener);
    };
  };

  storeSubscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  getSnapshot = () => {
    const survey = this.store.getState();
    if (!this.cachedSnapshot || this.cachedSnapshot.survey !== survey || this.cachedSnapshot.ui !== this.ui) {
      this.cachedSnapshot = { survey, ui: this.ui };
    }
    return this.cachedSnapshot;
  };

  // ---------- 选择与筛选 ----------

  selectComponent(id: string): void {
    this.ui = {
      ...this.ui,
      selectedId: id,
      selectedMarkerId: null,
      correctingMarkerId: null,
    };
    this.emitUi();
  }

  selectMarker(id: string | null): void {
    this.ui = { ...this.ui, selectedMarkerId: id, correctingMarkerId: null };
    this.emitUi();
  }

  setJointFilter(filter: JointFilter): void {
    this.ui = { ...this.ui, jointFilter: filter };
    this.emitUi();
  }

  setBuildingFilter(building: BuildingFilter): void {
    this.ui = { ...this.ui, buildingFilter: building };
    this.emitUi();
  }

  startCorrecting(markerId: string): void {
    this.ui = { ...this.ui, correctingMarkerId: markerId, selectedMarkerId: markerId };
    this.emitUi();
  }

  cancelCorrecting(): void {
    if (!this.ui.correctingMarkerId) return;
    this.ui = { ...this.ui, correctingMarkerId: null };
    this.emitUi();
  }

  // ---------- 构件维护 ----------

  addComponent(input: ComponentInput): void {
    if (!isValidComponentInput(input)) {
      this.setNotice({ text: "构件信息不完整或尺寸必须大于 0", tone: "warn" });
      return;
    }
    const state = this.store.getState();
    if (state.components.some((c) => c.code === input.code.trim() && c.building === input.building.trim())) {
      this.setNotice({ text: "该建筑下已存在相同构件编号", tone: "warn" });
      return;
    }
    const id = `comp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const component: BuildingComponent = {
      id,
      building: input.building.trim(),
      code: input.code.trim(),
      wood: input.wood.trim(),
      joint: input.joint,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      createdAt: nowIso(),
    };
    this.store.commit((s) => ({ ...s, components: [...s.components, component] }));
    this.ui = {
      ...this.ui,
      selectedId: id,
      selectedMarkerId: null,
      correctingMarkerId: null,
      buildingFilter: component.building,
      notice: `已新增构件 ${component.code}，可在示意面上点击落标`,
      noticeTone: "info",
    };
    this.emitUi();
  }

  /**
   * 修改构件资料。截面尺寸（长/宽）改动时，标记按新尺寸换算：
   * 物理毫米位置保持、百分比重算，原标记状态追加只读留档；
   * 换算后越界的标记进入“待校正”，截面高仅作记录不参与换算。
   */
  updateComponent(id: string, input: ComponentInput): void {
    if (!isValidComponentInput(input)) {
      this.setNotice({ text: "构件信息不完整或尺寸必须大于 0", tone: "warn" });
      return;
    }
    const state = this.store.getState();
    const target = state.components.find((c) => c.id === id);
    if (!target) {
      this.setNotice({ text: "未找到构件", tone: "warn" });
      return;
    }

    const next: BuildingComponent = {
      ...target,
      building: input.building.trim(),
      code: input.code.trim(),
      wood: input.wood.trim(),
      joint: input.joint,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
    };
    const surfaceChanged =
      target.lengthMm !== next.lengthMm || target.widthMm !== next.widthMm;

    this.store.commit((s) => {
      let markers = s.markers;
      let suggestions = s.suggestions;
      if (surfaceChanged) {
        const componentMarkers = markers.filter((m) => m.componentId === id);
        const converted = convertMarkersForDimensions(
          componentMarkers,
          dimsOf(target),
          dimsOf(next),
          `截面尺寸改动：${target.lengthMm}×${target.widthMm}mm → ${next.lengthMm}×${next.widthMm}mm`,
          nowIso(),
        );
        const byId = new Map(converted.map((m) => [m.id, m]));
        markers = markers.map((m) => byId.get(m.id) ?? m);
        // 旧建议基于旧尺寸，尺寸改动后作废，待校正完成重新生成
        suggestions = suggestions.filter((sg) => sg.componentId !== id);
      }
      return {
        ...s,
        components: s.components.map((c) => (c.id === id ? next : c)),
        markers,
        suggestions,
      };
    });

    const overflow = this.store
      .getState()
      .markers.filter((m) => m.componentId === id)
      .filter((m) => markerIssues(m, dimsOf(next)).includes("越界"));

    this.setNotice(
      surfaceChanged
        ? {
            text:
              overflow.length > 0
                ? `截面尺寸已更新，标记按新尺寸换算并留档；${overflow.length} 处越界标记待校正后才能生成修缮建议`
                : "截面尺寸已更新，标记已按新尺寸换算，原位置已只读留档",
            tone: overflow.length > 0 ? "warn" : "info",
          }
        : { text: `构件 ${next.code} 资料已更新`, tone: "info" },
    );
  }

  // ---------- 标记操作 ----------

  /**
   * 示意面点击：
   * - 校正模式：把待校正标记重新定位（校正前位置留档）
   * - 普通模式：落新标，并与同构件相距不足构件长度 2% 的标记合并
   */
  handleSurfaceClick(id: string, point: PercentPoint): void {
    const state = this.store.getState();
    const component = state.components.find((c) => c.id === id);
    if (!component) return;
    const dims = dimsOf(component);
    const now = nowIso();

    if (this.ui.correctingMarkerId) {
      const markerId = this.ui.correctingMarkerId;
      const target = state.markers.find((m) => m.id === markerId);
      if (!target || target.componentId !== id) {
        this.cancelCorrecting();
        return;
      }
      this.store.commit((s) => ({
        ...s,
        markers: s.markers.map((m) => (m.id === markerId ? relocateMarker(m, point, dims, now) : m)),
        // 位置变更后旧建议不再可靠
        suggestions: s.suggestions.filter((sg) => sg.componentId !== id),
      }));
      const relocated = this.store.getState().markers.find((m) => m.id === markerId);
      const stillBad = relocated ? markerIssues(relocated, dims) : [];
      this.ui = { ...this.ui, correctingMarkerId: null };
      this.emitUi();
      this.setNotice(
        stillBad.length > 0
          ? { text: `已校正位置，但仍存在${stillBad.join("、")}，请继续补正`, tone: "warn" }
          : { text: "标记已校正，位置变更前记录已留档，可以生成修缮建议", tone: "info" },
      );
      return;
    }

    const candidate = createMarker(id, point, dims, now);
    const sameComponent = state.markers.filter((m) => m.componentId === id);
    const near = sameComponent.find((m) => shouldMerge(m, candidate, dims));

    if (near) {
      const merged = mergeMarkers(near, candidate, dims, now);
      this.store.commit((s) => ({
        ...s,
        markers: s.markers.map((m) => (m.id === near.id ? merged : m)),
        suggestions: s.suggestions.filter((sg) => sg.componentId !== id),
      }));
      this.ui = { ...this.ui, selectedMarkerId: merged.id };
      this.emitUi();
      this.setNotice({
        text: `与邻近标记间距不足构件长度的 2%，已合并为一处（共并入 ${merged.mergedFrom.length + 1} 个记录）`,
        tone: "info",
      });
      return;
    }

    this.store.commit((s) => ({ ...s, markers: [...s.markers, candidate] }));
    this.ui = { ...this.ui, selectedMarkerId: candidate.id };
    this.emitUi();
    this.setNotice({
      text: `已记录病害位置 长 ${(point.xPct * 100).toFixed(1)}% / 宽 ${(point.yPct * 100).toFixed(1)}%，请补录病害类型与等级`,
      tone: "warn",
    });
  }

  updateMarker(
    markerId: string,
    patch: { defectType?: DefectType | null; grade?: Grade | null; note?: string },
  ): void {
    const marker = this.store.getState().markers.find((m) => m.id === markerId);
    if (!marker) return;
    this.store.commit((s) => ({
      ...s,
      markers: s.markers.map((m) =>
        m.id === markerId
          ? { ...m, ...patch, updatedAt: nowIso() }
          : m,
      ),
      // 病害等级变化后旧建议作废，需重新生成
      suggestions: s.suggestions.filter((sg) => sg.componentId !== marker.componentId),
    }));
    const updated = this.store.getState().markers.find((m) => m.id === markerId)!;
    const component = this.store.getState().components.find((c) => c.id === marker.componentId);
    const issues = component ? markerIssues(updated, dimsOf(component)) : [];
    this.setNotice(
      issues.length > 0
        ? { text: `标记仍存在${issues.join("、")}，只能待校正`, tone: "warn" }
        : { text: "标记信息已保存，可以生成修缮建议", tone: "info" },
    );
  }

  deleteMarker(markerId: string): void {
    const marker = this.store.getState().markers.find((m) => m.id === markerId);
    if (!marker) return;
    this.store.commit((s) => ({
      ...s,
      markers: s.markers.filter((m) => m.id !== markerId),
      suggestions: s.suggestions.filter((sg) => sg.componentId !== marker.componentId),
    }));
    this.ui = { ...this.ui, selectedMarkerId: null, correctingMarkerId: null };
    this.emitUi();
    this.setNotice({ text: "标记已删除（历史建议同步作废）", tone: "info" });
  }

  // ---------- 修缮建议 ----------

  /** 越界或缺等级的待校正标记存在时拒绝生成，绝不带着问题标记出建议 */
  generateSuggestion(componentId: string): void {
    const state = this.store.getState();
    const component = state.components.find((c) => c.id === componentId);
    if (!component) return;
    const dims = dimsOf(component);
    const markers = state.markers.filter((m) => m.componentId === componentId);
    const entries = markers.map((marker, index) => ({
      marker,
      label: `标记${String(index + 1).padStart(2, "0")}`,
    }));
    const result: SuggestionResult = buildRepairSuggestion(component, dims, entries);
    if (!result.ok) {
      this.setNotice({ text: `无法生成修缮建议：${result.reasons.join("；")}`, tone: "warn" });
      return;
    }
    const suggestion = {
      componentId,
      text: result.text,
      at: nowIso(),
      markerIds: result.markerIds,
    };
    this.store.commit((s) => ({
      ...s,
      suggestions: [...s.suggestions.filter((sg) => sg.componentId !== componentId), suggestion],
    }));
    this.setNotice({ text: "修缮建议已生成并保存", tone: "info" });
  }

  resetAll(): void {
    this.store.reset();
    const first = this.store.getState().components[0] ?? null;
    this.ui = {
      selectedId: first?.id ?? null,
      jointFilter: "全部",
      buildingFilter: first?.building ?? "",
      selectedMarkerId: null,
      correctingMarkerId: null,
      notice: "已恢复为初始测绘数据",
      noticeTone: "info",
    };
    this.emitUi();
  }
}

// ---------- 派生数据（清单 / 关系图 / 刷新后共用同一份） ----------

export function markersOfComponent(markers: Marker[], componentId: string): Marker[] {
  return markers.filter((m) => m.componentId === componentId);
}

export function componentView(component: BuildingComponent, markers: Marker[]): ComponentView {
  const mine = markers.filter((m) => m.componentId === component.id);
  return {
    ...component,
    markerCount: mine.length,
    pendingCount: mine.filter((m) => isPending(m, dimsOf(component))).length,
    validCount: mine.filter((m) => !isPending(m, dimsOf(component))).length,
  };
}

/** 待修缮：存在有效（非待校正）病害标记的构件 */
export function isPendingRepair(
  component: BuildingComponent,
  markers: Marker[],
  suggestions: { componentId: string }[],
): boolean {
  const mine = markers.filter((m) => m.componentId === component.id);
  return mine.some((m) => !isPending(m, dimsOf(component))) &&
    !suggestions.some((sg) => sg.componentId === component.id);
}

export function markerLabel(index: number): string {
  return `标记${String(index + 1).padStart(2, "0")}`;
}

export function useSurvey(controller: SurveyController) {
  return useSyncExternalStore(
    (listener) => {
      const unsubStore = controller.storeSubscribe(listener);
      const unsubUi = controller.subscribeUi(listener);
      return () => {
        unsubStore();
        unsubUi();
      };
    },
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
