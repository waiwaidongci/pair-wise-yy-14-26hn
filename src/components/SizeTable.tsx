import type { SurveyController } from "../business/useSurvey";
import { markerStats } from "../business/useSurvey";

/**
 * 尺寸记录表：与标记图、关系图读取同一份持久化数据，
 * 任何截面改动 / 标记校正后，清单统计即时一致，刷新后保持。
 */
export function SizeTable({ survey }: Props) {
  const { state, visibleMembers, selectMember } = survey;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>{state.activeBuilding}</p>
          <h2>尺寸记录表</h2>
        </div>
        <span className="table-hint">点击行可跳转到该构件标记图</span>
      </div>
      <div className="table-scroll">
        <table className="size-table">
          <thead>
            <tr>
              <th>构件编号</th>
              <th>木材种类</th>
              <th>榫卯类型</th>
              <th>截面尺寸（长×宽×高 mm）</th>
              <th>病害（有效/待校正/留档）</th>
              <th>修缮建议</th>
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((m) => {
              const stats = markerStats(m.markers);
              const selected = state.selectedMemberId === m.id;
              return (
                <tr
                  key={m.id}
                  className={selected ? "row-on" : ""}
                  onClick={() => selectMember(m.id)}
                >
                  <td><b>{m.code}</b></td>
                  <td>{m.wood}</td>
                  <td>{m.tenon}</td>
                  <td>
                    {m.dims.length}×{m.dims.width}×{m.dims.height}
                  </td>
                  <td>
                    <span className="cell-ok">{stats.active - stats.invalid}</span>
                    {" / "}
                    <span className={stats.invalid ? "cell-warn" : ""}>
                      {stats.invalid}
                    </span>
                    {" / "}
                    <span className="cell-arch">{stats.archived}</span>
                  </td>
                  <td>
                    {stats.invalid > 0 ? (
                      <span className="cell-warn">待校正后生成</span>
                    ) : m.suggestion ? (
                      <span className="cell-ok">已生成</span>
                    ) : stats.active > 0 ? (
                      <span>待生成</span>
                    ) : (
                      <span className="cell-muted">无标记</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface Props {
  survey: SurveyController;
}
