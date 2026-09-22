// 临时自测：node --experimental-strip-types test/logic-check.ts
import assert from "node:assert";
import {
  createMarker,
  percentToMm,
  pointToPercent,
  shouldMerge,
  mergeMarkers,
  markerIssues,
  convertMarkersForDimensions,
  relocateMarker,
  buildRepairSuggestion,
  dimsOf,
} from "../src/business/markerTransform.ts";
import { SurveyStore, loadState, saveState, clearPersistedState, validateState, createSeedState } from "../src/business/repository.ts";
import { SurveyController, componentView } from "../src/business/surveyController.ts";

// localStorage stub
const mem = new Map<string, string>();
(globalThis as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};
// DOMRect stub
class FakeRect {
  constructor(public left: number, public top: number, public width: number, public height: number) {}
  get right() { return this.left + this.width; }
  get bottom() { return this.top + this.height; }
}
(globalThis as { DOMRect: typeof DOMRect }).DOMRect = FakeRect as unknown as typeof DOMRect;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log("✓", name);
}

const dims = { lengthMm: 1000, widthMm: 200 };

check("点击位置按长宽换算百分比与毫米", () => {
  const rect = new FakeRect(0, 0, 500, 100);
  const pct = pointToPercent(250, 25, rect as unknown as DOMRect);
  assert.ok(Math.abs(pct.xPct - 0.5) < 1e-9);
  assert.ok(Math.abs(pct.yPct - 0.25) < 1e-9);
  const mm = percentToMm(pct, dims);
  assert.equal(mm.xMm, 500);
  assert.equal(mm.yMm, 50);
});

check("间距 < 构件长度 2% 合并；>= 不合并", () => {
  const a = createMarker("c", { xPct: 0.1, yPct: 0.5 }, dims, "t");
  const near = createMarker("c", { xPct: 0.115, yPct: 0.5 }, dims, "t"); // 15mm < 20mm
  const far = createMarker("c", { xPct: 0.13, yPct: 0.5 }, dims, "t"); // 30mm
  assert.equal(shouldMerge(a, near, dims), true);
  assert.equal(shouldMerge(a, far, dims), false);
});

check("合并取中点、等级取高、来源留痕", () => {
  const a = { ...createMarker("c", { xPct: 0.1, yPct: 0.5 }, dims, "t"), defectType: "开裂" as const, grade: "轻微" as const };
  const b = { ...createMarker("c", { xPct: 0.12, yPct: 0.5 }, dims, "t"), grade: "严重" as const };
  const merged = mergeMarkers(a, b, dims, "now");
  assert.equal(merged.xMm, 110);
  assert.equal(merged.grade, "严重");
  assert.ok(merged.mergedFrom.includes(a.id) && merged.mergedFrom.includes(b.id));
});

check("缺等级 → 待校正，不能生成建议", () => {
  const m = createMarker("c", { xPct: 0.2, yPct: 0.2 }, dims, "t");
  assert.deepEqual(markerIssues(m, dims), ["缺等级"]);
  const comp = { id: "c", building: "B", code: "X", wood: "松", joint: "透榫" as const, lengthMm: 1000, widthMm: 200, heightMm: 150, createdAt: "t" };
  const r = buildRepairSuggestion(comp, dims, [{ marker: m, label: "标记01" }]);
  assert.equal(r.ok, false);
});

