export type Severity = "轻微" | "中等" | "严重";
export type SeverityOrEmpty = Severity | "";

export interface Dimensions {
  /** 构件长（mm），示意面 X 轴 */
  length: number;
  /** 截面宽（mm），示意面 Y 轴 */
  width: number;
  /** 截面高（mm） */
  height: number;
}

export interface Marker {
  id: string;
  /** 沿构件长度方向的百分比位置 0~100 */
  xPct: number;
  /** 沿构件宽度方向的百分比位置 0~100 */
  yPct: number;
  /** 病害类型 */
  kind: string;
  /** 病害等级；空字符串表示缺等级（待校正） */
  severity: SeverityOrEmpty;
  note: string;
  createdAt: number;
  /** 只读留档标记（截面改动前的原始记录） */
  archived: boolean;
  /** 留档标记对应的旧截面尺寸 */
  dimsAtCreation: Dimensions | null;
  archiveReason?: string;
  /** 换算标记溯源到的原留档标记 id */
  convertedFromId?: string;
}

export interface Member {
  id: string;
  building: string;
  /** 构件编号 */
  code: string;
  /** 木材种类 */
  wood: string;
  /** 榫卯类型 */
  tenon: string;
  dims: Dimensions;
  /** 变形情况 */
  deformation: string;
  /** 修缮建议 */
  suggestion: string;
  suggestionAt: number | null;
  markers: Marker[];
  /** 同建筑内榫卯连接的构件 id */
  connectedTo: string[];
}

export interface SurveyState {
  schemaVersion: 1;
  members: Member[];
  selectedMemberId: string | null;
  /** 榫卯类型筛选，"全部" 表示不筛选 */
  filterTenon: string;
  /** 当前查看的建筑（关系视图 / 清单分组） */
  activeBuilding: string;
}

export const TENON_TYPES = ["燕尾榫", "透榫", "半榫", "箍头榫"] as const;

export const DISEASE_KINDS = [
  "开裂",
  "糟朽",
  "变形",
  "虫蛀",
  "榫卯松动",
] as const;

export const SEVERITIES: Severity[] = ["轻微", "中等", "严重"];
