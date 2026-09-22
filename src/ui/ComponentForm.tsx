import { useEffect, useState } from "react";
import {
  ComponentInput,
  DEFECT_TYPES,
  GRADES,
  JOINT_TYPES,
  BuildingComponent,
} from "../business/markerTransform";

interface ComponentFormProps {
  mode: "add" | "edit";
  component: BuildingComponent | null;
  onSave: (input: ComponentInput) => void;
  onSwitchToAdd: () => void;
}

const empty: ComponentInput = {
  building: "",
  code: "",
  wood: "",
  joint: "透榫",
  lengthMm: 0,
  widthMm: 0,
  heightMm: 0,
};

export default function ComponentForm({ mode, component, onSave, onSwitchToAdd }: ComponentFormProps) {
  const [form, setForm] = useState<ComponentInput>(empty);

  useEffect(() => {
    if (mode === "edit" && component) {
      setForm({
        building: component.building,
        code: component.code,
        wood: component.wood,
        joint: component.joint,
        lengthMm: component.lengthMm,
        widthMm: component.widthMm,
        heightMm: component.heightMm,
      });
    } else {
      setForm(empty);
    }
  }, [mode, component]);

  function update<K extends keyof ComponentInput>(key: K, value: ComponentInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSave(form);
  }

  const surfaceChanged =
    mode === "edit" &&
    component &&
    (component.lengthMm !== form.lengthMm || component.widthMm !== form.widthMm);

  return (
    <form className="component-form" onSubmit={submit}>
      <div className="heading">
        <div>
          <p>构件资料</p>
          <h2>{mode === "edit" ? `维护 ${component?.code ?? ""}` : "新增构件"}</h2>
        </div>
        <div className="heading-actions">
          {mode === "edit" && (
            <button type="button" onClick={onSwitchToAdd}>
              新增构件
            </button>
          )}
          <button className="primary" type="submit">
            {mode === "edit" ? "保存修改" : "保存构件"}
          </button>
        </div>
      </div>

      <div className="field-grid">
        <label>
          <span>建筑名称</span>
          <input value={form.building} onChange={(e) => update("building", e.target.value)} placeholder="如 观音阁" />
        </label>
        <label>
          <span>构件编号</span>
          <input value={form.code} onChange={(e) => update("code", e.target.value)} placeholder="如 梁架A-03" />
        </label>
        <label>
          <span>木材种类</span>
          <input value={form.wood} onChange={(e) => update("wood", e.target.value)} placeholder="如 楠木" />
        </label>
        <label>
          <span>榫卯类型</span>
          <select value={form.joint} onChange={(e) => update("joint", e.target.value as ComponentInput["joint"])}>
            {JOINT_TYPES.map((joint) => (
              <option key={joint} value={joint}>{joint}</option>
            ))}
          </select>
        </label>
        <label>
          <span>构件长度 L（mm，示意面长向）</span>
          <input
            type="number"
            min={1}
            value={form.lengthMm || ""}
            onChange={(e) => update("lengthMm", Number(e.target.value))}
          />
        </label>
        <label>
          <span>截面宽 W（mm，示意面宽向）</span>
          <input
            type="number"
            min={1}
            value={form.widthMm || ""}
            onChange={(e) => update("widthMm", Number(e.target.value))}
          />
        </label>
        <label>
          <span>截面高 H（mm，仅记录）</span>
          <input
            type="number"
            min={1}
            value={form.heightMm || ""}
            onChange={(e) => update("heightMm", Number(e.target.value))}
          />
        </label>
      </div>

      {surfaceChanged && (
        <p className="form-warning">
          截面尺寸（长/宽）改动保存后，已有标记将按新尺寸换算（毫米位置保持、百分比重算），
          原标记状态只读留档；换算后越界的标记需先校正，修缮建议需重新生成。
        </p>
      )}

      <p className="form-hint">
        可选病害字段：类型 {DEFECT_TYPES.join(" / ")}；等级 {GRADES.join(" / ")}（在标记面板补录）
      </p>
    </form>
  );
}
