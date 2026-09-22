import { useSurvey } from "./business/useSurvey";
import { MemberList } from "./components/MemberList";
import { MemberDetail } from "./components/MemberDetail";
import { SizeTable } from "./components/SizeTable";
import { RelationView } from "./components/RelationView";
import "./styles.css";

function App() {
  const survey = useSurvey();
  const { state, metrics, toasts, dismissToast, resetDemo, selectedMember } = survey;

  return (
    <main className="app">
      <section className="hero compact">
        <div>
          <p>hxyfront-62013 · 源提示词8 · Port 62013</p>
          <h1>木结构榫卯构件测绘</h1>
          <span>
            点击构件示意面按长宽百分比记录病害位置；同构件间距小于构件长度 2% 自动合并；
            截面改动按物理尺寸换算并留档；越界或缺等级的标记只能待校正，不能带入修缮建议。
          </span>
        </div>
        <button className="reset-btn" onClick={resetDemo}>恢复演示数据</button>
      </section>

      <section className="metrics">
        <article>
          <small>构件数量</small>
          <strong>{metrics.memberCount}</strong>
        </article>
        <article>
          <small>有效病害点</small>
          <strong>{metrics.markerCount - metrics.invalidCount}</strong>
        </article>
        <article>
          <small>待校正标记</small>
          <strong className={metrics.invalidCount ? "num-warn" : ""}>
            {metrics.invalidCount}
          </strong>
        </article>
        <article>
          <small>榫卯类型 / 待修缮构件</small>
          <strong>
            {metrics.tenonKinds}
            <em className="metric-sub"> / {metrics.repairPending}</em>
          </strong>
        </article>
      </section>

      <section className="workspace">
        <MemberList survey={survey} />
        {selectedMember ? (
          <MemberDetail key={selectedMember.id} survey={survey} />
        ) : (
          <section className="panel detail-panel">
            <p className="empty">请选择构件。</p>
          </section>
        )}
      </section>

      <SizeTable survey={survey} />
      <div className="gap" />
      <RelationView survey={survey} />

      <p className="persist-note">
        全部测绘数据保存在本机浏览器（localStorage，数据结构 v1），
        窗口缩放、刷新或重新打开后，标记百分比位置、清单统计与构件关系保持一致。
      </p>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.tone}`}
            onClick={() => dismissToast(t.id)}
          >
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
