import { useEffect, useId, useRef, useState } from "react";
import QuotedCopy from "./QuotedCopy.jsx";
import "./ending.css";

const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const metrics = [
  ["sc", "科学", "SC"],
  ["be", "神学", "BE"],
  ["la", "记忆", "LA"],
  ["pop", "人口", "POP"],
  ["eco", "经济", "ECO"],
  ["stability", "秩序", "ORDER"],
  ["eerf", "永恒设施", "EERF"],
];
const tabs = [
  ["summary", "终局纪要"],
  ["civilizations", "文明档案"],
  ["world", "领土军情"],
];
const list = (value) => (Array.isArray(value) ? value : []);
const value = (number) =>
  number !== null && number !== undefined && Number.isFinite(Number(number))
    ? integer.format(Number(number))
    : "—";
const ownerNames = {
  player: "本国",
  neutral: "中立",
  rival: "敌国",
  ruins: "废墟",
  hostile: "敌对",
  defense: "防御",
  attack: "进攻",
  march: "行军",
};

function Pagination({ page, count, pageSize, onChange, label }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="ending-pagination" aria-label={label}>
      <button
        type="button"
        aria-label={`${label}上一页`}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        ← 上一页
      </button>
      <span aria-live="polite">
        {page + 1} <i>/</i> {pages}
      </span>
      <button
        type="button"
        aria-label={`${label}下一页`}
        disabled={page + 1 >= pages}
        onClick={() => onChange(page + 1)}
      >
        下一页 →
      </button>
    </nav>
  );
}

