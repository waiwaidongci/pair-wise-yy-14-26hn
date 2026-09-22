import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Dimensions,
  Marker,
  Member,
  SeverityOrEmpty,
  SurveyState,
} from "../types";
import {
  findMergeTarget,
  invalidReason,
  isInvalidMarker,
  isValidDims,
  mergeMarkers,
  rescalePosition,
  round2,
} from "./markerGeometry";
import { buildSeedState, loadState, saveState, uid } from "./surveyStorage";

/**
 * 业务模块三：界面操作
 * -------------------------------------------------------------
 * 测绘页所有交互（选中、筛选、点击布点、合并、改尺寸换算留档、
 * 校正、出建议、关系维护）都走这个 hook；数据来源于持久化模块，
 * 清单 / 关系图 / 刷新后的视图全部读取同一份 state，保持一致。
 */

export interface Toast {
  id: string;
  text: string;
  tone: "info" | "warn";
}

export interface MarkerStats {
  active: number;
  invalid: number;
  archived: number;
}

export interface MemberStats extends MarkerStats {
  ready: boolean;
}

const REPAIR_LIBRARY: Record<string, string> = {
  开裂: "对裂缝进行嵌补灌缝并加碳纤维箍加固",
  槽朽: "剔除糟朽部分后局部墩接替换，并做防腐防虫处理",
  糟朽: "剔除糟朽部分后局部墩接替换，并做防腐防虫处理",
  变形: "校正复位后加设铁件拉结，持续监测残余变形",
  虫蛀: "清除虫蚀层并做防虫药剂处理，必要时包镶",
  榫卯松动: "重新归安榫卯，缝隙用硬木楔背紧",
};

const SEVERITY_NOTE: Record<string, string> = {
  轻微: "可纳入年度养护",
  中等: "建议本修缮周期内处理",
  严重: "需立即排险并重点修缮",
};

/** 根据当前有效标记生成修缮建议；存在待校正标记时拒绝生成 */
export function buildSuggestion(member: Member): {
  ok: boolean;
  suggestion: string;
  blocked?: number;
} {
  const active = member.markers.filter((m) => !m.archived);
  const invalid = active.filter(isInvalidMarker);
  if (invalid.length > 0) return { ok: false, suggestion: "", blocked: invalid.length };
  if (active.length === 0) return { ok: true, suggestion: "未发现病害标记，维持日常巡查。" };

  const kinds = new Set<string>();
  const severities = new Set<string>();
  for (const m of active) {
    m.kind.split("+").forEach((k) => kinds.add(k));
    if (m.severity) severities.add(m.severity);
  }
  const measures = Array.from(kinds).map(
    (k) => `针对${k}：${REPAIR_LIBRARY[k] ?? "由木作师傅现场评估处理"}`
  );
  const rank = (s: string) => (s === "严重" ? 3 : s === "中等" ? 2 : 1);
  const top = Array.from(severities).sort((a, b) => rank(b) - rank(a))[0];
  const tail = top ? `病害最高等级为「${top}」，${SEVERITY_NOTE[top]}。` : "";
  return {
    ok: true,
    suggestion: `本构件共 ${active.length} 处有效病害标记。${measures.join("；")}。${tail}`,
  };
}

export function markerStats(markers: Marker[]): MarkerStats {
  let active = 0;
  let invalid = 0;
  let archived = 0;
  for (const m of markers) {
    if (m.archived) archived += 1;
    else {
      active += 1;
      if (isInvalidMarker(m)) invalid += 1;
    }
  }
  return { active, invalid, archived };
}

