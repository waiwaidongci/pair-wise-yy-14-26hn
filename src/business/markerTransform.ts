/**
 * 业务模块 1/3：标记换算
 * 纯函数模块，不依赖 React 与 localStorage。
 * 负责：像素/百分比/毫米换算、同构件 2% 合并、越界与缺等级判定、
 * 截面尺寸变更后的标记换算（物理毫米位置保持，百分比按新尺寸重算）、修缮建议校验。
 */

export type Grade = "轻微" | "中等" | "严重";
export type DefectType = "开裂" | "糟朽" | "变形" | "虫蛀" | "其他";
export type JointType = "燕尾榫" | "透榫" | "半榫" | "箍头榫";
export type MarkerIssue = "越界" | "缺等级";

export const JOINT_TYPES: JointType[] = ["燕尾榫", "透榫", "半榫", "箍头榫"];
export const DEFECT_TYPES: DefectType[] = ["开裂", "糟朽", "变形", "虫蛀", "其他"];
export const GRADES: Grade[] = ["轻微", "中等", "严重"];

/** 同构件两处标记的合并阈值：间距低于构件长度的 2% */
export const MERGE_RATIO = 0.02;
const EPS = 1e-9;

/** 构件示意面尺寸：构件长 × 截面宽（毫米） */
export interface Dimensions {
  lengthMm: number;
  widthMm: number;
}

export interface PercentPoint {
  /** 沿构件长度方向的百分比，0~1 */
  xPct: number;
  /** 沿截面宽方向的百分比，0~1 */
  yPct: number;
}

export interface MmPoint {
  xMm: number;
  yMm: number;
}

/** 尺寸改动前的标记快照，只读留档 */
export interface ArchiveEntry {
  archivedAt: string;
  reason: string;
  dims: Dimensions;
  point: PercentPoint & MmPoint;
}

export interface Marker extends PercentPoint, MmPoint {
  id: string;
  componentId: string;
  defectType: DefectType | null;
  /** 病害等级；为空即“缺等级”，只能待校正 */
  grade: Grade | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  /** 被合并进来的历史标记 id */
  mergedFrom: string[];
  /** 历次换算/校正前的只读留档 */
  history: ArchiveEntry[];
}

export interface BuildingComponent {
  id: string;
  building: string;
  code: string;
  wood: string;
  joint: JointType;
  lengthMm: number;
  widthMm: number;
  /** 截面高，仅作尺寸记录，不参与示意面换算 */
  heightMm: number;
  createdAt: string;
}

export interface RepairSuggestion {
  componentId: string;
  text: string;
  at: string;
  /** 生成建议时依据的标记快照 */
  markerIds: string[];
}

export interface SurveyState {
  version: 1;
  components: BuildingComponent[];
  markers: Marker[];
  suggestions: RepairSuggestion[];
}

