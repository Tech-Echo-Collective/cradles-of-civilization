import "./styles.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AtlasMap from "./AtlasMap.jsx";
import Icon from "./Icon.jsx";
import {
  civilizations,
  demoProvider,
  formatYear,
  MIN_YEAR,
  MAX_YEAR,
  INITIAL_YEAR,
} from "./data/demo.js";

const navItems = [
  ["atlas", "atlas", "World atlas"],
  ["civilizations", "temple", "Civilizations"],
  ["chronicle", "scroll", "Chronicle"],
  ["trade", "route", "Trade routes"],
  ["collections", "bookmark", "My collection"],
];
const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const imageUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

function Artwork({ civilization, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [civilization.id]);
  return (
    <div className={`artwork ${className}`} style={{ "--civ-color": civilization.color }}>
      {!failed && (
        <img
          key={civilization.id}
          src={imageUrl(civilization.image)}
          alt={`Original concept illustration of ${civilization.name}`}
          loading="lazy"
          decoding="async"
          width="768"
          height="384"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <span className="art-fallback">
          <Icon name="temple" size={64} />
          {civilization.name}
        </span>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <span className="eyebrow">CUNABULA · THE ARCHIVE</span>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

function StatBar({ label, value, color }) {
  return (
    <div className="stat-bar">
      <div>
        <span>{label}</span>
        <b>
          {value}
          <small> / 100</small>
        </b>
      </div>
      <div className="bar-track">
        <span style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

export default function App({ provider = demoProvider }) {
  const [year, setYear] = useState(INITIAL_YEAR);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState("egypt");
  const [activeNav, setActiveNav] = useState("atlas");
  const [tab, setTab] = useState("overview");
  const [layer, setLayer] = useState("civilizations");
  const [showLabels, setShowLabels] = useState(true);
  const [showRoutes, setShowRoutes] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [focusPosition, setFocusPosition] = useState(null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(() => {
    try {
      const ids = JSON.parse(localStorage.getItem("cunabula.ui.collection.v1") || "[]");
      return Array.isArray(ids) ? ids.filter((id) => civilizations.some((c) => c.id === id)) : [];
    } catch {
      return [];
    }
  });
  const snapshot = useMemo(() => provider.getSnapshot(year), [provider, year]);
  const selected =
    snapshot.civilizations.find((c) => c.id === selectedId) || snapshot.civilizations[0];
  const currentEvents = snapshot.events;
  const mapStats = useRef({});
  const onStats = useCallback((stats) => {
    mapStats.current = stats;
  }, []);
  const totalPopulation = snapshot.civilizations.reduce((sum, c) => sum + c.population, 0);
  const drawerOpen = ["civilizations", "chronicle", "collections"].includes(activeNav);
  const featuredEvents = useMemo(() => {
    const own = currentEvents.find((e) => e.civilizationId === selectedId);
    return [...(own ? [own] : []), ...currentEvents.filter((e) => e.id !== own?.id)].slice(0, 2);
  }, [currentEvents, selectedId]);

  useEffect(() => {
    if (!playing || modal) return;
    const timer = setInterval(() => setYear((prev) => Math.min(MAX_YEAR, prev + 25)), 1400 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, modal]);
  useEffect(() => {
    if (year >= MAX_YEAR) setPlaying(false);
  }, [year]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.code !== "Space" ||
        e.repeat ||
        modal ||
        e.target.closest('button,input,select,textarea,a,[role="tab"],canvas')
      )
        return;
      e.preventDefault();
      setPlaying((value) => !value);
      if (year >= MAX_YEAR) setYear(MIN_YEAR);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [year, modal]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  const selectCivilization = (id, focus = false) => {
    setFocusPosition(null);
    setSelectedId(id);
    setTab("overview");
    if (focus) {
      setFocusToken((v) => v + 1);
      setActiveNav("atlas");
    }
  };
  const navigate = (id) => {
    setActiveNav(id);
    setQuery("");
    if (id === "trade") {
      setLayer("trade");
    }
    if (id === "atlas" && layer === "trade") setLayer("civilizations");
  };
  const jumpYear = (value) => {
    setPlaying(false);
    setYear(Math.max(MIN_YEAR, Math.min(MAX_YEAR, value)));
  };
  const toggleSaved = () => {
    const isSaved = saved.includes(selectedId);
    const next = isSaved ? saved.filter((id) => id !== selectedId) : [...saved, selectedId];
    setSaved(next);
    try {
      localStorage.setItem("cunabula.ui.collection.v1", JSON.stringify(next));
      setNotice(isSaved ? "Removed from your collection" : "Added to your collection");
    } catch {
      setNotice("Collection updated for this session");
    }
  };
  const openEvent = (event) => {
    setPlaying(false);
    setModal({ type: "event", event });
  };
  const play = () => {
    if (year >= MAX_YEAR) setYear(MIN_YEAR);
    setPlaying((v) => !v);
  };
  const selectedTimeline = selected.timeline.filter((e) => e.year <= year);

  return (
    <div className="shell">
      <header className="topbar">
        <a
          className="brand"
          href="#atlas"
          onClick={(e) => {
            e.preventDefault();
            navigate("atlas");
          }}
          aria-label="Cunabula Civilitatis — return to atlas"
        >
          <span className="brand-seal">
            <Icon name="temple" size={29} />
          </span>
          <span>
            <strong>CUNABULA</strong>
            <span className="brand-subtitle">CIVILITATIS</span>
          </span>
        </a>
        <div className="world-status" aria-label="World status">
          <button onClick={() => setModal({ type: "status", metric: "civilizations" })}>
            <Icon name="temple" />
            <span>
              <small>CIVILIZATIONS</small>
              <b>
                04 <em>emerging worlds</em>
              </b>
            </span>
          </button>
          <button onClick={() => setModal({ type: "status", metric: "population" })}>
            <Icon name="people" />
            <span>
              <small>WORLD POPULATION</small>
              <b>
                {number.format(totalPopulation)} <em className="growth">↗</em>
              </b>
            </span>
          </button>
          <button onClick={() => setModal({ type: "status", metric: "era" })}>
            <Icon name="sun" />
            <span>
              <small>CURRENT ERA</small>
              <b>The Bronze Age</b>
            </span>
          </button>
        </div>
        <div className="header-end">
          <span className="preview-badge">
            <i /> ATLAS PREVIEW
          </span>
          <button
            className="icon-button"
            aria-label="Atlas settings"
            onClick={() => setModal({ type: "settings" })}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <div className="workspace" id="atlas">
        <aside className="sidebar">
          <p className="eyebrow section-label">EXPLORE THE PAST</p>
          <nav aria-label="Main navigation">
            {navItems.map(([id, icon, label]) => (
              <button
                key={id}
                className={`nav-item ${activeNav === id ? "active" : ""}`}
                aria-label={label}
                title={label}
                aria-current={activeNav === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon name={icon} size={19} />
                <span>{label}</span>
                {id === "collections" && saved.length > 0 && <small>{saved.length}</small>}
              </button>
            ))}
          </nav>
          <div className="sidebar-rule">
            <span>◆</span>
          </div>
          <p className="eyebrow section-label">THE FIRST CIVILIZATIONS</p>
          <div className="civ-list">
            {snapshot.civilizations.map((c, index) => (
              <button
                key={c.id}
                className={`civ-item ${selectedId === c.id ? "selected" : ""}`}
                aria-label={`Select ${c.shortName || c.name}`}
                title={c.name}
                aria-pressed={selectedId === c.id}
                onClick={() => selectCivilization(c.id, true)}
              >
                <span className="civ-dot" style={{ backgroundColor: c.color }} />
                <span>
                  {c.shortName || c.name}
                  <small>
                    {
                      ["Nile Valley", "Land between rivers", "Indus Valley", "Yellow River Basin"][
                        index
                      ]
                    }
                  </small>
                </span>
                <span className="civ-chevron">›</span>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <span className="tiny-ornament">✧</span>
            <p>
              From the rivers,
              <br />
              <i>the world began.</i>
            </p>
            <button className="about-link" onClick={() => setModal({ type: "about" })}>
              TECH ECHO <span>↗</span>
            </button>
            <small>文明摇篮 · UI shell 0.1</small>
          </div>
        </aside>

        <main className="map-stage" aria-label="Interactive historical atlas">
          <AtlasMap
            civilizations={snapshot.civilizations}
            selectedId={selectedId}
            onSelect={(id) => selectCivilization(id)}
            year={year}
            layer={layer}
            showLabels={showLabels}
            showRoutes={showRoutes}
            focusId={selectedId}
            focusToken={focusToken}
            focusPosition={focusPosition}
            onStats={onStats}
          />
          <div className="map-topline">
            <div className="map-heading">
              <p className="eyebrow">AN ATLAS OF HUMAN BEGINNINGS</p>
              <h1>The ancient world</h1>
              <span>
                {formatYear(year)} <i /> Four rivers. A thousand beginnings.
              </span>
            </div>
            <button
              className={`map-options ${showLabels ? "enabled" : ""}`}
              aria-label="Toggle map labels"
              aria-pressed={showLabels}
              onClick={() => setShowLabels((v) => !v)}
            >
              <Icon name="eye" size={18} />
            </button>
          </div>
          <div className="map-layer-switch" aria-label="Map layers">
            {[
              ["civilizations", "temple", "Civilizations"],
              ["terrain", "mountain", "Terrain"],
              ["trade", "route", "Trade"],
            ].map(([id, icon, label]) => (
              <button
                key={id}
                className={layer === id ? "active" : ""}
                aria-pressed={layer === id}
                onClick={() => {
                  setLayer(id);
                  if (id !== "trade" && activeNav === "trade") setActiveNav("atlas");
                }}
              >
                <Icon name={icon} size={15} />
                {label}
              </button>
            ))}
          </div>
          {activeNav === "trade" && (
            <div className="trade-note">
              <Icon name="route" />
              <div>
                <b>Across rivers & deserts</b>
                <p>
                  Illustrative routes connect the four cradles. Select a civilization to explore its
                  exchanges.
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close trade note"
                onClick={() => navigate("atlas")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {drawerOpen && (
            <section
              className="atlas-drawer"
              aria-label={navItems.find((n) => n[0] === activeNav)?.[2]}
            >
              <div className="drawer-heading">
                <h2>
                  {activeNav === "chronicle"
                    ? "The world unfolds"
                    : activeNav === "collections"
                      ? "Your collection"
                      : "Four beginnings"}
                </h2>
                <button
                  className="icon-button"
                  aria-label="Close atlas panel"
                  onClick={() => navigate("atlas")}
                >
                  <Icon name="close" />
                </button>
              </div>
              {activeNav !== "chronicle" && (
                <label className="search-field">
                  <Icon name="search" size={16} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a civilization…"
                    aria-label="Find a civilization"
                  />
                </label>
              )}
              <div className="drawer-list">
                {activeNav === "chronicle" ? (
                  <>
                    <p className="muted">Recorded by {formatYear(year)} · demo chronology</p>
                    {currentEvents.map((event) => (
                      <button
                        className="chronicle-row"
                        key={event.id}
                        onClick={() => openEvent(event)}
                      >
                        <small>{formatYear(event.year)}</small>
                        <strong>{event.title}</strong>
                        <span>
                          {civilizations.find((c) => c.id === event.civilizationId)?.name}{" "}
                          <Icon name="arrow" size={15} />
                        </span>
                      </button>
                    ))}
                    {!currentEvents.length && (
                      <p className="empty-note">
                        The first page is still unwritten. Advance the timeline to discover events.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {snapshot.civilizations
                      .filter(
                        (c) =>
                          (activeNav !== "collections" || saved.includes(c.id)) &&
                          `${c.name} ${c.river}`.toLowerCase().includes(query.toLowerCase()),
                      )
                      .map((c) => (
                        <button
                          className="drawer-civ"
                          key={c.id}
                          onClick={() => selectCivilization(c.id, true)}
                        >
                          <span className="drawer-seal" style={{ color: c.color }}>
                            <Icon name="temple" size={28} />
                          </span>
                          <span>
                            <strong>{c.name}</strong>
                            <small>
                              {c.river} · {number.format(c.population)}
                            </small>
                          </span>
                          <Icon name="arrow" size={16} />
                        </button>
                      ))}
                    {activeNav === "collections" && !saved.length && (
                      <p className="empty-note">
                        Keep a civilization close.
                        <br />
                        Use the bookmark in its profile to add it here.
                      </p>
                    )}
                    {query &&
                      !snapshot.civilizations.some(
                        (c) =>
                          (activeNav !== "collections" || saved.includes(c.id)) &&
                          `${c.name} ${c.river}`.toLowerCase().includes(query.toLowerCase()),
                      ) && <p className="empty-note">No civilizations match “{query}”.</p>}
                  </>
                )}
              </div>
            </section>
          )}
          <div className="map-caption">
            <span className="caption-line" />
            {layer === "trade"
              ? "EXCHANGE ROUTES"
              : layer === "terrain"
                ? "PHYSICAL GEOGRAPHY"
                : "CIVILIZATIONS & SETTLEMENTS"}
            <span className="map-demo">ILLUSTRATIVE ATLAS</span>
          </div>
          <section className="event-shelf" aria-label="Recent events">
            <div className="event-shelf-heading">
              <span className="eyebrow">ECHOES THROUGH TIME</span>
              <button onClick={() => navigate("chronicle")}>
                View chronicle <Icon name="arrow" size={14} />
              </button>
            </div>
            <div className="event-cards">
              {featuredEvents.map((event) => (
                <button className="event-card" key={event.id} onClick={() => openEvent(event)}>
                  <span className="event-symbol">
                    <Icon
                      name={
                        event.category === "Trade"
                          ? "route"
                          : event.category === "Discovery"
                            ? "sun"
                            : "scroll"
                      }
                      size={24}
                    />
                  </span>
                  <span className="event-copy">
                    <small>
                      {formatYear(event.year)}
                      <i />
                      {event.category}
                    </small>
                    <strong>{event.title}</strong>
                    <span>{event.summary}</span>
                  </span>
                  <Icon name="external" size={16} />
                </button>
              ))}
              {!featuredEvents.length && (
                <div className="event-empty">
                  <Icon name="scroll" /> A new chapter awaits. Move forward through time.
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="detail-panel" aria-label="Civilization details">
          <div className="detail-heading">
            <span className="eyebrow">CIVILIZATION RECORD</span>
            <button
              className={`icon-button bookmark-button ${saved.includes(selectedId) ? "saved" : ""}`}
              aria-label={
                saved.includes(selectedId)
                  ? "Remove civilization from collection"
                  : "Save civilization to collection"
              }
              aria-pressed={saved.includes(selectedId)}
              onClick={toggleSaved}
            >
              <Icon name="bookmark" size={18} />
            </button>
          </div>
          <div className="detail-hero">
            <Artwork civilization={selected} />
            <div className="hero-shade" />
            <span className="civilization-tag">
              <i style={{ background: selected.color }} />
              {selected.period}
            </span>
            <div className="hero-title">
              <span className="eyebrow">{selected.subtitle}</span>
              <h2>{selected.name}</h2>
            </div>
          </div>
          <div className="detail-tabs" role="tablist" aria-label="Civilization information">
            {["overview", "culture", "chronicle"].map((id) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    const list = ["overview", "culture", "chronicle"];
                    const next = list[(list.indexOf(id) + (e.key === "ArrowRight" ? 1 : 2)) % 3];
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                {id}
              </button>
            ))}
          </div>
          <div
            className="detail-content"
            id={`panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
          >
            {tab === "overview" && (
              <>
                <p className="civilization-description">{selected.description}</p>
                <div className="detail-facts">
                  <div>
                    <small>CAPITAL</small>
                    <strong>
                      <Icon name="crown" size={15} />
                      {selected.capital}
                    </strong>
                  </div>
                  <div>
                    <small>POPULATION</small>
                    <strong>
                      <Icon name="people" size={15} />
                      {number.format(selected.population)}
                    </strong>
                  </div>
                  <div>
                    <small>LIFELINE</small>
                    <strong>{selected.river}</strong>
                  </div>
                  <div>
                    <small>GOVERNANCE</small>
                    <strong>{selected.government}</strong>
                  </div>
                </div>
                <div className="ornament-rule">
                  <span>◆</span>
                </div>
                <p className="eyebrow inner-label">THE PULSE OF A CIVILIZATION</p>
                <StatBar label="Prosperity" value={selected.prosperity} color="#b49a64" />
                <StatBar label="Cultural influence" value={selected.influence} color="#a98460" />
                <StatBar label="Stability" value={selected.stability} color="#819782" />
                <div className="legacy-note">
                  <Icon name="sun" size={22} />
                  <span>
                    <small>A LASTING LEGACY</small>
                    <strong>{selected.achievements[0]?.title}</strong>
                  </span>
                </div>
              </>
            )}
            {tab === "culture" && (
              <>
                <p className="eyebrow inner-label">IDEAS THAT OUTLIVED EMPIRES</p>
                <div className="culture-fact">
                  <Icon name="scroll" />
                  <div>
                    <small>Writing system</small>
                    <strong>{selected.writing}</strong>
                  </div>
                </div>
                <div className="culture-fact">
                  <Icon name="sun" />
                  <div>
                    <small>Belief & ritual</small>
                    <strong>{selected.religion}</strong>
                  </div>
                </div>
                {selected.achievements.map((a) => (
                  <article className="achievement" key={a.title}>
                    <h3>{a.title}</h3>
                    <p>{a.description}</p>
                  </article>
                ))}
              </>
            )}
            {tab === "chronicle" && (
              <>
                <p className="eyebrow inner-label">A LIFE THROUGH TIME</p>
                {selectedTimeline.map((event) => (
                  <article className="detail-timeline" key={`${event.year}-${event.title}`}>
                    <small>{formatYear(event.year)}</small>
                    <h3>{event.title}</h3>
                    <p>{event.description}</p>
                  </article>
                ))}
                {!selectedTimeline.length && (
                  <p className="empty-note">
                    This civilization’s story is waiting to unfold. Advance the timeline.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="detail-footer">
            <button className="gold-button" onClick={() => setModal({ type: "dossier" })}>
              Explore {selected.shortName || selected.name}
              <Icon name="external" size={17} />
            </button>
            <button
              className="locate-button"
              onClick={() => {
                setFocusPosition(null);
                setFocusToken((v) => v + 1);
                setActiveNav("atlas");
              }}
            >
              <Icon name="pin" size={14} />
              Locate on map
            </button>
          </div>
        </aside>
      </div>

      <footer className="timeline-bar">
        <div className="timeline-date">
          <span className="eyebrow">THE PASSAGE OF TIME</span>
          <strong>
            {Math.abs(year).toLocaleString("en")}
            <small>{year < 0 ? "BCE" : "CE"}</small>
          </strong>
        </div>
        <div className="playback-controls">
          <button
            className="icon-button"
            aria-label="Step back 100 years"
            disabled={year <= MIN_YEAR}
            onClick={() => jumpYear(year - 100)}
          >
            <Icon name="back" size={17} />
          </button>
          <button
            className={`play-button ${playing ? "playing" : ""}`}
            onClick={play}
            aria-label={playing ? "Pause timeline" : "Play timeline"}
          >
            <Icon name={playing ? "pause" : "play"} size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Step forward 100 years"
            disabled={year >= MAX_YEAR}
            onClick={() => jumpYear(year + 100)}
          >
            <Icon name="next" size={17} />
          </button>
        </div>
        <div className="timeline-track">
          <div className="era-labels">
            <span>EARLY BRONZE AGE</span>
            <span>A WORLD TAKES SHAPE</span>
          </div>
          <div className="range-wrap">
            <input
              type="range"
              min={MIN_YEAR}
              max={MAX_YEAR}
              step="25"
              value={year}
              onChange={(e) => jumpYear(Number(e.target.value))}
              aria-label="Historical year"
              aria-valuetext={formatYear(year)}
              style={{ "--progress": `${((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%` }}
            />
          </div>
          <div className="timeline-ticks">
            {[-3500, -3000, -2500, -2000, -1500].map((v) => (
              <button key={v} className={year === v ? "current" : ""} onClick={() => jumpYear(v)}>
                {Math.abs(v).toLocaleString("en")} <span>BCE</span>
              </button>
            ))}
          </div>
        </div>
        <div className="timeline-end">
          <div className="speed-control" aria-label="Playback speed">
            {[1, 2, 4].map((v) => (
              <button
                className={speed === v ? "active" : ""}
                aria-pressed={speed === v}
                key={v}
                onClick={() => setSpeed(v)}
              >
                {v}×
              </button>
            ))}
          </div>
          <span>
            <i className={playing ? "live" : ""} />
            {playing ? "TIME IS FLOWING" : "TIME IS PAUSED"}
          </span>
        </div>
      </footer>
      <div className={`toast ${notice ? "visible" : ""}`} role="status">
        {notice && (
          <>
            <Icon name="check" size={16} />
            {notice}
          </>
        )}
      </div>

      {modal && (
        <Modal
          title={
            modal.type === "event"
              ? modal.event.title
              : modal.type === "settings"
                ? "Your view of the world"
                : modal.type === "dossier"
                  ? selected.name
                  : modal.type === "status"
                    ? "A world in its infancy"
                    : "Every civilization begins somewhere."
          }
          onClose={() => setModal(null)}
          wide={modal.type === "dossier"}
        >
          {modal.type === "event" && (
            <>
              <div className="modal-kicker">
                {formatYear(modal.event.year)} ·{" "}
                {civilizations.find((c) => c.id === modal.event.civilizationId)?.name} ·{" "}
                {modal.event.category}
              </div>
              <p>{modal.event.description}</p>
              <div className="event-impact">
                <Icon name="sun" />
                <span>{modal.event.effect}</span>
              </div>
              <p className="demo-disclosure">
                Illustrative event from the demo dataset; no historical simulation is running.
              </p>
              <button
                className="gold-button"
                onClick={() => {
                  selectCivilization(modal.event.civilizationId, true);
                  jumpYear(modal.event.year);
                  setModal(null);
                }}
              >
                View this moment in the atlas
                <Icon name="arrow" size={17} />
              </button>
            </>
          )}
          {modal.type === "dossier" && (
            <>
              <Artwork civilization={selected} className="dossier-art" />
              <p>{selected.description}</p>
              <div className="dossier-grid">
                <div>
                  <p className="eyebrow">CITIES ALONG THE RIVER</p>
                  {selected.cities.map((city) => (
                    <button
                      key={city.id}
                      className="city-row"
                      onClick={() => {
                        setFocusPosition(city.position);
                        setFocusToken((v) => v + 1);
                        setActiveNav("atlas");
                        setModal(null);
                      }}
                    >
                      <Icon name="pin" size={16} />
                      {city.name}
                      <Icon name="arrow" size={15} />
                    </button>
                  ))}
                </div>
                <div>
                  <p className="eyebrow">CULTURAL LEGACY</p>
                  {selected.achievements.map((a) => (
                    <article className="achievement" key={a.title}>
                      <h3>{a.title}</h3>
                      <p>{a.description}</p>
                    </article>
                  ))}
                </div>
              </div>
              <p className="demo-disclosure">
                Concept art and illustrative data. This record is a UI prototype, not an
                archaeological reference.
              </p>
            </>
          )}
          {modal.type === "settings" && (
            <>
              <p>Keep the atlas as quiet or as detailed as you like.</p>
              <label className="setting-row">
                <span>
                  <b>Place names</b>
                  <small>Show region and settlement labels</small>
                </span>
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
              </label>
              <label className="setting-row">
                <span>
                  <b>Trade routes overlay</b>
                  <small>Display illustrative exchanges on any layer</small>
                </span>
                <input
                  type="checkbox"
                  checked={showRoutes}
                  onChange={(e) => setShowRoutes(e.target.checked)}
                />
              </label>
              <div className="keyboard-help">
                <p>
                  <kbd>Drag</kbd> Move across the map
                </p>
                <p>
                  <kbd>Scroll</kbd> Zoom at the pointer
                </p>
                <p>
                  <kbd>↑ ↓ ← →</kbd> Pan a focused map
                </p>
                <p>
                  <kbd>+ / −</kbd> Zoom a focused map
                </p>
                <p>
                  <kbd>Space</kbd> Play / pause outside controls
                </p>
              </div>
              <p className="demo-disclosure">
                Maps render only when their view changes. Playback pauses when this tab is hidden.
              </p>
            </>
          )}
          {modal.type === "status" && (
            <>
              <p className="modal-kicker">{formatYear(year)} · THE BRONZE AGE</p>
              <p>
                Four river civilizations form this atlas. Select one to follow its places, ideas and
                unfolding story.
              </p>
              <div className="world-summary">
                {snapshot.civilizations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      selectCivilization(c.id, true);
                      setModal(null);
                    }}
                  >
                    <span>
                      <i style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <b>{number.format(c.population)}</b>
                  </button>
                ))}
              </div>
              <p className="demo-disclosure">
                All population counts, scores, territories and time changes are synthetic
                demonstration data. All four civilizations remain visible throughout the preview
                interval.
              </p>
            </>
          )}
          {modal.type === "about" && (
            <>
              <p className="modal-kicker">文明摇篮 / CUNABULA CIVILITATIS</p>
              <p>
                An atlas of beginnings, made by Tech Echo. Follow the rivers, discover early cities,
                and explore the ideas that shaped a shared human story.
              </p>
              <p>
                这是独立的桌面端交互原型。人口、疆域、事件与年代变化均为演示数据，尚未连接原游戏引擎或真实历史数据库。
              </p>
              <p className="demo-disclosure">
                Original interface and generated concept art. Geographic coastlines adapted from
                public-domain Natural Earth data. No Crusader Kings assets are used.
              </p>
              <button className="gold-button" onClick={() => setModal(null)}>
                Return to the atlas
                <Icon name="arrow" size={17} />
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