export function useSurvey() {
  const [state, setState] = useState<SurveyState>(loadState);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 任何改动立即持久化，刷新 / 重开页面后状态一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  const pushToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = uid("t");
    setToasts((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ------------------------- 选择 / 筛选 ------------------------- */

  const selectMember = useCallback((id: string) => {
    setState((s) => ({ ...s, selectedMemberId: id }));
  }, []);

  const setFilterTenon = useCallback((tenon: string) => {
    setState((s) => ({ ...s, filterTenon: tenon }));
  }, []);

  const setActiveBuilding = useCallback((building: string) => {
    setState((s) => {
      const first = s.members.find((m) => m.building === building);
      return {
        ...s,
        activeBuilding: building,
        selectedMemberId: first?.id ?? s.selectedMemberId,
      };
    });
  }, []);

  /* ------------------------- 标记操作 ------------------------- */

  const updateMember = useCallback(
    (memberId: string, updater: (m: Member) => Member) => {
      setState((s) => ({
        ...s,
        members: s.members.map((m) => (m.id === memberId ? updater(m) : m)),
      }));
    },
    []
  );

  /**
   * 在示意面上点击布点。同构件两处标记间距低于构件长度 2% 时自动合并：
   * 保留原标记位置，等级取高，病害类型 / 描述合并，新标记不另立。
   * 新标记默认缺等级，校正前只能处于待校正状态。
   */
  const addMarker = useCallback(
    (memberId: string, pct: { xPct: number; yPct: number }, kind: string) => {
      const member = state.members.find((m) => m.id === memberId);
      if (!member) return;

      const draft: Marker = {
        id: uid("mk"),
        xPct: round2(pct.xPct),
        yPct: round2(pct.yPct),
        kind,
        severity: "",
        note: "",
        createdAt: Date.now(),
        archived: false,
        dimsAtCreation: null,
      };

      const target = findMergeTarget(draft, member.markers, member.dims);
      if (target) {
        const merged = mergeMarkers(target, draft);
        updateMember(memberId, (m) => ({
          ...m,
          markers: m.markers.map((mk) =>
            mk.id === target.id
              ? { ...mk, ...merged, note: merged.note ?? mk.note }
              : mk
          ),
        }));
        const reason = invalidReason({ ...target, ...merged } as Marker);
        pushToast(
          `与已有标记间距小于构件长度的 2%，已合并到 #${
            member.markers.filter((x) => !x.archived).indexOf(target) + 1
          }${reason ? `（仍${reason}，待校正）` : ""}`,
          "warn"
        );
        return;
      }

      updateMember(memberId, (m) => ({ ...m, markers: [...m.markers, draft] }));
      pushToast("已在示意面记录病害标记（缺等级，待校正）", "warn");
    },
    [state.members, updateMember, pushToast]
  );

  const updateMarker = useCallback(
    (memberId: string, markerId: string, patch: Partial<Marker>) => {
      updateMember(memberId, (m) => ({
        ...m,
        markers: m.markers.map((mk) =>
          mk.id === markerId
            ? {
                ...mk,
                ...patch,
                xPct: patch.xPct === undefined ? mk.xPct : round2(patch.xPct),
                yPct: patch.yPct === undefined ? mk.yPct : round2(patch.yPct),
              }
            : mk
        ),
      }));
    },
    [updateMember]
  );

  const deleteMarker = useCallback(
    (memberId: string, markerId: string) => {
      const member = state.members.find((m) => m.id === memberId);
      const target = member?.markers.find((m) => m.id === markerId);
      if (target?.archived) {
        pushToast("留档标记为历史记录，不能删除", "warn");
        return;
      }
      updateMember(memberId, (m) => ({
        ...m,
        markers: m.markers.filter((mk) => mk.id !== markerId),
      }));
      pushToast("标记已删除");
    },
    [state.members, updateMember, pushToast]
  );

  /* ------------------------- 截面改动：换算 + 留档 ------------------------- */

  /**
   * 截面尺寸改动后：
   * 1. 原有效（非留档）标记全部转为只读留档，快照保存旧尺寸与旧百分比；
   * 2. 按“旧百分比 -> 物理毫米 -> 新百分比”换算出一套新标记；
   * 3. 换算后越界的新标记自动成为待校正，不参与修缮建议；
   * 4. 已有留档保持不动。
   */
  const applyDimensions = useCallback(
    (memberId: string, newDims: Dimensions) => {
      if (!isValidDims(newDims)) {
        pushToast("截面尺寸需为大于 0 的数字", "warn");
        return;
      }
      const member = state.members.find((m) => m.id === memberId);
      if (!member) return;
      const oldDims = member.dims;

      if (
        oldDims.length === newDims.length &&
        oldDims.width === newDims.width &&
        oldDims.height === newDims.height
      ) {
        return;
      }

      updateMember(memberId, (m) => {
        const keepArchived = m.markers.filter((mk) => mk.archived);
        const converted: Marker[] = [];
        const archivedCopies: Marker[] = [];

        for (const mk of m.markers) {
          if (mk.archived) continue;
          const pos = rescalePosition(mk, oldDims, newDims);
          archivedCopies.push({
            ...mk,
            archived: true,
            dimsAtCreation: oldDims,
            archiveReason: `截面由 ${oldDims.length}×${oldDims.width}×${oldDims.height}mm 改为 ${newDims.length}×${newDims.width}×${newDims.height}mm`,
            convertedFromId: undefined,
          });
          converted.push({
            ...mk,
            id: uid("mk"),
            xPct: pos.xPct,
            yPct: pos.yPct,
            archived: false,
            dimsAtCreation: oldDims,
            convertedFromId: mk.id,
          });
        }

        return {
          ...m,
          dims: newDims,
          // 既有留档在前，本次留档居中，换算后的现行标记在后
          markers: [...keepArchived, ...archivedCopies, ...converted],
        };
      });

      const rescaledCount = member.markers.filter((mk) => !mk.archived).length;
      pushToast(
        `截面已更新：${rescaledCount} 处原标记按新尺寸换算，原件只读留档`
      );
    },
    [state.members, updateMember, pushToast]
  );

  /* ------------------------- 构件信息 / 建议 ------------------------- */

  const updateMemberInfo = useCallback(
    (
      memberId: string,
      patch: Partial<Pick<Member, "building" | "code" | "wood" | "tenon" | "deformation">>
    ) => {
      updateMember(memberId, (m) => ({ ...m, ...patch }));
    },
    [updateMember]
  );

  const generateSuggestion = useCallback(
    (memberId: string) => {
      const member = state.members.find((m) => m.id === memberId);
      if (!member) return { ok: false as const };
      const result = buildSuggestion(member);
      if (!result.ok) {
        pushToast(
          `有 ${result.blocked} 处标记待校正（越界或缺等级），不能带着标记生成修缮建议`,
          "warn"
        );
        return result;
      }
      updateMember(memberId, (m) => ({
        ...m,
        suggestion: result.suggestion,
        suggestionAt: Date.now(),
      }));
      pushToast("修缮建议已按当前有效标记生成");
      return result;
    },
    [state.members, updateMember, pushToast]
  );

  const clearSuggestion = useCallback(
    (memberId: string) => {
      updateMember(memberId, (m) => ({
        ...m,
        suggestion: "",
        suggestionAt: null,
      }));
    },
    [updateMember]
  );

  const addMember = useCallback(
    (building: string) => {
      const id = uid("mem");
      const newMember: Member = {
        id,
        building,
        code: `新构件-${state.members.length + 1}`,
        wood: "松木",
        tenon: "燕尾榫",
        dims: { length: 2000, width: 150, height: 200 },
        deformation: "",
        suggestion: "",
        suggestionAt: null,
        markers: [],
        connectedTo: [],
      };
      setState((s) => ({
        ...s,
        members: [...s.members, newMember],
        activeBuilding: building,
        selectedMemberId: id,
      }));
      pushToast("已新增构件，在构件面上点击即可布点");
    },
    [state.members.length, pushToast]
  );

  const toggleConnection = useCallback(
    (memberId: string, otherId: string) => {
      setState((s) => ({
        ...s,
        members: s.members.map((m) => {
          if (m.id !== memberId && m.id !== otherId) return m;
          const selfId = m.id;
          const targetId = selfId === memberId ? otherId : memberId;
          const linked = m.connectedTo.includes(targetId);
          return {
            ...m,
            connectedTo: linked
              ? m.connectedTo.filter((x) => x !== targetId)
              : [...m.connectedTo, targetId],
          };
        }),
      }));
    },
    []
  );

  const resetDemo = useCallback(() => {
    const seed = buildSeedState();
    setState(seed);
    pushToast("已恢复演示测绘数据");
  }, [pushToast]);

  /* ------------------------- 派生数据（单一数据源） ------------------------- */

  const selectedMember = useMemo(
    () => state.members.find((m) => m.id === state.selectedMemberId) ?? null,
    [state.members, state.selectedMemberId]
  );

  const buildings = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of state.members) {
      const list = map.get(m.building) ?? [];
      list.push(m);
      map.set(m.building, list);
    }
    return Array.from(map, ([name, members]) => ({ name, members }));
  }, [state.members]);

  /** 清单：当前建筑 + 榫卯筛选，与关系图、标记图同源 */
  const visibleMembers = useMemo(() => {
    return state.members.filter(
      (m) =>
        m.building === state.activeBuilding &&
        (state.filterTenon === "全部" || m.tenon === state.filterTenon)
    );
  }, [state.members, state.activeBuilding, state.filterTenon]);

  const metrics = useMemo(() => {
    let markerCount = 0;
    let invalidCount = 0;
    const tenons = new Set<string>();
    let repairPending = 0;
    for (const m of state.members) {
      tenons.add(m.tenon);
      const stats = markerStats(m.markers);
      markerCount += stats.active;
      invalidCount += stats.invalid;
      if (stats.invalid > 0) repairPending += 1;
      else if (!m.suggestion && stats.active > 0) repairPending += 1;
    }
    return {
      memberCount: state.members.length,
      markerCount,
      invalidCount,
      tenonKinds: tenons.size,
      repairPending,
    };
  }, [state.members]);

  return {
    state,
    toasts,
    dismissToast,
    selectedMember,
    buildings,
    visibleMembers,
    metrics,
    // 操作
    selectMember,
    setFilterTenon,
    setActiveBuilding,
    addMarker,
    updateMarker,
    deleteMarker,
    applyDimensions,
    updateMemberInfo,
    generateSuggestion,
    clearSuggestion,
    addMember,
    toggleConnection,
    resetDemo,
  };
}

export type SurveyController = ReturnType<typeof useSurvey>;

export type { SeverityOrEmpty };
