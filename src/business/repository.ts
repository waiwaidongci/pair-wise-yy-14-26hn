/**
 * 业务模块 2/3：数据持久化
 * 负责 localStorage 版本化存取、初始测绘数据、可订阅的 SurveyStore。
 * 不包含任何换算规则（规则在 markerTransform 中）。
 */

import {
  BuildingComponent,
  createMarker,
  Dimensions,
  Grade,
  DefectType,
  Marker,
  PercentPoint,
  RepairSuggestion,
  SurveyState,
} from "./markerTransform";

const STORAGE_KEY = "hxyfront-62013:survey:v1";

const SEED_NOW = "2026-09-20T09:00:00.000Z";

function component(
  id: string,
  building: string,
  code: string,
  wood: string,
  joint: BuildingComponent["joint"],
  lengthMm: number,
  widthMm: number,
  heightMm: number,
): BuildingComponent {
  return { id, building, code, wood, joint, lengthMm, widthMm, heightMm, createdAt: SEED_NOW };
}

function seedMarker(
  componentId: string,
  pct: PercentPoint,
  dims: Dimensions,
  defectType: DefectType | null,
  grade: Grade | null,
  note: string,
): Marker {
  const marker = createMarker(componentId, pct, dims, SEED_NOW);
  return { ...marker, defectType, grade, note };
}

/** 首次打开时的样例测绘数据（之后完全由 localStorage 接管） */
export function createSeedState(): SurveyState {
  const c1 = component("comp-a03", "观音阁", "梁架A-03", "松木", "透榫", 6000, 240, 180);
  const c2 = component("comp-c12", "观音阁", "柱网C-12", "楠木", "燕尾榫", 3500, 320, 320);
  const c3 = component("comp-d07", "观音阁", "斗拱D-07", "樟木", "半榫", 1200, 120, 90);
  const c4 = component("comp-b21", "山门", "额枋B-21", "榆木", "箍头榫", 2400, 200, 150);

  const m1a = seedMarker("comp-a03", { xPct: 0.12, yPct: 0.35 }, c1, "开裂", "严重", "端部顺纹裂缝约 300mm");
  const m1b = seedMarker("comp-a03", { xPct: 0.88, yPct: 0.62 }, c1, "开裂", "轻微", "表面细裂纹");
  const m2 = seedMarker("comp-c12", { xPct: 0.08, yPct: 0.5 }, c2, "糟朽", "中等", "柱脚糟朽，深约 40mm");
  const m3 = seedMarker("comp-d07", { xPct: 0.55, yPct: 0.25 }, c3, "变形", "轻微", "轻微偏斜，继续监测");
  const m4 = seedMarker("comp-b21", { xPct: 0.3, yPct: 0.5 }, c4, "虫蛀", null, "有新蛀粉，等级待评定");

  const suggestions: RepairSuggestion[] = [
    {
      componentId: "comp-a03",
      at: SEED_NOW,
      markerIds: [m1a.id, m1b.id],
      text:
        "观音阁 梁架A-03 检出有效病害 2 处：① 开裂·严重（长 12.0% / 宽 35.0%）；② 开裂·轻微（长 88.0% / 宽 62.0%）。" +
        "修缮建议：严重裂缝采用灌浆嵌补并加铁箍加固，端部裂缝重点复查；轻微病害做表面修补并定期巡查。",
    },
    {
      componentId: "comp-c12",
      at: SEED_NOW,
      markerIds: [m2.id],
      text:
        "观音阁 柱网C-12 检出有效病害 1 处：① 糟朽·中等（长 8.0% / 宽 50.0%）。" +
        "修缮建议：剔除中等糟朽范围朽木后嵌补加固。",
    },
  ];

  return {
    version: 1,
    components: [c1, c2, c3, c4],
    markers: [m1a, m1b, m2, m3, m4],
    suggestions,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 容错校验：损坏的缓存不使用，直接回退到初始数据 */
export function validateState(value: unknown): value is SurveyState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SurveyState>;
  if (state.version !== 1 || !Array.isArray(state.components) || !Array.isArray(state.markers)) {
    return false;
  }
  return state.components.every(
    (c) =>
      isFiniteNumber(c.lengthMm) &&
      isFiniteNumber(c.widthMm) &&
      isFiniteNumber(c.heightMm) &&
      typeof c.id === "string" &&
      typeof c.code === "string",
  );
}

export function loadState(): SurveyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (validateState(parsed)) {
        if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];
        return parsed;
      }
    }
  } catch {
    /* 读取失败按首次打开处理 */
  }
  return createSeedState();
}

export function saveState(state: SurveyState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时仅影响本次会话内持久化 */
  }
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type Listener = () => void;

/** 极简可订阅 store：状态不可变更新，每次提交即持久化 */
export class SurveyStore {
  private state: SurveyState;
  private listeners = new Set<Listener>();

  constructor(initial?: SurveyState) {
    this.state = initial ?? loadState();
  }

  getState = (): SurveyState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  commit(updater: (state: SurveyState) => SurveyState): SurveyState {
    const next = updater(this.state);
    this.state = next;
    saveState(next);
    this.listeners.forEach((listener) => listener());
    return next;
  }

  reset(): SurveyState {
    return this.commit(() => createSeedState());
  }
}
