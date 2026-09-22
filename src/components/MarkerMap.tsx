import { useEffect, useRef, useState } from "react";
import type { Dimensions, Marker, Member } from "../types";
import {
  clampPct,
  describePosition,
  eventToPct,
  invalidReason,
  isInvalidMarker,
  isOutOfBounds,
  mergeThreshold,
  pctToMm,
  rescalePosition,
} from "../business/markerGeometry";

/**
 * 病害标记图：构件示意面（长 × 宽）。
 * - 标记只按百分比定位，窗口缩放 / 重开后位置保持；
 * - 点击空白处在该百分比位置布点，拖拽已有标记可校正位置；
 * - 越界标记吸附在边缘并以红色虚线脉冲提示；
 * - 截面改动前的原标记换算到当前尺寸后，以灰色菱形只读留档显示。
 */

const FACE_MIN_HEIGHT = 260;
const TICKS = [0, 25, 50, 75, 100];

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 留档标记的旧百分比换算到当前尺寸，仅用于在当前面上叠加显示 */
function ghostPct(m: Marker, dims: Dimensions) {
  if (!m.dimsAtCreation) return { xPct: m.xPct, yPct: m.yPct };
  return rescalePosition(m, m.dimsAtCreation, dims);
}

interface Props {
  member: Member;
  selectedMarkerId: string | null;
  onAdd: (pct: { xPct: number; yPct: number }) => void;
  onMove: (markerId: string, pct: { xPct: number; yPct: number }) => void;
  onSelect: (markerId: string) => void;
}

export function MarkerMap({
  member,
  selectedMarkerId,
  onAdd,
  onMove,
  onSelect,
}: Props) {
  const [scrollRef, containerWidth] = useContainerWidth<HTMLDivElement>();
  const faceRef = useRef<HTMLDivElement | null>(null);
  const dragId = useRef<string | null>(null);
  const movedRef = useRef(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { dims } = member;
  const ratio = dims.length / dims.width;
  // 面高固定，面宽随长宽比；构件过长时横向滚动而不压扁标记
  const faceWidth = Math.max(containerWidth - 4, FACE_MIN_HEIGHT * ratio);
  const faceHeight = faceWidth / ratio;
  const thresholdMm = mergeThreshold(dims);

  const activeMarkers = member.markers.filter((m) => !m.archived);
  const archivedMarkers = member.markers.filter((m) => m.archived);

  useEffect(() => {
    if (!dragId.current) return;
    const handleMove = (e: PointerEvent) => {
      const face = faceRef.current;
      const id = dragId.current;
      if (!face || !id) return;
      movedRef.current = true;
      // 越界标记也允许拖出 [0,100]，所以这里不 clamp：
      // 直接按像素换算，保持物理意义，越界继续被标为待校正。
      const rect = face.getBoundingClientRect();
      const pct = {
        xPct: Math.round(((e.clientX - rect.left) / rect.width) * 10000) / 100,
        yPct: Math.round(((e.clientY - rect.top) / rect.height) * 10000) / 100,
      };
      onMove(id, pct);
    };
    const handleUp = () => {
      dragId.current = null;
      window.setTimeout(() => (movedRef.current = false), 0);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [onMove]);

  const handleFaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (movedRef.current) return;
    onAdd(eventToPct(e, e.currentTarget.getBoundingClientRect()));
  };

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    dragId.current = id;
    movedRef.current = false;
    onSelect(id);
  };

  return (
    <div className="map-wrap">
      <div className="map-meta">
        <span>
          示意面 {dims.length}mm（长）× {dims.width}mm（宽）
        </span>
        <span>合并阈值 &lt; 长度 2% = {thresholdMm.toFixed(0)}mm</span>
        <span className="hint">点击构件面布点 · 标记可拖拽校正</span>
      </div>

      <div className="map-scroll" ref={scrollRef}>
        <div className="map-stage" style={{ width: faceWidth }}>
          <div className="ruler ruler-x">
            {TICKS.map((t) => (
              <span key={t} style={{ left: `${t}%` }}>
                {((dims.length * t) / 100).toFixed(0)}
              </span>
            ))}
          </div>
          <div
            ref={faceRef}
            className="map-face"
            style={{ width: faceWidth, height: faceHeight }}
            onClick={handleFaceClick}
          >
            {/* 留档幽灵层：旧尺寸下的原始位置，只读 */}
            {archivedMarkers.map((m) => {
              const p = ghostPct(m, dims);
              if (p.xPct < -5 || p.xPct > 105 || p.yPct < -5 || p.yPct > 105)
                return null;
              return (
                <span
                  key={`ghost-${m.id}`}
                  className="marker marker-ghost"
                  title={`留档原标记（${m.dimsAtCreation?.length}×${m.dimsAtCreation?.width}mm 基准）`}
                  style={{
                    left: `${clampPct(p.xPct)}%`,
                    top: `${clampPct(p.yPct)}%`,
                  }}
                >
                  ◇
                </span>
              );
            })}

            {/* 现行标记 */}
            {activeMarkers.map((m, index) => {
              const invalid = isInvalidMarker(m);
              const oob = isOutOfBounds(m);
              const cls = [
                "marker",
                `sev-${m.severity || "none"}`,
                invalid ? "invalid" : "",
                selectedMarkerId === m.id ? "selected" : "",
                oob ? "out-bounds" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const mm = pctToMm(m, dims);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={cls}
                  style={{
                    left: `${clampPct(m.xPct)}%`,
                    top: `${clampPct(m.yPct)}%`,
                  }}
                  title={`#${index + 1} ${m.kind} · ${
                    m.severity || "缺等级"
                  }\n${describePosition(m, dims)}${
                    invalid ? `\n待校正：${invalidReason(m)}` : ""
                  }`}
                  onPointerDown={(e) => startDrag(e, m.id)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHoverId(m.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  {index + 1}
                </button>
              );
            })}

            <div className="face-axis axis-length">长 {dims.length}mm</div>
            <div className="face-axis axis-width">宽 {dims.width}mm</div>
          </div>
        </div>
      </div>

      {hoverId && (
        <MarkerHover member={member} markerId={hoverId} />
      )}

      <div className="map-legend">
        <span><i className="dot sev-轻微" />轻微</span>
        <span><i className="dot sev-中等" />中等</span>
        <span><i className="dot sev-严重" />严重</span>
        <span><i className="dot sev-none" />缺等级待校正</span>
        <span><i className="dot ghost" />截面改动前留档</span>
      </div>

      {archivedMarkers.length > 0 && (
        <p className="archive-note">
          当前面叠加显示 {archivedMarkers.length} 处只读留档标记（灰色菱形），
          按旧截面物理位置换算，不可编辑，不计入修缮建议。
        </p>
      )}
    </div>
  );
}

function MarkerHover({ member, markerId }: { member: Member; markerId: string }) {
  const m = member.markers.find((x) => x.id === markerId);
  if (!m) return null;
  const invalid = isInvalidMarker(m);
  return (
    <div className={`marker-hover${invalid ? " is-invalid" : ""}`}>
      <b>{m.kind}</b> · {m.severity || "缺等级"} ·{" "}
      {describePosition(m, member.dims)}
      {invalid && <em>（待校正：{invalidReason(m)}）</em>}
    </div>
  );
}
