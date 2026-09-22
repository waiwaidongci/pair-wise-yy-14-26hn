import type { Marker, Member, SurveyState } from "../types";
import { isValidDims } from "./markerGeometry";

/**
 * 业务模块二：数据持久化
 * -------------------------------------------------------------
 * 全部测绘数据（构件、百分比标记、留档、关系、建议、筛选状态）
 * 统一存入 localStorage；读取时做 schema 版本与结构校验，
 * 损坏或版本不符时回退到演示数据。窗口刷新 / 重新打开后状态一致。
 */

const STORAGE_KEY = "hxyfront-62013:survey:v1";
const SCHEMA_VERSION = 1 as const;

export function uid(prefix = "m"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/* ------------------------- 演示数据 ------------------------- */

const T = 1_726_000_000_000; // 固定时间戳，保证每次演示数据一致

function marker(
  partial: Partial<Marker> & Pick<Marker, "id" | "xPct" | "yPct" | "kind" | "severity">
): Marker {
  return {
    note: "",
    createdAt: T,
    archived: false,
    dimsAtCreation: null,
    ...partial,
  };
}

const SEED_MEMBERS: Member[] = [
  {
    id: "ge-dongliang-03",
    building: "藏经阁东配殿",
    code: "梁架A-03",
    wood: "老榆木",
    tenon: "透榫",
    dims: { length: 3200, width: 180, height: 240 },
    deformation: "北端下挠约 6mm",
    suggestion: "",
    suggestionAt: null,
    connectedTo: ["ge-zhu-12", "ge-dougong-07"],
    markers: [
      marker({
        id: "seed-mk-01",
        xPct: 18.5,
        yPct: 55,
        kind: "开裂",
        severity: "中等",
        note: "端部顺纹裂缝，长约 120mm",
        createdAt: T,
      }),
      marker({
        id: "seed-mk-02",
        xPct: 72,
        yPct: 30,
        kind: "糟朽",
        severity: "严重",
        note: "梁底局部糟朽",
        createdAt: T + 1000,
      }),
      // 与 seed-mk-02 间距不足 2%（阈值 64mm），演示自动合并
      marker({
        id: "seed-mk-03",
        xPct: 72.4,
        yPct: 30.5,
        kind: "虫蛀",
        severity: "轻微",
        createdAt: T + 2000,
      }),
    ],
  },
  {
    id: "ge-zhu-12",
    building: "藏经阁东配殿",
    code: "柱网C-12",
    wood: "楠木",
    tenon: "箍头榫",
    dims: { length: 2600, width: 320, height: 320 },
    deformation: "柱身基本竖直，柱脚糟朽",
    // 存在缺等级待校正标记，按规则不能生成建议，校正后方可出具
    suggestion: "",
    suggestionAt: null,
    connectedTo: ["ge-dongliang-03"],
    markers: [
      marker({
        id: "seed-mk-04",
        xPct: 8,
        yPct: 50,
        kind: "糟朽",
        severity: "严重",
        note: "柱脚糟朽深度约 40mm",
      }),
      // 缺等级 -> 待校正，演示“不能带标记出建议”
      marker({
        id: "seed-mk-05",
        xPct: 46,
        yPct: 62,
        kind: "榫卯松动",
        severity: "",
        note: "柱头榫卯有旷量，等级待鉴定",
      }),
    ],
  },
  {
    id: "ge-dougong-07",
    building: "藏经阁东配殿",
    code: "斗拱D-07",
    wood: "樟木",
    tenon: "半榫",
    dims: { length: 900, width: 120, height: 150 },
    deformation: "轻微变形",
    suggestion: "仅见轻微变形与开裂，继续监测，暂不干预。",
    suggestionAt: T + 8000,
    connectedTo: ["ge-dongliang-03"],
    markers: [
      marker({
        id: "seed-mk-06",
        xPct: 35,
        yPct: 40,
        kind: "变形",
        severity: "轻微",
        note: "拱件轻微弯垂",
      }),
    ],
  },
  {
    id: "ge-chuanfang-05",
    building: "藏经阁东配殿",
    code: "穿枋B-05",
    wood: "杉木",
    tenon: "燕尾榫",
    dims: { length: 2800, width: 150, height: 180 },
    deformation: "",
    suggestion: "",
    suggestionAt: null,
    connectedTo: ["ge-zhu-12"],
    markers: [],
  },
  {
    id: "sz-jia-01",
    building: "山门",
    code: "五架梁F-01",
    wood: "松木",
    tenon: "透榫",
    dims: { length: 4200, width: 260, height: 320 },
    deformation: "",
    suggestion: "",
    suggestionAt: null,
    connectedTo: [],
    markers: [
      marker({
        id: "seed-mk-07",
        xPct: 60,
        yPct: 45,
        kind: "开裂",
        severity: "轻微",
        note: "梁侧细微裂纹",
      }),
    ],
  },
];

export function buildSeedState(): SurveyState {
  return {
    schemaVersion: SCHEMA_VERSION,
    members: SEED_MEMBERS,
    selectedMemberId: SEED_MEMBERS[0].id,
    filterTenon: "全部",
    activeBuilding: SEED_MEMBERS[0].building,
  };
}

/* ------------------------- 结构校验 ------------------------- */

function isMarker(v: unknown): v is Marker {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.xPct === "number" &&
    typeof m.yPct === "number" &&
    typeof m.kind === "string" &&
    typeof m.severity === "string" &&
    typeof m.archived === "boolean"
  );
}

function isMember(v: unknown): v is Member {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.building === "string" &&
    typeof m.code === "string" &&
    typeof m.wood === "string" &&
    typeof m.tenon === "string" &&
    !!m.dims &&
    isValidDims(m.dims as Member["dims"]) &&
    Array.isArray(m.markers) &&
    m.markers.every(isMarker) &&
    Array.isArray(m.connectedTo) &&
    typeof m.deformation === "string" &&
    typeof m.suggestion === "string"
  );
}

export function isValidState(v: unknown): v is SurveyState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    s.schemaVersion === SCHEMA_VERSION &&
    Array.isArray(s.members) &&
    s.members.every(isMember) &&
    (typeof s.selectedMemberId === "string" || s.selectedMemberId === null) &&
    typeof s.filterTenon === "string" &&
    typeof s.activeBuilding === "string"
  );
}

/* ------------------------- 读写 ------------------------- */

export function loadState(): SurveyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
      console.warn("测绘数据校验失败，回退到演示数据");
    }
  } catch (err) {
    console.warn("测绘数据读取失败：", err);
  }
  return buildSeedState();
}

export function saveState(state: SurveyState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("测绘数据保存失败：", err);
  }
}

export const STORAGE_VERSION_KEY = STORAGE_KEY;
