import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import GameMap from "./GameMap.jsx";
import QuotedCopy from "./QuotedCopy.jsx";
import Icon from "./Icon.jsx";
import "./game.css";

const EndingPage = lazy(() => import("./EndingPage.jsx"));

const nav = [
  ["overview", "atlas", "国度"],
  ["development", "leaf", "发展"],
  ["governance", "crown", "治理"],
  ["military", "route", "军务"],
  ["facilities", "temple", "设施"],
  ["records", "scroll", "记录"],
];
const groups = {
  development: ["science", "belief", "population", "balance", "arts", "economy"],
  governance: ["order", "suppressBelief", "suppressScience", "hibernate", "crownAuthority"],
  military: ["militaryCampaign", "levyHost", "secureFrontier", "trainLegion", "fieldWorks"],
  facilities: ["buildEerf", "upgradeEerf", "recovery", "restartCivilization", "settleEnding"],
};
const metricNames = {
  sc: "科学",
  be: "神学",
  pop: "人口",
  eco: "经济",
  la: "记忆",
  stability: "秩序",
  eerf: "EERF",
};
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const format = (v) => integer.format(Number(v) || 0);
const terrainNames = {
  tundra: "冻原",
  coast: "海岸",
  mountain: "山地",
  basin: "盆地",
  urban: "城邦",
  salt: "盐碱地",
  river: "河谷",
  plain: "平原",
  waste: "荒原",
  canyon: "峡谷",
};
const portraits = {
  "east-asian-man": `${import.meta.env.BASE_URL}art/governor-east-asian-man.webp`,
  "white-woman": `${import.meta.env.BASE_URL}art/governor-white-woman.webp`,
  "black-man": `${import.meta.env.BASE_URL}art/governor-black-man.webp`,
  listener: `${import.meta.env.BASE_URL}art/governor-trisolaran-listener.webp`,
};