check("截面改短后毫米位置保持、百分比重算、越界待校正且拦截建议", () => {
  const m = { ...createMarker("c", { xPct: 0.8, yPct: 0.5 }, dims, "t"), grade: "轻微" as const, defectType: "开裂" as const };
  const newDims = { lengthMm: 500, widthMm: 200 };
  const [converted] = convertMarkersForDimensions([m], dims, newDims, "截面尺寸改动：1000×200mm → 500×200mm", "now");
  assert.equal(converted.xMm, 800); // 毫米保持
  assert.equal(converted.xPct, 1.6); // 800/500
  assert.deepEqual(markerIssues(converted, newDims), ["越界"]);
  assert.equal(converted.history.length, 1);
  const comp = { id: "c", building: "B", code: "X", wood: "松", joint: "透榫" as const, ...newDims, heightMm: 150, createdAt: "t" };
  const r = buildRepairSuggestion(comp, newDims, [{ marker: converted, label: "标记01" }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reasons[0], /越界/);
});

check("校正回界内后可生成建议，且校正前留档", () => {
  const m = { ...createMarker("c", { xPct: 1.6, yPct: 0.5 }, { lengthMm: 500, widthMm: 200 }, "t"), xMm: 800, yMm: 100, grade: "轻微" as const };
  const newDims = { lengthMm: 500, widthMm: 200 };
  const fixed = relocateMarker(m, { xPct: 0.4, yPct: 0.5 }, newDims, "now2");
  assert.deepEqual(markerIssues(fixed, newDims), []);
  assert.equal(fixed.history.length, 1);
  const comp = { id: "c", building: "B", code: "X", wood: "松", joint: "透榫" as const, ...newDims, heightMm: 150, createdAt: "t" };
  const r = buildRepairSuggestion(comp, newDims, [{ marker: fixed, label: "标记01" }]);
  assert.equal(r.ok, true);
});

check("持久化往返：保存后重新加载一致，坏数据回退种子", () => {
  clearPersistedState();
  const state = createSeedState();
  saveState(state);
  const loaded = loadState();
  assert.equal(loaded.components.length, state.components.length);
  assert.equal(loaded.markers.length, state.markers.length);
  assert.ok(validateState(loaded));
  mem.set("hxyfront-62013:survey:v1", "{ not json");
  const fallback = loadState();
  assert.equal(fallback.components.length, state.components.length);
});

check("控制器：落标自动合并/尺寸换算/待校正拦截建议/状态派生一致", () => {
  clearPersistedState();
  const store = new SurveyStore(createSeedState());
  const ctrl = new SurveyController(store);
  const snap0 = ctrl.getSnapshot();
  const comp = snap0.survey.components[0]; // 6000×240，已有2个有效标记且有建议
  const rect = new FakeRect(0, 0, 600, 240) as unknown as DOMRect;
  const before = store.getState().markers.filter((m) => m.componentId === comp.id).length;

  // 落在已有标记 m1a（12%,35% → 720mm, 84mm）附近：12.4%→744mm，距 24mm < 2%*6000=120mm
  const p1 = pointToPercent(74.4, 84, rect);
  ctrl.selectComponent(comp.id);
  ctrl.handleSurfaceClick(comp.id, p1);
  const after = store.getState().markers.filter((m) => m.componentId === comp.id);
  assert.equal(after.length, before, "邻近点击应合并而不是新增");
  assert.ok(after.some((m) => m.mergedFrom.length > 0));

  // 尺寸改短 → 越界标记出现
  ctrl.updateComponent(comp.id, {
    building: comp.building, code: comp.code, wood: comp.wood, joint: comp.joint,
    lengthMm: 500, widthMm: comp.widthMm, heightMm: comp.heightMm,
  });
  const converted = store.getState().markers.filter((m) => m.componentId === comp.id);
  const pending = converted.filter((m) => markerIssues(m, dimsOf({ ...comp, lengthMm: 500 })).includes("越界"));
  assert.ok(pending.length >= 1, "长 500mm 后必有越界标记");
  // 旧建议作废
  assert.equal(store.getState().suggestions.some((s) => s.componentId === comp.id), false);
  // 生成被拦截
  ctrl.generateSuggestion(comp.id);
  assert.equal(store.getState().suggestions.some((s) => s.componentId === comp.id), false);
  assert.match(ctrl.getSnapshot().ui.notice ?? "", /无法生成/);

  // 派生视图与标记状态一致
  const view = componentView({ ...comp, lengthMm: 500 }, store.getState().markers);
  assert.equal(view.pendingCount, pending.length);
});

console.log(`\n全部通过：${passed} 组`);
