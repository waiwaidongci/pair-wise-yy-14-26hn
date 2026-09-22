import type { Dimensions, Marker, Severity, SeverityOrEmpty } from "../types";

/**
 * 业务模块一：标记换算
 * -------------------------------------------------------------
 * 标记在示意面上只保存“百分比位置”（沿构件长 / 宽两个方向，0~100），
 * 因此窗口缩放、重新打开页面后位置天然保持。
 * 截面尺寸改动时，先按旧尺寸换算成物理毫米位置，再按新尺寸反算百分比；
 * 越界判定、2% 合并阈值也全部基于物理尺寸计算。
 */

export interface PointMm {
  x: number;
  y: number;
}

export const MERGE_RATIO = 0.02;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function isValidDims(d: Dimensions): boolean {
  return (
    d &&
    Number.isFinite(d.length) &&
    Number.isFinite(d.width) &&
    Number.isFinite(d.height) &&
    d.length > 0 &&
    d.width > 0 &&
    d.height > 0
  );
}

/** 百分比 -> 物理毫米（x 沿长度，y 沿宽度） */
export function pctToMm(p: { xPct: number; yPct: number }, d: Dimensions): PointMm {
  return {
    x: (p.xPct / 100) * d.length,
    y: (p.yPct / 100) * d.width,
  };
}

/** 物理毫米 -> 百分比（新截面下可能越界，不在此 clamp） */
export function mmToPct(p: PointMm, d: Dimensions) {
  return {
    xPct: (p.x / d.length) * 100,
    yPct: (p.y / d.width) * 100,
  };
}

/**
 * 截面尺寸改动：旧尺寸百分比 -> 毫米物理位置 -> 新尺寸百分比。
 * 物理位置不变，只是百分比随新尺寸重新换算。
 */
export function rescalePosition(
  p: { xPct: number; yPct: number },
  oldDims: Dimensions,
  newDims: Dimensions
): { xPct: number; yPct: number } {
  const mm = pctToMm(p, oldDims);
  const pct = mmToPct(mm, newDims);
  return { xPct: round2(pct.xPct), yPct: round2(pct.yPct) };
}

/** 两点物理间距（mm），欧氏距离 */
export function distanceMm(a: PointMm, b: PointMm): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 合并阈值：构件长度的 2% */
export function mergeThreshold(d: Dimensions): number {
  return d.length * MERGE_RATIO;
}

/**
 * 判断新标记是否与某个现有标记距离低于构件长度的 2%。
 * 只在同一构件、同一尺寸基准（当前尺寸）的有效标记之间比较；
 * 留档标记不参与合并。
 */
export function findMergeTarget(
  draft: { xPct: number; yPct: number },
  markers: Marker[],
  dims: Dimensions
): Marker | null {
  const dm = pctToMm(draft, dims);
  const threshold = mergeThreshold(dims);
  let best: Marker | null = null;
  let bestDist = Infinity;
  for (const m of markers) {
    // 留档标记是历史快照，不参与合并；待校正标记仍可作为合并目标，
    // 合并后若仍缺等级 / 越界，继续保持待校正。
    if (m.archived) continue;
    const dist = distanceMm(dm, pctToMm(m, dims));
    if (dist < threshold && dist < bestDist) {
      best = m;
      bestDist = dist;
    }
  }
  return best;
}

/** 越界：换算后的百分比落在 [0,100] 之外（新截面变小可能发生） */
export function isOutOfBounds(m: Pick<Marker, "xPct" | "yPct">): boolean {
  return m.xPct < 0 || m.xPct > 100 || m.yPct < 0 || m.yPct > 100;
}

/** 缺等级：等级为空 */
export function isMissingSeverity(m: Pick<Marker, "severity">): boolean {
  return !m.severity;
}

/**
 * 待校正：越界或缺等级。待校正标记不允许带入修缮建议。
 * 留档标记属于历史记录，不计入待校正，也不参与建议。
 */
export function isInvalidMarker(m: Marker): boolean {
  if (m.archived) return false;
  return isOutOfBounds(m) || isMissingSeverity(m);
}

export function invalidReason(m: Marker): string {
  if (isOutOfBounds(m)) return "换算越界";
  if (isMissingSeverity(m)) return "缺等级";
  return "";
}

/** 屏幕坐标 -> 百分比（相对于示意面容器） */
export function eventToPct(
  e: { clientX: number; clientY: number },
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">
) {
  return {
    xPct: clampPct(round2(((e.clientX - rect.left) / rect.width) * 100)),
    yPct: clampPct(round2(((e.clientY - rect.top) / rect.height) * 100)),
  };
}

const SEVERITY_RANK: Record<Severity, number> = { 轻微: 1, 中等: 2, 严重: 3 };

/**
 * 合并两处标记：物理位置不变，沿同尺寸反算百分比保持原标记坐标；
 * 等级取较高者，病害类型 / 描述合并。返回需要写入目标标记的字段。
 */
export function mergeMarkers(existing: Marker, incoming: Marker): Partial<Marker> {
  const severity: SeverityOrEmpty =
    (SEVERITY_RANK[incoming.severity as Severity] ?? 0) >
    (SEVERITY_RANK[existing.severity as Severity] ?? 0)
      ? incoming.severity
      : existing.severity;

  const kinds = new Set<string>();
  for (const k of [existing.kind, incoming.kind].filter(Boolean)) kinds.add(k);
  const notes = [existing.note, incoming.note]
    .filter(Boolean)
    .join("；");
  return {
    severity,
    kind: Array.from(kinds).join("+"),
    note: notes,
  };
}

/** 标记在当前尺寸下的物理坐标，用于清单 / 提示展示 */
export function describePosition(m: Marker, d: Dimensions): string {
  const mm = pctToMm(m, d);
  return `长向 ${mm.x.toFixed(0)}mm（${m.xPct}%）· 宽向 ${mm.y.toFixed(0)}mm（${m.yPct}%）`;
}