function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`game-dialog ${wide ? "game-dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (onClose) onClose();
        else e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === ref.current && onClose) onClose();
      }}
    >
      <div className="game-dialog-heading">
        <span className="game-kicker">CUNABULA · CIVILITATIS</span>
        {onClose && (
          <button aria-label="关闭对话框" onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}

function Delta({ delta = {}, prefix = "" }) {
  return (
    <div className="game-deltas">
      {Object.entries(delta)
        .filter(([key, value]) => key in metricNames && typeof value === "number" && value !== 0)
        .map(([key, value]) => (
          <span key={key} className={value < 0 ? "negative" : "positive"}>
            {prefix}
            {metricNames[key]} {value > 0 ? "+" : ""}
            {format(value)}
          </span>
        ))}
    </div>
  );
}

function Setup({ view, engine, existing, onClose, onImport, run }) {
  const [form, setForm] = useState({
    realmName: existing ? "" : view.realmName || "",
    seed: !existing && view.initialSeed != null ? String(view.initialSeed) : "",
    difficulty: view.difficulty || "normal",
    aiAggression: view.aiAggression || "standard",
    governorId: view.governorId || "east-asian-man",
    mapUiExpanded: view.mapUiExpanded !== false,
  });
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const governor = view.configs.governors.find((item) => item.id === form.governorId);
  const [error, setError] = useState("");
  function submit(e) {
    e.preventDefault();
    if (!form.realmName.trim()) {
      setError("为你的国度起一个名字。");
      return;
    }
    const result = run(() =>
      engine.createGame({ ...form, seed: form.seed.trim() ? Number(form.seed) : undefined }),
    );
    if (result?.ok === false) setError(result.reason);
    else onClose?.(true);
  }
  return (
    <Modal
      title={existing ? "开启新的世界" : "文明从这里开始"}
      onClose={existing ? onClose : undefined}
      wide
    >
      <p className="game-dialog-intro">
        三颗太阳下，一片尚未命名的大陆。选择执政官与世界规则，然后在地图上选定文明的发源地。
      </p>
      <form className="game-setup" onSubmit={submit}>
        <div className="game-setup-fields">
          <label>
            国度名称
            <input
              aria-label="国度名称"
              value={form.realmName}
              maxLength={24}
              onChange={(e) => set("realmName", e.target.value)}
              placeholder="为文明命名"
              autoFocus
              required
            />
          </label>
          <label>
            世界种子 <small>留空随机生成</small>
            <div className="game-seed-field">
              <input
                aria-label="世界种子"
                value={form.seed}
                inputMode="numeric"
                type="number"
                min="1"
                max="4294967295"
                onChange={(e) => set("seed", e.target.value)}
                placeholder="每一个世界都有自己的种子"
              />
              <button
                type="button"
                onClick={() =>
                  set("seed", String(crypto.getRandomValues(new Uint32Array(1))[0] || 1))
                }
              >
                随机
              </button>
            </div>
          </label>
          <div className="game-form-row">
            <label>
              难度
              <select
                aria-label="难度"
                value={form.difficulty}
                onChange={(e) => set("difficulty", e.target.value)}
              >
                {view.configs.difficulties.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              敌对势力
              <select
                aria-label="敌对势力"
                value={form.aiAggression}
                onChange={(e) => set("aiAggression", e.target.value)}
              >
                {view.configs.aggressions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            执政官
            <select
              aria-label="执政官"
              value={form.governorId}
              onChange={(e) => set("governorId", e.target.value)}
            >
              {view.configs.governors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="game-checkbox">
            <input
              type="checkbox"
              checked={form.mapUiExpanded}
              onChange={(e) => set("mapUiExpanded", e.target.checked)}
            />
            启用领土、战争与征服玩法
          </label>
          {error && (
            <p role="alert" className="negative">
              {error}
            </p>
          )}
          <button className="game-primary" type="submit">
            生成世界 <Icon name="arrow" size={18} />
          </button>
          {existing ? (
            <p className="game-form-note">新世界会替换当前进度。可先关闭此窗口，导出当前存档。</p>
          ) : (
            <button type="button" className="game-secondary" onClick={onImport}>
              读取已有存档
            </button>
          )}
        </div>
        <div className="game-governor-preview">
          <img
            src={portraits[form.governorId]}
            loading="lazy"
            decoding="async"
            width="260"
            height="310"
            alt={governor?.label || "执政官"}
          />
          <span className="game-kicker">GOVERNOR</span>
          <h3>{governor?.label}</h3>
          <p>{governor?.skill}</p>
          <p className="game-muted">{governor?.caption}</p>
        </div>
      </form>
    </Modal>
  );
}

function TrendChart({ samples, selectedIndex, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      const w = rect.width,
        h = rect.height;
      ctx.strokeStyle = "#444b40";
      ctx.lineWidth = 1;
      for (let y = 9; y < h; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (const [key, color] of [
        ["sc", "#a1b59c"],
        ["be", "#c8ac78"],
      ]) {
        const max = Math.max(500, ...samples.map((s) => s[key] || 0));
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        samples.forEach((s, index) => {
          const x = samples.length < 2 ? w / 2 : (index / (samples.length - 1)) * w;
          const y = h - 5 - ((s[key] || 0) / max) * (h - 12);
          if (index === 0 || s.civilization !== samples[index - 1].civilization) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      const x = samples.length < 2 ? w / 2 : (selectedIndex / (samples.length - 1)) * w;
      ctx.strokeStyle = "#e3d6ab";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [samples, selectedIndex]);
  return (
    <div className="game-observations">
      <canvas ref={ref} aria-label="最近80次科学与神学观测图" />
      <input
        aria-label="查看历史观测"
        type="range"
        min={0}
        max={Math.max(0, samples.length - 1)}
        value={selectedIndex}
        onChange={(e) => onSelect(Number(e.target.value))}
      />
    </div>
  );
}

function Records({ view, onClose, onClear, onEnding }) {
  const [tab, setTab] = useState("log");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const logs = view.log.filter((entry) => filter === "all" || entry.type === filter);
  return (
    <Modal title="文明的记录" onClose={onClose} wide>
      <div className="game-tabs">
        {[
          ["log", "编年史"],
          ["archive", "文明档案"],
          ["endings", "终局观测"],
        ].map(([id, label]) => (
          <button
            aria-pressed={tab === id}
            key={id}
            onClick={() => {
              setTab(id);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "log" && (
        <>
          <div className="game-record-filter">
            <label>
              事件筛选
              <select
                aria-label="事件筛选"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              >
                {[
                  ["all", "全部"],
                  ["progress", "发展"],
                  ["special", "特殊"],
                  ["disaster", "灾变"],
                  ["collapse", "毁灭"],
                ].map(([id, text]) => (
                  <option key={id} value={id}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <span>{logs.length} 条记录</span>
            <button
              disabled={view.finished || !view.log.length}
              onClick={() => {
                onClear();
                setPage(0);
              }}
            >
              清空当前编年
            </button>
          </div>
          <div className="game-records">
            {logs.slice(page * 20, (page + 1) * 20).map((entry, i) => (
              <article key={`${page}-${i}`} className={`game-record game-record-${entry.type}`}>
                <span className="game-kicker">{entry.type || "CHRONICLE"}</span>
                <h3>{entry.title}</h3>
                <QuotedCopy text={entry.text} />
                <Delta delta={entry.delta} />
              </article>
            ))}
            {!logs.length && <p>没有符合筛选的记录。</p>}
          </div>
          <div className="game-pagination">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(logs.length / 20))}
            </span>
            <button disabled={(page + 1) * 20 >= logs.length} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        </>
      )}
      {tab === "archive" && (
        <div className="game-records">
          {view.history.slice(page * 20, (page + 1) * 20).map((entry) => (
            <article className="game-record" key={entry.civilization}>
              <span className="game-kicker">CIVILIZATION {entry.civilization}</span>
              <h3>
                第 {entry.civilization} 号文明 · {entry.turns} 年
              </h3>
              <p>{entry.collapseCause || "未知终止"}</p>
              <p>
                峰值：科学 {format(entry.peakSc)} · 神学 {format(entry.peakBe)} · 人口{" "}
                {format(entry.peakPop)} · 经济 {format(entry.peakEco)}
              </p>
              <p>{entry.specialEvents?.join("、")}</p>
            </article>
          ))}
          {!view.history.length && <p>第一份档案会在文明毁灭时生成。</p>}
          {view.history.length > 20 && (
            <div className="game-pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <span>{page + 1}</span>
              <button
                disabled={(page + 1) * 20 >= view.history.length}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "endings" && (
        <div className="game-records">
          <p className="game-dialog-intro">{view.ending || "文明仍在演化。"}</p>
          {view.finalEnding && (
            <button className="game-primary" onClick={onEnding}>
              查看结局档案
            </button>
          )}
          {(view.endingWatch || []).map((item) => (
            <article key={item.id} className="game-record">
              <h3>
                {item.id} · {item.displayName || "???"}{" "}
                <small>{Math.round(item.progress * 100)}%</small>
              </h3>
              <progress max="1" value={item.progress} />
              <p>
                {item.missing?.length
                  ? `还差：${item.missing.join("；")}`
                  : "条件已满足，可在设施面板结算。"}
              </p>
            </article>
          ))}
          <p className="game-muted">
            已完成结局次数：
            {format(view.endingStats?.totalCompletions || view.endingStats?.total || 0)}
          </p>
        </div>
      )}
    </Modal>
  );
}

export default function App({ engine }) {
  const view = useSyncExternalStore(engine.subscribe, engine.getView, engine.getView);
  const [active, setActive] = useState("overview");
  const [layer, setLayer] = useState("political");
  const [showLabels, setShowLabels] = useState(true);
  const [selectedAction, setSelectedAction] = useState("science");
  const [focusToken, setFocusToken] = useState(0);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [observeIndex, setObserveIndex] = useState(null);
  const [endingDismissed, setEndingDismissed] = useState(false);
  const fileRef = useRef(null);
  const statsRef = useRef({});
  const onStats = useCallback((stats) => {
    statsRef.current = stats;
  }, []);
  const samples = view.metricSamples || [];
  const latestIndex = Math.max(0, samples.length - 1);
  const chosenIndex = observeIndex === null ? latestIndex : Math.min(observeIndex, latestIndex);
  const sample = samples[chosenIndex] || view;
  const historical = chosenIndex !== latestIndex;
  const selectedRegion =
    view.selectedRegion || view.regions.find((r) => r.id === view.selectedRegionId);
  const province = view.geometry.provinces.find((p) => p.id === view.selectedRegionId);
  const entity =
    view.entities.find((e) => e.id === (selectedRegion?.controllerId || view.selectedEntityId)) ||
    view.entities[0];
  const army = view.visibleArmies.find((a) => a.id === view.selectedArmyId);
  const governor = view.configs.governors.find((g) => g.id === view.governorId);
  const action = view.actions.find((item) => item.id === selectedAction) || view.actions[0];
  const actionIds = groups[active] || groups.development;
  const lastEvents = view.log.slice(0, 2);
  const isSettings = !view.setupComplete && view.setupStage === "settings" && !view.finished;
  const isFounding = !view.setupComplete && view.setupStage === "territory";
  const isFinal = Boolean(view.finalEnding);

  const run = useCallback((fn) => {
    try {
      const result = fn();
      if (result?.ok === false) setNotice(result.reason || "现在无法执行这项命令。");
      else setNotice("");
      return result;
    } catch (error) {
      setNotice(error.message);
      return { ok: false, reason: error.message };
    }
  }, []);
  const execute = useCallback(
    (id) => {
      if (historical) return;
      run(() => engine.executeAction(id));
    },
    [engine, historical, run],
  );
  useEffect(() => {
    if (!view.autoRunUntilCollapse || view.finished || view.awaitingCivilizationRestart) return;
    let id;
    const schedule = () => {
      clearInterval(id);
      if (!document.hidden) id = setInterval(() => engine.tickAutoRun(), 500);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [engine, view.autoRunUntilCollapse, view.finished, view.awaitingCivilizationRestart]);
  useEffect(() => {
    const listener = (e) => {
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat ||
        modal ||
        isSettings ||
        isFinal ||
        historical ||
        /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
      )
        return;
      if (e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModal("new");
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        run(() => engine.clearChronicle());
        return;
      }
      const match = view.actions.find(
        (item) =>
          String(item.shortcut || "").toLowerCase() ===
          `${e.shiftKey ? "shift+" : ""}${e.key.toLowerCase()}`,
      );
      if (match && !match.disabledReason) {
        e.preventDefault();
        execute(match.id);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [view.actions, engine, run, execute, modal, isSettings, isFinal, historical]);
  useEffect(() => {
    globalThis.__CUNABULA_GAME__ = {
      getSnapshot: engine.getView,
      getMapStats: () => statsRef.current,
    };
    return () => {
      delete globalThis.__CUNABULA_GAME__;
    };
  }, [engine]);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(id);
    }
  }, [notice]);

  function navigate(id) {
    if (id === "records") {
      setModal("records");
      return;
    }
    setActive(id);
    if (groups[id]) setSelectedAction(groups[id][0]);
  }
  function exportSave() {
    const saved = engine.exportSave();
    const serialized = typeof saved === "string" ? saved : JSON.stringify(saved, null, 2);
    const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `cunabula-${view.seed}-year-${view.turn}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("存档已导出。");
  }
  // Read outside the engine transaction; the adapter validates before committing.
  async function readSave(e) {
    const input = e.target,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("存档文件过大。");
      const text = await file.text();
      const result = run(() => engine.importSave(text));
      if (result?.ok !== false) {
        setModal(null);
        setEndingDismissed(false);
        setObserveIndex(null);
        setNotice("存档已载入。");
      }
    } catch (error) {
      setNotice(error.message);
    }
    input.value = "";
  }
  function selectProvince(id) {
    run(() => (isFounding ? engine.selectStartingRegion(id) : engine.selectProvince(id)));
  }
  function selectArmy(id) {
    run(() => engine.selectArmy(id));
    setActive("military");
  }
  const metrics = [
    ["sc", "SC", "leaf"],
    ["be", "BE", "temple"],
    ["pop", "POP", "people"],
    ["eco", "ECO", "crown"],
    ["la", "LA", "scroll"],
    ["stability", "秩序", "sun"],
  ];

  function openEnding() {
    setModal(null);
    setEndingDismissed(false);
  }
  const newWorldDialog = modal === "new" && (
    <Setup
      view={view}
      engine={engine}
      existing
      run={run}
      onClose={(created) => {
        setModal(null);
        if (created) {
          setEndingDismissed(false);
          setObserveIndex(null);
        }
      }}
    />
  );
  const toast = notice && (
    <div className="game-toast" role="status">
      {notice}
      <button aria-label="关闭提示" onClick={() => setNotice("")}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
  if (isFinal && !endingDismissed) {
    return (
      <>
        <Suspense
          fallback={
            <main className="game-ending-loading" aria-busy="true">
              正在翻开结局档案…
            </main>
          }
        >
          <EndingPage
            ending={view.finalEnding}
            endingCopy={globalThis.THREE_SUN_ENDINGS?.[view.finalEnding.id]}
            onBack={() => {
              setModal(null);
              setEndingDismissed(true);
            }}
            onNewWorld={() => setModal("new")}
            onExport={exportSave}
          />
        </Suspense>
        {newWorldDialog}
        {toast}
      </>
    );
  }
  return (
    <div
      className="game-shell"
      data-seed={view.seed}
      data-turn={view.turn}
      data-geometry-revision={view.geometry.revision}
    >
      <header className="game-topbar">
        <div className="game-brand">
          <div className="brand-seal">
            <Icon name="sun" size={26} />
          </div>
          <div>
            <strong>CUNABULA</strong>
            <span>C I V I L I T A T I S</span>
          </div>
        </div>
        <div className="game-status">
          {metrics.map(([key, code, icon]) => (
            <button
              key={key}
              onClick={() => setModal("metrics")}
              title={`${metricNames[key]} ${format(view[key])}`}
            >
              <Icon name={icon} size={18} />
              <div>
                <small>{code}</small>
                <b data-metric={key}>{compact.format(view[key] || 0)}</b>
              </div>
            </button>
          ))}
          <button onClick={() => navigate("facilities")}>
            <Icon name="temple" size={18} />
            <div>
              <small>EERF</small>
              <b>
                {view.eerfLevel || 0}
                <em>/5</em>
              </b>
            </div>
          </button>
        </div>
        <div className="game-top-actions">
          <span>
            TECH ECHO<span className="game-save-indicator">● 自动存档</span>
          </span>
          <button aria-label="世界与存档" title="世界与存档" onClick={() => setModal("world")}>
            <Icon name="settings" />
          </button>
        </div>
      </header>
      <div className="game-workspace">
        <nav className="game-nav" aria-label="文明事务">
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              aria-label={label}
              aria-pressed={active === id}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} size={22} />
              <span>{label}</span>
            </button>
          ))}
          <button
            className="game-nav-bottom"
            aria-label="玩法帮助"
            onClick={() => setModal("help")}
          >
            <Icon name="info" />
            <span>帮助</span>
          </button>
        </nav>
        <main className="game-stage">
          <div className="game-map-header">
            <div>
              <span className="game-kicker">THE THREE SUNS</span>
              <h1>
                {view.realmName || "尚未命名的世界"} <small>第 {view.count} 号文明</small>
              </h1>
            </div>
            <div className="game-layer-switch" aria-label="地图图层">
              {[
                ["political", "政治"],
                ["terrain", "地形"],
                ["military", "军事"],
              ].map(([id, label]) => (
                <button key={id} aria-pressed={layer === id} onClick={() => setLayer(id)}>
                  {label}
                </button>
              ))}
              <button
                aria-label="省份名称"
                aria-pressed={showLabels}
                onClick={() => setShowLabels(!showLabels)}
              >
                <Icon name="eye" size={17} />
              </button>
            </div>
          </div>
          <div className="game-map-stage">
            <GameMap
              geometry={view.geometry}
              regions={view.regions}
              entities={view.entities}
              armies={view.visibleArmies}
              selectedProvinceId={view.selectedRegionId}
              selectedArmyId={view.selectedArmyId}
              onSelectProvince={selectProvince}
              onSelectArmy={selectArmy}
              layer={layer}
              showLabels={showLabels}
              focusToken={focusToken}
              availableProvinceIds={view.availableProvinceIds}
              onStats={onStats}
            />
            <div className="game-world-caption">
              <span>SEED {view.seed}</span>
              <span>
                {view.geometry.provinces.length} 省份 · {view.entities.length} 势力
              </span>
            </div>
            {isFounding && (
              <div className="game-founding">
                <span className="game-kicker">FOUND YOUR CIVILIZATION</span>
                <h2>选择文明的发源地</h2>
                <p>在地图上点击一块省份，再确认建立文明。</p>
                <div>
                  <button onClick={() => run(() => engine.returnToSettings())}>返回设定</button>
                  <button
                    className="game-primary"
                    onClick={() => run(() => engine.completeSetup())}
                  >
                    在 {province?.nameZh || province?.name || view.selectedRegionId} 建立文明
                  </button>
                </div>
              </div>
            )}
            {view.mapUiExpanded === false && !isFounding && (
              <div className="game-map-mode">
                <Icon name="atlas" />
                <span>数值文明模式 · 战争与征服暂停</span>
                <button onClick={() => run(() => engine.setMapExpanded(true))}>启用领土玩法</button>
              </div>
            )}
          </div>
          <section className="game-events" aria-label="最近事件">
            <div className="game-events-heading">
              <span className="game-kicker">CHRONICLE · 最新编年</span>
              <button onClick={() => setModal("records")}>
                查看全部 <Icon name="arrow" size={14} />
              </button>
            </div>
            <div className="game-event-grid">
              {lastEvents.map((entry, i) => (
                <button
                  key={`${view.turn}-${i}`}
                  className={`game-event ${entry.type || "progress"}`}
                  onClick={() => setModal({ type: "event", entry })}
                >
                  <span className="game-event-seal">
                    <Icon
                      name={
                        entry.type === "disaster" || entry.type === "collapse" ? "sun" : "scroll"
                      }
                      size={24}
                    />
                  </span>
                  <div>
                    <h3>{entry.title}</h3>
                    <QuotedCopy text={entry.text} compact />
                    <Delta delta={entry.delta} />
                  </div>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
          </section>
        </main>
        <aside className="game-sidebar" aria-label="文明详情">
          <div className="game-realm-banner">
            <span className="game-kicker">CIVILIZATION {view.count}</span>
            <h2>{view.realmName || "文明摇篮"}</h2>
            <div className="game-realm-horizon">
              <span />
              <span />
              <span />
            </div>
            <p>{view.weather || "文明仍在演化"}</p>
          </div>
          <div className="game-detail-tabs">
            <button aria-pressed={active === "overview"} onClick={() => setActive("overview")}>
              国度详情
            </button>
            <button aria-pressed={active !== "overview"} onClick={() => navigate("development")}>
              文明决议
            </button>
          </div>
          <div className="game-sidebar-scroll">
            <label className="game-province-select">
              {isFounding ? "选择文明发源地" : "选择省份"}
              <select
                aria-label="选择省份"
                value={view.selectedRegionId || ""}
                onChange={(e) => selectProvince(e.target.value)}
              >
                {view.geometry.provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameZh || p.name}
                  </option>
                ))}
              </select>
            </label>
            {isFinal && (
              <section className="game-finished-notice">
                <span className="game-kicker">ENDING {view.finalEnding.id}</span>
                <h3>{view.finalEnding.name}</h3>
                <p>本次文明历程已结束，结局档案已保存。</p>
                <button className="game-primary" onClick={openEnding}>
                  打开结局档案
                </button>
              </section>
            )}
            {view.specialNotice && (
              <button
                className="game-special-notice"
                onClick={() => setModal({ type: "event", entry: view.specialNotice })}
              >
                <span className="game-kicker">SPECIAL · {view.specialNotice.spec || ""}</span>
                <h3>{view.specialNotice.title}</h3>
                <QuotedCopy text={view.specialNotice.text} compact />
              </button>
            )}
            {view.awaitingCivilizationRestart && (
              <div className="game-crisis">
                <h3>文明已毁灭，火种仍在</h3>
                <p>
                  下一代人口 {format(view.pendingRestart?.pop)} · SC{" "}
                  {format(view.pendingRestart?.sc)} · BE {format(view.pendingRestart?.be)}
                </p>
                <button
                  className="game-primary"
                  disabled={
                    historical ||
                    Boolean(
                      view.actions.find((a) => a.id === "restartCivilization")?.disabledReason,
                    )
                  }
                  onClick={() => execute("restartCivilization")}
                >
                  重启文明
                </button>
              </div>
            )}
            {view.economicCrisis && (
              <div className="game-crisis">
                <h3>经济危机</h3>
                <p>发展冻结。进入设施，使用炉边谈话恢复财政。</p>
                <button
                  onClick={() => {
                    navigate("facilities");
                    setSelectedAction("recovery");
                  }}
                >
                  前往设施
                </button>
              </div>
            )}
            {active === "overview" ? (
              <>
                <section className="game-detail-section">
                  <span className="game-kicker">PROVINCE · 选中省份</span>
                  <div className="game-section-title">
                    <h3>
                      {province?.nameZh || province?.name || selectedRegion?.name || "未选择"}
                    </h3>
                    <button aria-label="定位选中省份" onClick={() => setFocusToken((v) => v + 1)}>
                      <Icon name="pin" size={18} />
                    </button>
                  </div>
                  <p>
                    {terrainNames[province?.terrain] || province?.terrain} ·{" "}
                    {entity?.name || "文明废墟"}
                  </p>
                  <dl className="game-detail-stats">
                    <div>
                      <dt>防御工事</dt>
                      <dd>{format(selectedRegion?.fortification)}</dd>
                    </div>
                    <div>
                      <dt>补给</dt>
                      <dd>{format(selectedRegion?.supply ?? province?.base?.supply)}</dd>
                    </div>
                    <div>
                      <dt>发展</dt>
                      <dd>{format(selectedRegion?.development ?? province?.base?.development)}</dd>
                    </div>
                    <div>
                      <dt>相邻省份</dt>
                      <dd>
                        {
                          (
                            view.geometry.neighbors?.[view.selectedRegionId] ||
                            selectedRegion?.neighbors ||
                            []
                          ).length
                        }
                      </dd>
                    </div>
                  </dl>
                  <button className="game-secondary" onClick={() => navigate("military")}>
                    查看军队与部署 <Icon name="arrow" size={15} />
                  </button>
                </section>
                <section className="game-detail-section">
                  <span className="game-kicker">REALMS · 五方势力</span>
                  <div className="game-entities">
                    {view.entities.map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={view.selectedEntityId === item.id}
                        onClick={() => run(() => engine.selectEntity(item.id))}
                      >
                        <span style={{ background: item.color || "#aa9272" }} />
                        <strong>{item.name}</strong>
                        <small>
                          {item.eliminated
                            ? "灭亡"
                            : `${item.territories ?? view.regions.filter((r) => r.controllerId === item.id).length} 省`}
                        </small>
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const selected = view.entities.find(
                      (item) => item.id === view.selectedEntityId,
                    );
                    return (
                      selected && (
                        <div className="game-entity-detail">
                          <h3>{selected.name}</h3>
                          <p>
                            发展 {format(selected.development)} · 技术 {format(selected.technology)}{" "}
                            · 军力 {selected.force == null ? "未知" : format(selected.force)}
                          </p>
                          <label>
                            国家战略
                            <select
                              aria-label="国家战略"
                              value={selected.strategy || "balanced"}
                              disabled={
                                historical ||
                                view.mapUiExpanded === false ||
                                selected.id !== "player-realm" ||
                                !view.setupComplete ||
                                view.finished ||
                                view.awaitingCivilizationRestart ||
                                selected.eliminated
                              }
                              onChange={(e) => run(() => engine.setStrategy(e.target.value))}
                            >
                              {view.configs.strategies.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="game-muted">
                            {
                              view.configs.strategies.find((s) => s.id === selected.strategy)
                                ?.description
                            }
                          </p>
                        </div>
                      )
                    );
                  })()}
                </section>
                <section className="game-governor-card">
                  <img
                    src={portraits[view.governorId]}
                    loading="lazy"
                    decoding="async"
                    width="64"
                    height="74"
                    alt={governor?.label || "执政官"}
                  />
                  <div>
                    <span className="game-kicker">GOVERNOR</span>
                    <h3>{governor?.label}</h3>
                    <p>{governor?.skill}</p>
                  </div>
                </section>
              </>
            ) : (
              <>
                {active === "military" && (
                  <section className="game-detail-section">
                    <span className="game-kicker">LEGIONS · 可见军队</span>
                    <div className="game-armies">
                      {view.visibleArmies.map((item) => (
                        <button
                          key={item.id}
                          aria-pressed={item.id === view.selectedArmyId}
                          onClick={() => run(() => engine.selectArmy(item.id))}
                        >
                          <Icon name="crown" size={16} />
                          <strong>{item.name}</strong>
                          <span>{format(item.force)}</span>
                        </button>
                      ))}
                    </div>
                    {army ? (
                      <>
                        <p>
                          {army.name} · 驻{" "}
                          {view.geometry.provinces.find((p) => p.id === army.regionId)?.nameZh ||
                            army.regionId}
                        </p>
                        <p className="game-muted">
                          攻击 {format(army.attack ?? army.stats?.attack)} · 防御{" "}
                          {format(army.defense ?? army.stats?.defense)} · 军力 {format(army.force)}
                        </p>
                        <button
                          className="game-primary"
                          aria-label="部署选中军队"
                          disabled={
                            historical ||
                            Boolean(view.deploymentReason) ||
                            army.entityId !== "player-realm" ||
                            army.lastMovedTurn >= view.turn ||
                            !view.setupComplete ||
                            view.finished ||
                            view.awaitingCivilizationRestart ||
                            view.mapUiExpanded === false
                          }
                          onClick={() => run(() => engine.deployArmy(view.selectedRegionId))}
                        >
                          部署至 {province?.nameZh || view.selectedRegionId}
                        </button>
                        <p className="game-muted">
                          {view.deploymentReason ||
                            "沿相邻道路移动，己方领土防御，其他领土进攻。每支军队每年可部署一次。"}
                        </p>
                      </>
                    ) : (
                      <p>此处军情处于迷雾中。</p>
                    )}
                  </section>
                )}
                {active === "facilities" && (
                  <section className="game-detail-section">
                    <span className="game-kicker">THE EMBER · 抵抗设施</span>
                    <h3>EERF · {view.eerfLevel || 0} / 5</h3>
                    <dl className="game-eerf-details">
                      {(view.eerfDetails || []).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="game-eerf-levels">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <span key={level} className={level <= view.eerfLevel ? "active" : ""} />
                      ))}
                    </div>
                  </section>
                )}
                <section className="game-detail-section game-action-section">
                  <span className="game-kicker">
                    DECISIONS · {nav.find(([id]) => id === active)?.[2] || "发展"}
                  </span>
                  <div className="game-actions">
                    {view.actions
                      .filter((item) => actionIds.includes(item.id))
                      .map((item) => (
                        <button
                          key={item.id}
                          data-action={item.id}
                          aria-pressed={selectedAction === item.id}
                          onClick={() => setSelectedAction(item.id)}
                          title={item.disabledReason || item.label}
                        >
                          <div>
                            <strong>{item.label}</strong>
                            {item.shortcut && <kbd>{item.shortcut}</kbd>}
                          </div>
                          <small>{item.disabledReason || "可执行 · 推进一年"}</small>
                        </button>
                      ))}
                  </div>
                  {action && (
                    <div className="game-action-preview">
                      <h3>{action.label}</h3>
                      <p>{action.chronicleText}</p>
                      <QuotedCopy text={action.text} quoteOnly />
                      <Delta delta={action.delta} />
                      <p className="game-muted">
                        决议效果为行动本身；年度漂移、事件、灾变与战事另行结算。
                      </p>
                      <button
                        className="game-primary"
                        aria-label="执行决议"
                        data-execute-action={action.id}
                        disabled={historical || Boolean(action.disabledReason)}
                        onClick={() => execute(action.id)}
                      >
                        {action.id === "restartCivilization"
                          ? "重启文明"
                          : action.id === "settleEnding"
                            ? "结算终局"
                            : "执行决议 · 推进一年"}
                        <Icon name="arrow" size={16} />
                      </button>
                      {action.disabledReason && (
                        <p className="game-action-reason">{action.disabledReason}</p>
                      )}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="game-timeline">
        <div className="game-year">
          <span className="game-kicker">YEAR OF THE CIVILIZATION</span>
          <strong data-current-year={view.turn}>第 {format(view.turn)} 年</strong>
          <small>
            第 {view.count} 号文明 ·{" "}
            {view.autoRunUntilCollapse
              ? "文明分裂，时间自动推进"
              : view.finished
                ? "终局已达成"
                : "决议推动时间"}
          </small>
        </div>
        <div className="game-time-chart">
          <div className="game-chart-heading">
            <span>
              科学 <i className="science" /> 神学 <i className="faith" />
            </span>
            <span>
              {historical ? `观测第 ${sample.civilization} 号文明 · ${sample.turn} 年` : "当前观测"}
            </span>
            <button disabled={!historical} onClick={() => setObserveIndex(null)}>
              回到当前
            </button>
          </div>
          <TrendChart
            samples={samples}
            selectedIndex={chosenIndex}
            onSelect={(i) => setObserveIndex(i === latestIndex ? null : i)}
          />
        </div>
        <div className="game-time-action">
          {isFinal ? (
            <>
              <p>{view.finalEnding.name} · 终局已达成</p>
              <button className="game-primary" onClick={openEnding}>
                查看结局档案 <Icon name="arrow" size={16} />
              </button>
            </>
          ) : historical ? (
            <>
              <p>历史观测 · 决议暂停</p>
              <button className="game-secondary" onClick={() => setModal("observation")}>
                查看这次观测
              </button>
            </>
          ) : (
            <>
              <p>
                {view.endingCandidate
                  ? "已发现终局 · 可结算"
                  : view.awaitingCivilizationRestart
                    ? "火种等待重启"
                    : "文明仍在演化"}
              </p>
              <button
                className="game-primary"
                disabled={!view.setupComplete || view.finished}
                onClick={() =>
                  navigate(
                    view.endingCandidate || view.awaitingCivilizationRestart
                      ? "facilities"
                      : "development",
                  )
                }
              >
                {view.endingCandidate
                  ? "前往结算"
                  : view.awaitingCivilizationRestart
                    ? "查看火种"
                    : "下达年度决议"}
                <Icon name="arrow" size={16} />
              </button>
            </>
          )}
        </div>
      </footer>
      {toast}
      {isSettings && (
        <Setup view={view} engine={engine} run={run} onImport={() => fileRef.current.click()} />
      )}
      {newWorldDialog}
      {modal === "records" && (
        <Records
          view={view}
          onClose={() => setModal(null)}
          onClear={() => run(() => engine.clearChronicle())}
          onEnding={openEnding}
        />
      )}
      {modal === "world" && (
        <Modal title="世界与存档" onClose={() => setModal(null)}>
          <p className="game-dialog-intro">
            世界种子 <b>{view.seed}</b> · {view.realmName} · 第 {view.turn}{" "}
            年。读取存档会恢复原地图和随机序列。
          </p>
          <div className="game-world-buttons">
            {isFinal && (
              <button className="game-primary" onClick={openEnding}>
                查看结局档案
              </button>
            )}
            <button className="game-secondary" onClick={exportSave}>
              导出存档
            </button>
            <button className="game-secondary" onClick={() => fileRef.current.click()}>
              导入存档
            </button>
            <button className="game-primary" onClick={() => setModal("new")}>
              开启随机新世界 <Icon name="arrow" size={17} />
            </button>
          </div>
          <p className="game-form-note">
            当前进度自动保存在此浏览器。旧版游戏使用相同存档格式；不同网址或端口之间请使用导出与导入。
          </p>
          <label className="game-checkbox">
            <input
              type="checkbox"
              checked={view.mapUiExpanded !== false}
              disabled={!view.setupComplete || view.finished}
              onChange={(e) => run(() => engine.setMapExpanded(e.target.checked))}
            />
            启用领土、战争与征服玩法
          </label>
        </Modal>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="导入存档文件"
        onChange={readSave}
      />
      {(modal === "metrics" || modal === "observation") && (
        <Modal
          title={
            modal === "observation"
              ? `第 ${sample.civilization} 号文明 · 第 ${sample.turn} 年观测`
              : "文明指标"
          }
          onClose={() => setModal(null)}
        >
          <dl className="game-metric-dialog">
            {Object.entries(metricNames).map(([key, label]) => (
              <div key={key}>
                <dt>
                  {label} · {key.toUpperCase()}
                </dt>
                <dd>
                  {format(
                    modal === "observation"
                      ? sample[key]
                      : key === "eerf"
                        ? view.eerfLevel
                        : view[key],
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="game-form-note">历史观测只供查看。地图保持当前领土与军队状态。</p>
        </Modal>
      )}
      {modal?.type === "event" && (
        <Modal title={modal.entry.title} onClose={() => setModal(null)}>
          <QuotedCopy className="game-event-full" text={modal.entry.text} />
          <Delta delta={modal.entry.delta} />
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="统治三日世界" onClose={() => setModal(null)}>
          <div className="game-help">
            <p>每次年度决议推进一年，原规则同时结算经济、人口、科学、神学、随机事件与敌军行动。</p>
            <p>
              地图可拖动平移与滚轮缩放。点击省份查看详情，点击军旗选择军队；军务面板可以沿道路部署。没有侦察到的军队不会显示。
            </p>
            <p>
              设施中的 EERF
              保存灾后的火种。文明毁灭后，可以重启下一代；达到条件后，在设施中结算终局。
            </p>
            <p>
              底部时间轴查看最近 80
              次观测，只读历史不会改写游戏。所有行动都沿用旧游戏的成本、条件、冷却与快捷键。
            </p>
            <p>新建世界留空种子即可随机生成；重复种子可重现地图，年度结果还取决于你的决议。</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
