import { useEffect, useRef, useState } from "react";
import {
  BuildingComponent,
  Marker,
  PercentPoint,
  dimsOf,
  markerIssues,
  pointToPercent,
} from "../business/markerTransform";

interface MarkerMapProps {
  component: BuildingComponent;
  markers: Marker[];
  selectedMarkerId: string | null;
  correctingMarkerId: string | null;
  onSurfaceClick: (point: ReturnType<typeof pointToPercent>) => void;
  onSelectMarker: (markerId: string) => void;
  onCancelCorrect: () => void;
}

function clampPercent(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export default function MarkerMap({
  component,
  markers,
  selectedMarkerId,
  correctingMarkerId,
  onSurfaceClick,
  onSelectMarker,
  onCancelCorrect,
}: MarkerMapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<PercentPoint | null>(null);

  const dims = dimsOf(component);
  const correcting = correctingMarkerId
    ? markers.find((m) => m.id === correctingMarkerId) ?? null
    : null;

  useEffect(() => {
    if (!correcting) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancelCorrect();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [correcting, onCancelCorrect]);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    onSurfaceClick(pointToPercent(event.clientX, event.clientY, rect));
  }

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = pointToPercent(event.clientX, event.clientY, rect);
    setHover(pct);
  }

  return (
    <div className="marker-map">
      <div className="map-toolbar">
        <span>
          {component.building} · {component.code} 构件示意面
        </span>
        <span className="map-readout">
          {correcting
            ? `校正模式：点击示意面重新定位「${correcting.note || "待校正标记"}」，Esc 取消`
            : hover
              ? `指针位置：长 ${(hover.xPct * 100).toFixed(1)}% · 宽 ${(hover.yPct * 100).toFixed(1)}%`
              : "点击示意面按长宽百分比记录病害位置"}
        </span>
      </div>

      <div className={"surface-scroll" + (correcting ? " correcting" : "")}>
        <div
          className="surface"
          ref={surfaceRef}
          style={{ aspectRatio: `${component.lengthMm} / ${component.widthMm}` }}
          onClick={handleClick}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          role="button"
          tabIndex={0}
          title={correcting ? "点击以校正标记位置" : "点击落标"}
        >
          <div className="ruler ruler-x">
            {[0, 0.25, 0.5, 0.75, 1].map((r) => (
              <span key={r} style={{ left: `${r * 100}%` }}>
                {Math.round(r * component.lengthMm)}
              </span>
            ))}
          </div>
          <div className="ruler ruler-y">
            {[0, 0.5, 1].map((r) => (
              <span key={r} style={{ top: `${r * 100}%` }}>
                {Math.round(r * component.widthMm)}
              </span>
            ))}
          </div>
          <div className="grid-lines" aria-hidden>
            {[0.25, 0.5, 0.75].map((r) => (
              <i key={`v${r}`} className="grid-v" style={{ left: `${r * 100}%` }} />
            ))}
            {[0.5].map((r) => (
              <i key={`h${r}`} className="grid-h" style={{ top: `${r * 100}%` }} />
            ))}
          </div>

          {hover && !correcting && (
            <i
              className="crosshair"
              style={{ left: `${clampPercent(hover.xPct) * 100}%`, top: `${clampPercent(hover.yPct) * 100}%` }}
            />
          )}

          {markers.map((marker, index) => {
            const issues = markerIssues(marker, dims);
            const out = issues.includes("越界");
            const missingGrade = issues.includes("缺等级");
            const pending = issues.length > 0;
            return (
              <button
                key={marker.id}
                type="button"
                className={[
                  "marker",
                  marker.grade ? `grade-${marker.grade}` : "grade-none",
                  pending ? "is-pending" : "",
                  out ? "is-out" : "",
                  selectedMarkerId === marker.id ? "is-selected" : "",
                  correctingMarkerId === marker.id ? "is-correcting" : "",
                ].join(" ")}
                style={{
                  left: `${clampPercent(marker.xPct) * 100}%`,
                  top: `${clampPercent(marker.yPct) * 100}%`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectMarker(marker.id);
                }}
                title={[
                  `标记${String(index + 1).padStart(2, "0")}`,
                  `长 ${(marker.xPct * 100).toFixed(1)}% (${marker.xMm.toFixed(0)}mm)`,
                  `宽 ${(marker.yPct * 100).toFixed(1)}% (${marker.yMm.toFixed(0)}mm)`,
                  marker.defectType ?? "未分类病害",
                  marker.grade ?? "缺等级",
                  pending ? `待校正：${issues.join("、")}` : "有效",
                ].join(" · ")}
              >
                <b>{index + 1}</b>
                {pending && <em>{missingGrade && !out ? "缺等级" : "待校正"}</em>}
                {marker.mergedFrom.length > 0 && <i className="merged-dot" aria-label="已合并" />}
              </button>
            );
          })}

          <span className="dims-note">
            示意面 {component.lengthMm}mm（长）× {component.widthMm}mm（截面宽）
            ；截面高 {component.heightMm}mm 仅作记录
          </span>
        </div>
      </div>

      <div className="map-legend">
        <span><i className="dot grade-轻微" />轻微</span>
        <span><i className="dot grade-中等" />中等</span>
        <span><i className="dot grade-严重" />严重</span>
        <span><i className="dot is-pending" />待校正（越界/缺等级）</span>
        <span><i className="dot merged" />含合并记录</span>
      </div>
    </div>
  );
}