function MetricTable({ ending }) {
  const current = ending.snapshot || {},
    peak = ending.peakSnapshot || {};
  return (
    <section className="ending-panel ending-metrics" aria-labelledby="ending-metrics-title">
      <div className="ending-section-heading">
        <div>
          <span className="ending-eyebrow">THE FINAL ACCOUNT</span>
          <h2 id="ending-metrics-title">文明留下的刻度</h2>
        </div>
        <span className="ending-small-note">终值 / 全程峰值</span>
      </div>
      <table className="ending-table">
        <thead>
          <tr>
            <th scope="col">指标</th>
            <th scope="col">终局数值</th>
            <th scope="col">全程峰值</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(([key, name, code]) => {
            const percentage =
              Number(peak[key]) > 0 && Number.isFinite(Number(current[key]))
                ? Math.min(100, Math.max(0, (Number(current[key]) / Number(peak[key])) * 100))
                : 0;
            return (
              <tr key={key}>
                <th scope="row">
                  <span>{name}</span>
                  <small>{code}</small>
                </th>
                <td>
                  <b>{value(current[key])}</b>
                  <span className="ending-value-track" aria-hidden="true">
                    <span style={{ width: `${percentage}%` }} />
                  </span>
                </td>
                <td>{value(peak[key])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Summary({ ending }) {
  const map = ending.mapArchive,
    military = ending.military;
  const repeats = ending.endingStats?.endings?.[ending.id];
  return (
    <div className="ending-summary-grid">
      <MetricTable ending={ending} />
      <div className="ending-summary-aside">
        <section className="ending-panel ending-sealed-record">
          <span className="ending-eyebrow">SEALED IN THE ARCHIVE</span>
          <h2>封存记录</h2>
          <dl className="ending-record-facts">
            <div>
              <dt>国家</dt>
              <dd>{ending.realmName || "—"}</dd>
            </div>
            <div>
              <dt>执政官</dt>
              <dd>{ending.governorLabel || "—"}</dd>
            </div>
            <div>
              <dt>终局年份</dt>
              <dd>第 {value(ending.turn)} 年</dd>
            </div>
            <div>
              <dt>终局文明</dt>
              <dd>第 {value(ending.civilization)} 号</dd>
            </div>
            <div>
              <dt>世界种子</dt>
              <dd className="ending-seed">{ending.seed ?? "—"}</dd>
            </div>
          </dl>
          {ending.trigger && (
            <div className="ending-trigger">
              <span className="ending-eyebrow">THE FINAL TURN · 终局触发</span>
              <p>{ending.trigger}</p>
            </div>
          )}
          {Number.isFinite(Number(repeats)) && (
            <p className="ending-completion-note">
              这是此结局第 <b>{value(repeats)}</b> 次被记录。
            </p>
          )}
        </section>
        <section className="ending-panel ending-world-summary">
          <span className="ending-eyebrow">AT THE CLOSE OF AN ERA</span>
          <h2>终局时的世界</h2>
          {map ? (
            <>
              <p className="ending-map-status">{map.status || "领土记录已封存"}</p>
              <div className="ending-owner-counts">
                {[
                  ["player", "本国"],
                  ["neutral", "中立"],
                  ["rival", "敌国"],
                  ["ruins", "废墟"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <b>{value(map.counts ? (map.counts[key] ?? 0) : undefined)}</b>
                    <span>{label}省份</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="ending-empty">此终局没有保存领土数据。</p>
          )}
          {military && (
            <dl className="ending-military-totals">
              <div>
                <dt>本国军力</dt>
                <dd>{value(military.force)}</dd>
              </div>
              <div>
                <dt>进攻</dt>
                <dd>{value(military.attack)}</dd>
              </div>
              <div>
                <dt>防守</dt>
                <dd>{value(military.defense)}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}

function CivilizationArchive({ ending }) {
  const [page, setPage] = useState(0),
    [expanded, setExpanded] = useState(null),
    [samplePage, setSamplePage] = useState(0);
  const archive = list(ending.metricArchive),
    pageSize = 12,
    samplePageSize = 16;
  const id = useId();
  function changePage(next) {
    setPage(next);
    setExpanded(null);
    setSamplePage(0);
  }
  function toggle(index) {
    setExpanded(expanded === index ? null : index);
    setSamplePage(0);
  }
  return (
    <section
      className="ending-panel ending-civilizations"
      aria-labelledby="ending-civilizations-title"
    >
      <div className="ending-section-heading">
        <div>
          <span className="ending-eyebrow">THE LIVES BEFORE THIS MOMENT</span>
          <h2 id="ending-civilizations-title">历代文明档案</h2>
        </div>
        <span className="ending-small-note">
          已保存 {value(archive.length)} 代 · 每页至多 12 代
        </span>
      </div>
      <p className="ending-section-description">
        展开一代文明，查看它留下的逐年观测。记录来自此终局保存的档案。
      </p>
      {!archive.length && <p className="ending-empty">此终局没有保存历代观测。</p>}
      <div className="ending-archive-list">
        {archive.slice(page * pageSize, (page + 1) * pageSize).map((record, localIndex) => {
          const index = page * pageSize + localIndex,
            open = expanded === index,
            samples = list(record.samples),
            last = samples.at(-1);
          const cause =
            record.collapseCause ||
            record.ending ||
            (record.civilization === ending.civilization ? "终局文明" : "已封存");
          return (
            <article
              className={`ending-civilization ${open ? "is-open" : ""}`}
              key={`${record.civilization}-${index}`}
            >
              <button
                className="ending-civilization-toggle"
                type="button"
                aria-expanded={open}
                aria-controls={`${id}-record-${index}`}
                onClick={() => toggle(index)}
              >
                <span className="ending-civilization-number" aria-hidden="true">
                  {String(record.civilization ?? index + 1).padStart(2, "0")}
                </span>
                <span className="ending-civilization-name">
                  <strong>第 {value(record.civilization)} 号文明</strong>
                  <span>{cause}</span>
                </span>
                <span className="ending-civilization-lifespan">
                  <b>{value(record.turns)}</b>
                  <small>存续年数</small>
                </span>
                <span className="ending-civilization-samples">
                  <b>{value(samples.length)}</b>
                  <small>观测记录</small>
                </span>
                <span className="ending-expand-symbol" aria-hidden="true">
                  {open ? "−" : "+"}
                </span>
              </button>
              {open && (
                <div className="ending-civilization-detail" id={`${id}-record-${index}`}>
                  {samples.length ? (
                    <>
                      <div className="ending-archive-summary">
                        <span>末次观测 · 第 {value(last?.turn)} 年</span>
                        <span>
                          科学 {value(last?.sc)} <i>·</i> 神学 {value(last?.be)} <i>·</i> 人口{" "}
                          {value(last?.pop)}
                        </span>
                      </div>
                      <div
                        className="ending-table-scroll"
                        tabIndex={0}
                        role="region"
                        aria-label={`第${record.civilization}号文明观测数据`}
                      >
                        <table className="ending-table ending-sample-table">
                          <caption className="ending-sr-only">
                            第 {record.civilization} 号文明的全部已保存观测，分页显示
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">年份</th>
                              {metrics.map(([key, name]) => (
                                <th key={key} scope="col">
                                  {name}
                                </th>
                              ))}
                              <th scope="col">记录</th>
                            </tr>
                          </thead>
                          <tbody>
                            {samples
                              .slice(samplePage * samplePageSize, (samplePage + 1) * samplePageSize)
                              .map((sample, sampleIndex) => (
                                <tr key={`${sample.turn}-${sampleIndex}`}>
                                  <th scope="row">{value(sample.turn)}</th>
                                  {metrics.map(([key]) => (
                                    <td key={key}>{value(sample[key])}</td>
                                  ))}
                                  <td>{sample.collapse || sample.label || "—"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        page={samplePage}
                        count={samples.length}
                        pageSize={samplePageSize}
                        onChange={setSamplePage}
                        label="观测记录分页"
                      />
                    </>
                  ) : (
                    <p className="ending-empty">这一代没有保存逐年观测。</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <Pagination
        page={page}
        count={archive.length}
        pageSize={pageSize}
        onChange={changePage}
        label="文明档案分页"
      />
    </section>
  );
}

function ArchiveTable({ rows, columns, label, empty = "没有保存记录。", pageSize = 16 }) {
  const [page, setPage] = useState(0);
  if (!rows.length) return <p className="ending-empty">{empty}</p>;
  return (
    <>
      <div className="ending-table-scroll" tabIndex={0} role="region" aria-label={label}>
        <table className="ending-table ending-ledger-table">
          <caption className="ending-sr-only">
            {label}，共 {rows.length} 条
          </caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.label}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => (
              <tr key={row.id || index}>
                {columns.map((column, columnIndex) =>
                  columnIndex === 0 ? (
                    <th scope="row" key={column.label}>
                      {column.render(row)}
                    </th>
                  ) : (
                    <td key={column.label}>{column.render(row)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        count={rows.length}
        pageSize={pageSize}
        onChange={setPage}
        label={`${label}分页`}
      />
    </>
  );
}

function WorldArchive({ ending }) {
  const map = ending.mapArchive,
    entities = list(map?.entities),
    regions = list(map?.regions),
    armies = list(map?.armies);
  const entityNames = new Map(entities.map((entity) => [entity.id, entity.name]));
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  return (
    <div className="ending-world-ledger">
      <section className="ending-panel">
        <div className="ending-section-heading">
          <div>
            <span className="ending-eyebrow">REALMS AT THE FINAL HOUR</span>
            <h2>国家档案</h2>
          </div>
          <span className="ending-small-note">{map?.status || "终局领土快照"}</span>
        </div>
        <ArchiveTable
          rows={entities}
          label="国家档案"
          empty="此终局没有保存国家数据。"
          columns={[
            { label: "国家", render: (row) => row.name || row.id },
            {
              label: "关系",
              render: (row) =>
                row.eliminated
                  ? "已灭亡"
                  : ownerNames[row.relation] || row.relation || ownerNames[row.owner] || "—",
            },
            { label: "领土", render: (row) => value(row.territories) },
            { label: "军力", render: (row) => value(row.force) },
            { label: "发展", render: (row) => value(row.development) },
            { label: "技术", render: (row) => value(row.technology) },
          ]}
        />
      </section>
      <section className="ending-panel">
        <div className="ending-section-heading">
          <div>
            <span className="ending-eyebrow">THE ARMIES THAT REMAINED</span>
            <h2>军团名册</h2>
          </div>
          <span className="ending-small-note">{value(armies.length)} 支记录</span>
        </div>
        <ArchiveTable
          rows={armies}
          label="军团名册"
          empty="此终局没有保存军团。"
          columns={[
            { label: "军团", render: (row) => row.name || row.id },
            {
              label: "所属国家",
              render: (row) => entityNames.get(row.entityId) || row.entityId || "—",
            },
            {
              label: "驻地",
              render: (row) => regionNames.get(row.regionId) || row.regionId || "—",
            },
            { label: "兵力", render: (row) => value(row.force) },
            { label: "姿态", render: (row) => ownerNames[row.posture] || row.posture || "—" },
          ]}
        />
      </section>
      <section className="ending-panel">
        <div className="ending-section-heading">
          <div>
            <span className="ending-eyebrow">THE TERRITORY REGISTER</span>
            <h2>省份簿册</h2>
          </div>
          <span className="ending-small-note">{value(regions.length)} 块领土</span>
        </div>
        <ArchiveTable
          rows={regions}
          label="省份簿册"
          empty="此终局没有保存省份。"
          columns={[
            { label: "省份", render: (row) => row.name || row.id },
            {
              label: "控制者",
              render: (row) =>
                row.controllerName || entityNames.get(row.controllerId) || row.controllerId || "—",
            },
            { label: "归属", render: (row) => ownerNames[row.owner] || row.owner || "—" },
            { label: "工事", render: (row) => value(row.fortification) },
          ]}
        />
      </section>
      {map?.lastEvent && (
        <section className="ending-panel ending-last-dispatch">
          <span className="ending-eyebrow">THE LAST DISPATCH</span>
          <h2>{map.lastEvent.title || "最后的军情"}</h2>
          <QuotedCopy text={map.lastEvent.text || ""} />
        </section>
      )}
    </div>
  );
}

/** A completed run's read-only archive. All state-changing actions are host callbacks. */
export default function EndingPage({ ending, endingCopy, onBack, onNewWorld, onExport }) {
  const pageRef = useRef(null),
    [tab, setTab] = useState("summary"),
    tabId = useId();
  useEffect(() => {
    setTab("summary");
    pageRef.current?.focus({ preventScroll: true });
  }, [ending?.id, ending?.createdAt]);
  if (!ending?.id)
    return (
      <main className="ending-page ending-unavailable" aria-label="结局档案">
        <h1>尚未形成结局档案</h1>
        <button className="ending-button" onClick={onBack}>
          返回世界记录
        </button>
      </main>
    );
  const copy = endingCopy || {};
  const fullName = copy.name || ending.name || `${ending.id} 结局`;
  const chineseTitle = fullName.split("/")[0];
  const englishTitle = copy.nameEn || fullName.split("/").slice(1).join("/");
  const paragraphs = list(copy.paragraphs);
  const endingIndex = /^[A-Z]$/.test(ending.id)
    ? String(ending.id.charCodeAt(0) - 64).padStart(2, "0")
    : ending.id;
  const date = new Date(ending.createdAt);
  const recordedDate = Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Shanghai",
      }).format(date);
  function moveTab(event, index) {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") target = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[target][0]);
    document.getElementById(`${tabId}-${tabs[target][0]}`)?.focus();
  }
  return (
    <main
      ref={pageRef}
      className="ending-page"
      aria-label="结局档案"
      tabIndex={-1}
      data-ending={ending.id}
    >
      <header className="ending-topbar">
        <button type="button" className="ending-back" aria-label="返回世界记录" onClick={onBack}>
          <span aria-hidden="true">←</span> 返回世界记录
        </button>
        <div className="ending-archive-brand">
          <strong>CUNABULA CIVILITATIS</strong>
          <span>THE CIVILIZATION ARCHIVE</span>
        </div>
        <span className="ending-topbar-status">
          <i /> RECORD SEALED
        </span>
      </header>
      <article className="ending-hero" aria-labelledby="ending-page-title">
        <div className="ending-sky" aria-hidden="true">
          <span className="ending-orbit" />
          <i className="ending-sun ending-sun-one" />
          <i className="ending-sun ending-sun-two" />
          <i className="ending-sun ending-sun-three" />
          <span className="ending-horizon" />
        </div>
        <div className="ending-hero-inner">
          <div className="ending-hero-heading">
            <span className="ending-eyebrow">AN ERA COMES TO ITS CLOSE</span>
            <div className="ending-title-row">
              <div className="ending-seal" aria-hidden="true">
                <span>{ending.id}</span>
                <small>FINIS</small>
              </div>
              <div>
                <p className="ending-number">
                  ENDING {endingIndex} <i /> 第 {value(ending.civilization)} 号文明
                </p>
                <h1 id="ending-page-title">{chineseTitle}</h1>
                {englishTitle && (
                  <p className="ending-english-title" lang="en">
                    {englishTitle}
                  </p>
                )}
              </div>
            </div>
            <p className="ending-world-line">
              {ending.realmName || "—"}
              <span />第 {value(ending.turn)} 年
            </p>
          </div>
          <div className="ending-story">
            {paragraphs.length ? (
              paragraphs.map((paragraph, index) => <QuotedCopy key={index} text={paragraph} />)
            ) : (
              <p className="ending-empty">此档案没有附带结局正文。</p>
            )}
          </div>
          {copy.quote && <QuotedCopy text={copy.quote} quoteOnly className="ending-quote" />}
        </div>
      </article>
      <div className="ending-content">
        <div className="ending-action-rail">
          <p>
            <span className="ending-eyebrow">YOUR WORLD, PRESERVED</span>
            这一页保存了文明抵达终局时的记录。
          </p>
          <div>
            <button
              type="button"
              className="ending-button ending-export"
              aria-label="导出终局存档"
              onClick={onExport}
            >
              <span aria-hidden="true">↓</span> 导出终局存档
            </button>
            <button
              type="button"
              className="ending-button ending-new-world"
              aria-label="开启新的世界"
              onClick={onNewWorld}
            >
              开启新的世界 <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
        <div className="ending-tabs" role="tablist" aria-label="结局档案内容">
          {tabs.map(([key, name], index) => (
            <button
              type="button"
              key={key}
              role="tab"
              id={`${tabId}-${key}`}
              aria-controls={`${tabId}-panel-${key}`}
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(event) => moveTab(event, index)}
            >
              <span className="ending-tab-index" aria-hidden="true">
                0{index + 1}
              </span>
              {name}
            </button>
          ))}
        </div>
        <section
          className="ending-tab-panel"
          role="tabpanel"
          id={`${tabId}-panel-${tab}`}
          aria-labelledby={`${tabId}-${tab}`}
          tabIndex={0}
        >
          {tab === "summary" ? (
            <Summary ending={ending} />
          ) : tab === "civilizations" ? (
            <CivilizationArchive key={`${ending.id}-${ending.createdAt}`} ending={ending} />
          ) : (
            <WorldArchive ending={ending} />
          )}
        </section>
        <footer className="ending-footer">
          <span className="ending-footer-mark" aria-hidden="true">
            ✧
          </span>
          <div>
            <strong>TECH ECHO</strong>
            <span>CUNABULA CIVILITATIS · 结局档案 {ending.id}</span>
          </div>
          {recordedDate && <time dateTime={ending.createdAt}>封存于 {recordedDate}</time>}
        </footer>
      </div>
    </main>
  );
}