export interface ComponentInput {
  building: string;
  code: string;
  wood: string;
  joint: JointType;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export function dimsOf(component: { lengthMm: number; widthMm: number }): Dimensions {
  return { lengthMm: component.lengthMm, widthMm: component.widthMm };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 示意面点击位置 → 按长宽记录百分比位置（窗口缩放不影响，因为基于实际渲染矩形） */
export function pointToPercent(clientX: number, clientY: number, rect: DOMRect): PercentPoint {
  return {
    xPct: clamp01((clientX - rect.left) / rect.width),
    yPct: clamp01((clientY - rect.top) / rect.height),
  };
}

export function percentToMm(point: PercentPoint, dims: Dimensions): MmPoint {
  return {
    xMm: point.xPct * dims.lengthMm,
    yMm: point.yPct * dims.widthMm,
  };
}

/** 截面尺寸改动后：物理病害位置保持不变，百分比按新尺寸换算（可能越界） */
export function mmToPercent(point: MmPoint, dims: Dimensions): PercentPoint {
  return {
    xPct: dims.lengthMm > 0 ? point.xMm / dims.lengthMm : 0,
    yPct: dims.widthMm > 0 ? point.yMm / dims.widthMm : 0,
  };
}

export function distanceMm(a: MmPoint, b: MmPoint): number {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
}

/** 同构件标记间距是否低于构件长度的 2% */
export function shouldMerge(a: MmPoint, b: MmPoint, dims: Dimensions): boolean {
  return distanceMm(a, b) < MERGE_RATIO * dims.lengthMm;
}

/** 标记当前问题：越界（换算后物理位置超出新尺寸）或缺等级 */
export function markerIssues(marker: Marker, dims: Dimensions): MarkerIssue[] {
  const issues: MarkerIssue[] = [];
  const outByPercent =
    marker.xPct < -EPS || marker.xPct > 1 + EPS || marker.yPct < -EPS || marker.yPct > 1 + EPS;
  const outByMm =
    marker.xMm > dims.lengthMm + 1e-6 || marker.yMm > dims.widthMm + 1e-6;
  if (outByPercent || outByMm) issues.push("越界");
  if (!marker.grade) issues.push("缺等级");
  return issues;
}

export function isPending(marker: Marker, dims: Dimensions): boolean {
  return markerIssues(marker, dims).length > 0;
}

export function isValidComponentInput(input: ComponentInput): boolean {
  return (
    input.building.trim().length > 0 &&
    input.code.trim().length > 0 &&
    input.wood.trim().length > 0 &&
    Number.isFinite(input.lengthMm) &&
    Number.isFinite(input.widthMm) &&
    Number.isFinite(input.heightMm) &&
    input.lengthMm > 0 &&
    input.widthMm > 0 &&
    input.heightMm > 0
  );
}

let idCounter = 0;
function uniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createMarker(
  componentId: string,
  point: PercentPoint,
  dims: Dimensions,
  now: string,
): Marker {
  const mm = percentToMm(point, dims);
  return {
    id: uniqueId("mk"),
    componentId,
    xPct: point.xPct,
    yPct: point.yPct,
    xMm: mm.xMm,
    yMm: mm.yMm,
    defectType: null,
    grade: null,
    note: "",
    createdAt: now,
    updatedAt: now,
    mergedFrom: [],
    history: [],
  };
}

const GRADE_RANK: Record<Grade, number> = { 轻微: 1, 中等: 2, 严重: 3 };

function higherGrade(a: Grade | null, b: Grade | null): Grade | null {
  if (!a) return b;
  if (!b) return a;
  return GRADE_RANK[a] >= GRADE_RANK[b] ? a : b;
}

/**
 * 合并同构件相距不足构件长度 2% 的两处标记：
 * 物理位置取中点，等级取较高者，合并来源记入 mergedFrom。
 */
export function mergeMarkers(a: Marker, b: Marker, dims: Dimensions, now: string): Marker {
  const mid: MmPoint = { xMm: (a.xMm + b.xMm) / 2, yMm: (a.yMm + b.yMm) / 2 };
  const pct = mmToPercent(mid, dims);
  const notes = [a.note, b.note].filter((n) => n.trim().length > 0);
  return {
    ...a,
    xPct: pct.xPct,
    yPct: pct.yPct,
    xMm: mid.xMm,
    yMm: mid.yMm,
    defectType: a.defectType ?? b.defectType,
    grade: higherGrade(a.grade, b.grade),
    note: Array.from(new Set(notes)).join("；"),
    updatedAt: now,
    mergedFrom: Array.from(new Set([...a.mergedFrom, a.id, ...b.mergedFrom, b.id])),
    history: [...a.history, ...b.history],
  };
}

/**
 * 截面尺寸改动后的批量换算：
 * 毫米位置（病害在木材上的实际位置）保持，百分比按新尺寸重算；
 * 每个标记追加一条原尺寸只读留档；换算后越界者由 markerIssues 判为待校正。
 */
export function convertMarkersForDimensions(
  markers: Marker[],
  oldDims: Dimensions,
  newDims: Dimensions,
  reason: string,
  now: string,
): Marker[] {
  return markers.map((marker) => {
    const archive: ArchiveEntry = {
      archivedAt: now,
      reason,
      dims: { ...oldDims },
      point: { xPct: marker.xPct, yPct: marker.yPct, xMm: marker.xMm, yMm: marker.yMm },
    };
    const pct = mmToPercent({ xMm: marker.xMm, yMm: marker.yMm }, newDims);
    return {
      ...marker,
      xPct: pct.xPct,
      yPct: pct.yPct,
      updatedAt: now,
      history: [...marker.history, archive],
    };
  });
}

/** 人工校正（如越界标记重新定位）：同样把校正前状态只读留档 */
export function relocateMarker(
  marker: Marker,
  point: PercentPoint,
  dims: Dimensions,
  now: string,
): Marker {
  const archive: ArchiveEntry = {
    archivedAt: now,
    reason: "人工校正标记位置",
    dims: { ...dims },
    point: { xPct: marker.xPct, yPct: marker.yPct, xMm: marker.xMm, yMm: marker.yMm },
  };
  const mm = percentToMm(point, dims);
  return {
    ...marker,
    xPct: point.xPct,
    yPct: point.yPct,
    xMm: mm.xMm,
    yMm: mm.yMm,
    updatedAt: now,
    history: [...marker.history, archive],
  };
}

export interface SuggestionEntry {
  marker: Marker;
  label: string;
}

export type SuggestionResult =
  | { ok: true; text: string; markerIds: string[] }
  | { ok: false; reasons: string[] };

function adviceFor(defect: DefectType | null, grade: Grade): string {
  if (grade === "严重") {
    switch (defect) {
      case "糟朽":
        return "严重糟朽部位优先局部墩接，必要时更换构件并做防腐处理";
      case "开裂":
        return "严重裂缝采用灌浆嵌补并加铁箍加固，端部裂缝重点复查";
      case "变形":
        return "先支顶卸荷，矫正变形后加固并重新复测";
      case "虫蛀":
        return "彻底清除蛀蚀木材，做防虫防腐处理，必要时更换";
      default:
        return "严重病害需现场复核后制定专项修缮方案";
    }
  }
  if (grade === "中等") {
    switch (defect) {
      case "糟朽":
        return "剔除中等糟朽范围朽木后嵌补加固";
      case "开裂":
        return "中等裂缝注胶嵌补，必要时加箍";
      case "变形":
        return "矫正变形后支顶加固";
      case "虫蛀":
        return "清除蛀蚀部位并做防虫防腐处理";
      default:
        return "中等病害跟踪检查并做表面修补";
    }
  }
  return defect === "变形" ? "轻微变形纳入定期监测" : "轻微病害做表面修补并定期巡查";
}

/**
 * 生成修缮建议：存在越界或缺等级的待校正标记时一律拒绝，
 * 不允许带着问题标记生成修缮建议。
 */
export function buildRepairSuggestion(
  component: BuildingComponent,
  dims: Dimensions,
  entries: SuggestionEntry[],
): SuggestionResult {
  if (entries.length === 0) {
    return { ok: false, reasons: ["该构件尚无病害标记"] };
  }
  const reasons: string[] = [];
  for (const { marker, label } of entries) {
    const issues = markerIssues(marker, dims);
    if (issues.length > 0) {
      const detail = issues.includes("越界")
        ? `越界（长 ${(marker.xPct * 100).toFixed(1)}% / 宽 ${(marker.yPct * 100).toFixed(1)}%）`
        : issues.join("、");
      reasons.push(`${label} ${detail}，需先校正`);
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };

  const valid = entries.map((e) => e.marker);
  const description = entries
    .map(({ marker: m, label }) => {
      const mergedNote = m.mergedFrom.length > 0 ? `，由 ${m.mergedFrom.length + 1} 处邻近标记合并` : "";
      return `${label} ${m.defectType ?? "未分类"}·${m.grade}（长 ${(m.xPct * 100).toFixed(1)}% / 宽 ${(m.yPct * 100).toFixed(1)}%${mergedNote}）`;
    })
    .join("；");

  const adviceKeys = new Set<string>();
  const advices: string[] = [];
  for (const m of valid) {
    const key = `${m.defectType ?? "其他"}-${m.grade}`;
    if (adviceKeys.has(key)) continue;
    adviceKeys.add(key);
    advices.push(adviceFor(m.defectType, m.grade as Grade));
  }

  return {
    ok: true,
    markerIds: valid.map((m) => m.id),
    text: `${component.building} ${component.code} 检出有效病害 ${valid.length} 处：${description}。修缮建议：${advices.join("；")}。`,
  };
}
