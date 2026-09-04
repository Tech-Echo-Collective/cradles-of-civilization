"use strict";

(function runMapLab() {
  const DATA = window.CRADLES_MAP_LAB_DATA;
  const MODEL = window.CRADLES_MAP_LAB_MODEL;
  if (!DATA || !MODEL) throw new Error("Map Lab data or model failed to load.");

  const SVG_NS = "http://www.w3.org/2000/svg";
  const LANGUAGE_KEY = "three-sun-chronicle:language:v1";
  const MODES = new Set(["political", "terrain", "military"]);
  const params = new URLSearchParams(window.location.search);

  const dom = {
    body: document.body,
    mapStage: document.querySelector("#mapStage"),
    mapSvg: document.querySelector("#mapSvg"),
    landClipPath: document.querySelector("#landClipPath"),
    landShadow: document.querySelector("#landShadow"),
    landBase: document.querySelector("#landBase"),
    coastLine: document.querySelector("#coastLine"),
    oceanDetailLayer: document.querySelector("#oceanDetailLayer"),
    provinceLayer: document.querySelector("#provinceLayer"),
    terrainTextureLayer: document.querySelector("#terrainTextureLayer"),
    routeLayer: document.querySelector("#routeLayer"),
    riverLayer: document.querySelector("#riverLayer"),
    strategicBorderLayer: document.querySelector("#strategicBorderLayer"),
    realmBorderLayer: document.querySelector("#realmBorderLayer"),
    capitalLayer: document.querySelector("#capitalLayer"),
    realmLabelLayer: document.querySelector("#realmLabelLayer"),
    strategicLabelLayer: document.querySelector("#strategicLabelLayer"),
    provinceLabelLayer: document.querySelector("#provinceLabelLayer"),
    armyLayer: document.querySelector("#armyLayer"),
    modeButtons: Array.from(document.querySelectorAll("[data-map-mode]")),
    seedForm: document.querySelector("#seedForm"),
    seedInput: document.querySelector("#seedInput"),
    languageToggle: document.querySelector("#languageToggle"),
    returnLink: document.querySelector("#returnLink"),
    legendModeName: document.querySelector("#legendModeName"),
    legendItems: document.querySelector("#legendItems"),
    geographyReadout: document.querySelector("#geographyReadout"),
    scenarioReadout: document.querySelector("#scenarioReadout"),
    zoomReadout: document.querySelector("#zoomReadout"),
    zoomInButton: document.querySelector("#zoomInButton"),
    zoomOutButton: document.querySelector("#zoomOutButton"),
    zoomResetButton: document.querySelector("#zoomResetButton"),
    mapTooltip: document.querySelector("#mapTooltip"),
    inspector: document.querySelector("#inspector"),
    inspectorToggle: document.querySelector("#inspectorToggle"),
    inspectorEyebrow: document.querySelector("#inspectorEyebrow"),
    inspectorContent: document.querySelector("#inspectorContent"),
    provinceCode: document.querySelector("#provinceCode"),
    provinceName: document.querySelector("#provinceName"),
    provinceRegion: document.querySelector("#provinceRegion"),
    provinceFacts: Array.from(document.querySelectorAll(".province-facts > div")),
    provinceArmies: document.querySelector("#provinceArmies"),
    inspectorNote: document.querySelector("#inspectorNote"),
    liveRegion: document.querySelector("#liveRegion")
  };

  const geography = MODEL.buildGeography(DATA);
  const provinceNodes = new Map();
  const textureNodes = new Map();
  const provinceLabelNodes = new Map();
  const realmBorderNodes = [];
  const capitalNodes = new Map();
  const realmLabelNodes = new Map();
  const armyNodes = new Map();
  const pointers = new Map();
  let language = preferredLanguage();
  let mode = MODES.has(params.get("mode")) ? params.get("mode") : "political";
  let scenario = MODEL.createScenario(DATA, geography, params.get("seed") || "1058");
  let camera = MODEL.clampCamera({
    cx: DATA.viewBox.x + DATA.viewBox.width / 2,
    cy: DATA.viewBox.y + DATA.viewBox.height / 2,
    zoom: 1
  }, DATA.viewBox);
  let selectedProvinceId = geography.provinceById[DATA.initialSelection]?.id || DATA.provinces[0].id;
  let selectedArmyId = null;
  let dragState = null;
  let pinchState = null;
  let suppressClick = false;

  function preferredLanguage() {
    const requested = String(params.get("lang") || "").toLowerCase();
    if (requested === "en" || requested === "zh") return requested;
    try {
      return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh";
    } catch {
      return "zh";
    }
  }

  function t(chinese, english) {
    return language === "en" ? english : chinese;
  }

  function localizedName(record) {
    return language === "en" ? record?.nameEn : record?.nameZh;
  }

  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    return node;
  }

  function pointsPath(points) {
    if (!points?.length) return "";
    return `${points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")} Z`;
  }

  function routePath(provinceIds) {
    const points = provinceIds.map((provinceId) => geography.provinceById[provinceId]?.center).filter(Boolean);
    if (!points.length) return "";
    return points.map((point, index) => `${index ? "L" : "M"} ${point[0]} ${point[1]}`).join(" ");
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(scenario.seed));
    if (language === "en") url.searchParams.set("lang", "en");
    else url.searchParams.delete("lang");
    if (mode !== "political") url.searchParams.set("mode", mode);
    else url.searchParams.delete("mode");
    try {
      window.history.replaceState({}, "", url.href);
    } catch {
      // Direct file launches can deny history writes; the map still remains fully playable.
    }
  }

  function announce(message) {
    dom.liveRegion.textContent = "";
    window.requestAnimationFrame(() => {
      dom.liveRegion.textContent = message;
    });
  }

  function buildStaticMap() {
    const landPath = DATA.landPath;
    dom.landClipPath.setAttribute("d", landPath);
    dom.landShadow.setAttribute("d", landPath);
    dom.landBase.setAttribute("d", landPath);
    dom.coastLine.setAttribute("d", landPath);

    [
      "M -70 184 C 180 91 365 89 568 157 C 782 228 982 200 1272 84",
      "M -89 322 C 163 249 365 261 554 328 C 787 410 1005 368 1282 240",
      "M -35 520 C 194 456 389 475 607 548 C 831 621 1029 592 1280 461",
      "M 85 700 C 297 617 497 626 700 694 C 879 754 1039 740 1188 671"
    ].forEach((pathData) => {
      const path = svgElement("path", { class: "ocean-current", d: pathData });
      dom.oceanDetailLayer.append(path);
    });

    geography.cells.forEach((cell) => {
      const province = geography.provinceById[cell.provinceId];
      const path = svgElement("path", {
        class: "province-shape",
        d: pointsPath(cell.points),
        role: "button",
        tabindex: province.id === selectedProvinceId ? "0" : "-1",
        "data-province-id": province.id
      });
      path.addEventListener("focus", () => setHoveredProvince(province.id, null));
      path.addEventListener("blur", () => setHoveredProvince(null, null));
      path.addEventListener("keydown", (event) => handleProvinceKeydown(event, province.id));
      provinceNodes.set(province.id, path);
      dom.provinceLayer.append(path);

      const texture = svgElement("path", {
        class: `terrain-texture terrain-${province.terrain}`,
        d: pointsPath(cell.points)
      });
      textureNodes.set(province.id, texture);
      dom.terrainTextureLayer.append(texture);

      if (province.terrain === "mountain" || province.terrain === "canyon") {
        const mountain = svgElement("use", {
          class: "terrain-mountain",
          href: "#mountainSymbol",
          x: province.center[0] - 15,
          y: province.center[1] - 10,
          width: 30,
          height: 20
        });
        dom.terrainTextureLayer.append(mountain);
      }

      const label = svgElement("text", {
        class: "province-label",
        x: province.label[0],
        y: province.label[1] - 2
      });
      const nameLine = svgElement("tspan", { x: province.label[0] });
      const metaLine = svgElement("tspan", {
        class: "province-meta-label",
        x: province.label[0],
        dy: 12
      });
      label.append(nameLine, metaLine);
      provinceLabelNodes.set(province.id, { label, nameLine, metaLine });
      dom.provinceLabelLayer.append(label);
    });

    DATA.rivers.forEach((river) => {
      dom.riverLayer.append(svgElement("path", {
        class: `map-river${river.major ? " major" : ""}`,
        d: river.path
      }));
    });

    DATA.routes.forEach((route) => {
      dom.routeLayer.append(svgElement("path", {
        class: "map-route",
        d: routePath(route.provinceIds)
      }));
    });

    geography.sharedEdges.forEach((edge, index) => {
      const pathData = `M ${edge.start.x} ${edge.start.y} L ${edge.end.x} ${edge.end.y}`;
      if (edge.strategicBoundary) {
        dom.strategicBorderLayer.append(svgElement("path", {
          class: "strategic-border",
          d: pathData
        }));
      }
      const realmBorder = svgElement("path", {
        class: "realm-border",
        d: pathData,
        "data-edge-index": index
      });
      realmBorderNodes.push({ node: realmBorder, edge });
      dom.realmBorderLayer.append(realmBorder);
    });

    DATA.strategicRegions.forEach((region) => {
      const label = svgElement("text", {
        class: "strategic-label",
        x: region.label[0],
        y: region.label[1]
      });
      label.textContent = localizedName(region);
      label.dataset.regionId = region.id;
      dom.strategicLabelLayer.append(label);
    });

    DATA.realms.forEach((realm) => {
      const capital = svgElement("g", { class: "capital-node" });
      capital.append(svgElement("use", {
        class: "capital-marker",
        href: "#capitalSymbol",
        x: -11,
        y: -11,
        width: 22,
        height: 22
      }));
      capitalNodes.set(realm.id, capital);
      dom.capitalLayer.append(capital);

      const label = svgElement("text", { class: "realm-label" });
      realmLabelNodes.set(realm.id, label);
      dom.realmLabelLayer.append(label);
    });

    dom.geographyReadout.textContent = `${DATA.provinces.length} / ${DATA.strategicRegions.length} · ${geography.signature.toUpperCase()}`;
  }

  function buildArmyNodes() {
    dom.armyLayer.replaceChildren();
    armyNodes.clear();
    scenario.armies.forEach((army, index) => {
      const realm = geography.realmById[army.realmId];
      const marker = svgElement("g", {
        class: `army-marker${army.realmId === "player-realm" ? " is-player" : ""}${index % 2 ? " secondary-army" : ""}`,
        role: "button",
        tabindex: "0",
        "data-army-id": army.id,
        "aria-label": localizedArmyLabel(army)
      });
      marker.append(svgElement("path", {
        class: "army-marker-shield",
        d: "M -15 -14 L 15 -14 L 13 7 L 0 16 L -13 7 Z"
      }));
      const tier = svgElement("text", { class: "army-tier", x: 0, y: -2 });
      tier.textContent = armyTier(army.force);
      const force = svgElement("text", { class: "army-force", x: 0, y: 8 });
      force.textContent = compactNumber(army.force);
      marker.append(tier, force);
      marker.addEventListener("click", (event) => {
        if (suppressClick) return;
        event.stopPropagation();
        selectArmy(army.id);
      });
      marker.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectArmy(army.id);
      });
      armyNodes.set(army.id, marker);
      dom.armyLayer.append(marker);
    });
  }

  function updateScenarioMap() {
    DATA.provinces.forEach((province) => {
      const node = provinceNodes.get(province.id);
      const state = scenario.provinceState[province.id];
      const realm = geography.realmById[state.controllerId];
      const terrain = DATA.terrainTypes[province.terrain];
      node.style.setProperty("--realm-color", realm.color);
      node.style.setProperty("--terrain-color", terrain.color);
      node.dataset.realmId = realm.id;
      node.dataset.terrain = province.terrain;
      node.setAttribute("aria-label", provinceAriaLabel(province));
    });

    realmBorderNodes.forEach(({ node, edge }) => {
      const leftOwner = scenario.controllerByProvince[edge.a];
      const rightOwner = scenario.controllerByProvince[edge.b];
      const visible = leftOwner !== rightOwner;
      node.dataset.active = visible ? "true" : "false";
      node.style.display = visible ? "" : "none";
      node.classList.toggle("frontline", visible && mode === "military");
    });

    DATA.realms.forEach((realm) => {
      const capitalProvince = geography.provinceById[scenario.capitals[realm.id]];
      const capital = capitalNodes.get(realm.id);
      capital.dataset.realmId = realm.id;
      capital.dataset.x = String(capitalProvince.center[0]);
      capital.dataset.y = String(capitalProvince.center[1]);

      const owned = DATA.provinces.filter((province) => scenario.controllerByProvince[province.id] === realm.id);
      const weightTotal = owned.reduce((sum, province) => sum + scenario.provinceState[province.id].development, 0) || 1;
      const x = owned.reduce((sum, province) => sum + province.center[0] * scenario.provinceState[province.id].development, 0) / weightTotal;
      const y = owned.reduce((sum, province) => sum + province.center[1] * scenario.provinceState[province.id].development, 0) / weightTotal;
      const label = realmLabelNodes.get(realm.id);
      label.setAttribute("x", String(x));
      label.setAttribute("y", String(y));
      label.textContent = localizedName(realm);
    });

    buildArmyNodes();
    updateMapCopy();
    applyCamera();
    renderInspector();
  }

  function updateMapCopy() {
    document.querySelectorAll(".strategic-label").forEach((label) => {
      label.textContent = localizedName(geography.strategicRegionById[label.dataset.regionId]);
    });
    DATA.realms.forEach((realm) => {
      realmLabelNodes.get(realm.id).textContent = localizedName(realm);
    });
    DATA.provinces.forEach((province) => {
      const state = scenario.provinceState[province.id];
      const record = provinceLabelNodes.get(province.id);
      record.nameLine.textContent = localizedName(province);
      if (mode === "terrain") record.metaLine.textContent = localizedName(DATA.terrainTypes[province.terrain]);
      else if (mode === "military") record.metaLine.textContent = `DEF ${state.fortification}`;
      else record.metaLine.textContent = `DEV ${state.development}`;
      const node = provinceNodes.get(province.id);
      node.setAttribute("aria-label", provinceAriaLabel(province));
    });
    scenario.armies.forEach((army) => {
      armyNodes.get(army.id)?.setAttribute("aria-label", localizedArmyLabel(army));
    });
  }

  function updateStaticLanguage() {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = t("文明摇篮：地图实验室", "Cradles of Civilization: Map Lab");
    document.querySelectorAll("[data-zh][data-en]").forEach((node) => {
      node.textContent = t(node.dataset.zh, node.dataset.en);
    });
    document.querySelectorAll("[data-zh-label][data-en-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.zhLabel, node.dataset.enLabel));
    });
    dom.languageToggle.textContent = language === "en" ? "中" : "EN";
    dom.languageToggle.setAttribute("aria-label", t("切换到英文", "Switch to Chinese"));
    const returnUrl = new URL("../index.html", window.location.href);
    if (language === "en") returnUrl.searchParams.set("lang", "en");
    dom.returnLink.href = returnUrl.href;
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // The map remains usable when local storage is unavailable.
    }
    updateMapCopy();
    renderLegend();
    renderInspector();
    updateUrl();
  }

  function setMode(nextMode, shouldAnnounce = true) {
    if (!MODES.has(nextMode)) return;
    mode = nextMode;
    dom.body.dataset.mode = mode;
    dom.modeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.mapMode === mode ? "true" : "false");
    });
    realmBorderNodes.forEach(({ node }) => node.classList.toggle("frontline", node.dataset.active === "true" && mode === "military"));
    updateMapCopy();
    renderLegend();
    renderInspector();
    updateUrl();
    if (shouldAnnounce) announce(t(`${modeName(mode)}地图已启用`, `${modeName(mode)} map enabled`));
  }

  function modeName(value) {
    return {
      political: t("政治", "Political"),
      terrain: t("地形", "Terrain"),
      military: t("军事", "Military")
    }[value];
  }

  function renderLegend() {
    dom.legendModeName.textContent = t(`${modeName(mode)}地图`, `${modeName(mode)} Map`);
    let items;
    if (mode === "political") {
      items = DATA.realms.map((realm) => ({
        color: realm.color,
        label: localizedName(realm),
        meta: DATA.provinces.filter((province) => scenario.controllerByProvince[province.id] === realm.id).length
      }));
    } else if (mode === "terrain") {
      items = Object.entries(DATA.terrainTypes).map(([id, terrain]) => ({
        color: terrain.color,
        label: localizedName(terrain),
        meta: `${terrain.attack >= 0 ? "+" : ""}${terrain.attack}/${terrain.defense >= 0 ? "+" : ""}${terrain.defense}`,
        id
      }));
    } else {
      items = [
        { color: "#f3b067", label: t("前线", "Front line"), meta: t("敌对边界", "hostile") },
        { color: "#e1d7bd", label: t("军团", "Army"), meta: scenario.armies.length },
        { color: "#f4ddb1", label: t("首都", "Capital"), meta: DATA.realms.length },
        { color: "#d2ad70", label: t("干道", "Route"), meta: DATA.routes.length }
      ];
    }
    dom.legendItems.replaceChildren(...items.map((item) => {
      const row = document.createElement("div");
      row.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.setProperty("--swatch", item.color);
      const label = document.createElement("span");
      label.textContent = item.label;
      const meta = document.createElement("small");
      meta.textContent = item.meta;
      row.append(swatch, label, meta);
      return row;
    }));
  }

  function provinceAriaLabel(province) {
    const state = scenario.provinceState[province.id];
    const realm = geography.realmById[state.controllerId];
    const region = geography.strategicRegionById[province.strategicRegionId];
    const terrain = DATA.terrainTypes[province.terrain];
    return t(
      `${province.nameZh}，${region.nameZh}，${terrain.nameZh}，由${realm.nameZh}控制`,
      `${province.nameEn}, ${region.nameEn}, ${terrain.nameEn}, controlled by ${realm.nameEn}`
    );
  }

  function localizedArmyLabel(army) {
    const realm = geography.realmById[army.realmId];
    const province = geography.provinceById[army.provinceId];
    return t(
      `${realm.nameZh}${army.nameZh}，驻扎${province.nameZh}，兵力${army.force}`,
      `${realm.nameEn} ${army.nameEn}, stationed in ${province.nameEn}, force ${army.force}`
    );
  }

  function compactNumber(value) {
    const number = Number(value) || 0;
    if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
    return String(Math.round(number));
  }

  function armyTier(force) {
    if (force >= 14000) return "IV";
    if (force >= 10500) return "III";
    if (force >= 7500) return "II";
    return "I";
  }

  function setFact(index, labelZh, labelEn, value) {
    const fact = dom.provinceFacts[index];
    fact.querySelector("dt").textContent = t(labelZh, labelEn);
    fact.querySelector("dd").textContent = value;
  }

  function renderInspector() {
    const army = scenario.armies.find((candidate) => candidate.id === selectedArmyId);
    if (army) {
      const province = geography.provinceById[army.provinceId];
      const realm = geography.realmById[army.realmId];
      dom.inspectorEyebrow.textContent = t("军团情报", "ARMY INTELLIGENCE");
      dom.provinceCode.textContent = army.id.toUpperCase();
      dom.provinceName.textContent = localizedName(army);
      dom.provinceRegion.textContent = `${localizedName(realm)} · ${localizedName(province)}`;
      setFact(0, "阵营", "Realm", localizedName(realm));
      setFact(1, "驻地", "Station", localizedName(province));
      setFact(2, "兵力", "Force", army.force.toLocaleString(language === "en" ? "en-US" : "zh-CN"));
      setFact(3, "进攻", "Attack", army.attack);
      setFact(4, "防守", "Defense", army.defense);
      setFact(5, "本年行动", "Movement", t("待命", "Ready"));
      renderProvinceArmies(province.id, army.id);
      return;
    }

    const province = geography.provinceById[selectedProvinceId] || DATA.provinces[0];
    const state = scenario.provinceState[province.id];
    const realm = geography.realmById[state.controllerId];
    const region = geography.strategicRegionById[province.strategicRegionId];
    const terrain = DATA.terrainTypes[province.terrain];
    dom.inspectorEyebrow.textContent = t("省份情报", "PROVINCE INTELLIGENCE");
    dom.provinceCode.textContent = province.id.toUpperCase();
    dom.provinceName.textContent = localizedName(province);
    dom.provinceRegion.textContent = `${localizedName(region)} · ${localizedName(terrain)}`;
    setFact(0, "控制者", "Controller", localizedName(realm));
    setFact(1, "发展", "Development", state.development);
    setFact(2, "工事", "Fortification", state.fortification);
    setFact(3, "补给", "Supply", `${state.supply}%`);
    setFact(4, "人口", "Population", `${state.population}k`);
    setFact(5, "接壤", "Borders", geography.neighbors[province.id].length);
    renderProvinceArmies(province.id, null);
  }

  function renderProvinceArmies(provinceId, selectedId) {
    const armies = scenario.armies.filter((army) => army.provinceId === provinceId);
    dom.provinceArmies.replaceChildren();
    if (!armies.length) {
      const empty = document.createElement("div");
      empty.className = "no-armies";
      empty.textContent = t("本省没有常驻军团。", "No field army is stationed in this province.");
      dom.provinceArmies.append(empty);
      return;
    }
    armies.forEach((army) => {
      const realm = geography.realmById[army.realmId];
      const card = document.createElement("div");
      card.className = "army-card";
      card.style.setProperty("--realm-color", realm.color);
      if (army.id === selectedId) card.dataset.selected = "true";
      const title = document.createElement("strong");
      title.textContent = `${localizedName(realm)} · ${localizedName(army)}`;
      const meta = document.createElement("span");
      meta.textContent = t(
        `兵力 ${army.force.toLocaleString("zh-CN")} · 攻 ${army.attack} · 防 ${army.defense}`,
        `Force ${army.force.toLocaleString("en-US")} · ATK ${army.attack} · DEF ${army.defense}`
      );
      card.append(title, meta);
      dom.provinceArmies.append(card);
    });
  }

  function selectProvince(provinceId, options = {}) {
    if (!geography.provinceById[provinceId]) return;
    selectedProvinceId = provinceId;
    selectedArmyId = null;
    provinceNodes.forEach((node, id) => {
      node.classList.toggle("is-selected", id === provinceId);
      node.setAttribute("tabindex", id === provinceId ? "0" : "-1");
    });
    armyNodes.forEach((node) => node.classList.remove("is-selected"));
    renderInspector();
    if (window.matchMedia("(max-width: 820px)").matches) setInspectorCollapsed(false);
    const province = geography.provinceById[provinceId];
    announce(t(`已选择${province.nameZh}`, `${province.nameEn} selected`));
    if (options.focus) provinceNodes.get(provinceId).focus({ preventScroll: true });
  }

  function selectArmy(armyId) {
    const army = scenario.armies.find((candidate) => candidate.id === armyId);
    if (!army) return;
    selectedArmyId = army.id;
    selectedProvinceId = army.provinceId;
    provinceNodes.forEach((node, id) => {
      node.classList.toggle("is-selected", id === selectedProvinceId);
      node.setAttribute("tabindex", id === selectedProvinceId ? "0" : "-1");
    });
    armyNodes.forEach((node, id) => node.classList.toggle("is-selected", id === army.id));
    renderInspector();
    if (window.matchMedia("(max-width: 820px)").matches) setInspectorCollapsed(false);
    announce(t(`已选择${army.nameZh}`, `${army.nameEn} selected`));
  }

  function setHoveredProvince(provinceId, pointerEvent) {
    provinceNodes.forEach((node, id) => node.classList.toggle("is-hovered", id === provinceId));
    if (!provinceId || !pointerEvent) {
      dom.mapTooltip.hidden = true;
      return;
    }
    const province = geography.provinceById[provinceId];
    const state = scenario.provinceState[provinceId];
    const realm = geography.realmById[state.controllerId];
    const region = geography.strategicRegionById[province.strategicRegionId];
    dom.mapTooltip.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = localizedName(province);
    const meta = document.createElement("span");
    meta.textContent = `${localizedName(region)} · ${localizedName(realm)}`;
    dom.mapTooltip.append(title, meta);
    const left = Math.min(window.innerWidth - 276, pointerEvent.clientX + 14);
    const top = Math.min(window.innerHeight - 74, pointerEvent.clientY + 14);
    dom.mapTooltip.style.left = `${Math.max(8, left)}px`;
    dom.mapTooltip.style.top = `${Math.max(8, top)}px`;
    dom.mapTooltip.hidden = false;
  }

  function handleProvinceKeydown(event, provinceId) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectProvince(provinceId);
      return;
    }
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const current = geography.provinceById[provinceId];
    const candidates = geography.neighbors[provinceId].map((id) => geography.provinceById[id]);
    const scored = candidates.map((candidate) => {
      const dx = candidate.center[0] - current.center[0];
      const dy = candidate.center[1] - current.center[1];
      const distance = Math.max(1, Math.hypot(dx, dy));
      return { candidate, alignment: (dx * direction[0] + dy * direction[1]) / distance, distance };
    }).filter((entry) => entry.alignment > 0.15)
      .sort((left, right) => right.alignment - left.alignment || left.distance - right.distance);
    if (scored[0]) selectProvince(scored[0].candidate.id, { focus: true });
  }

  function mapPointerRatio(event) {
    const metrics = mapViewportMetrics();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - metrics.left) / metrics.width)),
      y: Math.min(1, Math.max(0, (event.clientY - metrics.top) / metrics.height))
    };
  }

  function mapAspect() {
    const rect = dom.mapSvg.getBoundingClientRect();
    return Math.max(0.1, rect.width / Math.max(1, rect.height));
  }

  function mapViewportMetrics(view = MODEL.cameraView(camera, DATA.viewBox, mapAspect())) {
    const rect = dom.mapSvg.getBoundingClientRect();
    const scale = Math.max(1e-7, Math.min(rect.width / view.width, rect.height / view.height));
    const width = view.width * scale;
    const height = view.height * scale;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height
    };
  }

  function applyCamera() {
    const viewportAspect = mapAspect();
    camera = MODEL.clampCamera(camera, DATA.viewBox, viewportAspect);
    const view = MODEL.cameraView(camera, DATA.viewBox, viewportAspect);
    dom.mapSvg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
    dom.zoomReadout.textContent = `${camera.zoom.toFixed(2)}×`;
    const mobileOffset = window.matchMedia("(max-width: 720px)").matches ? 0.65 : 0;
    const band = camera.zoom < 1.25 + mobileOffset ? "far" : camera.zoom < 2.2 + mobileOffset ? "mid" : "near";
    dom.body.dataset.zoomBand = band;
    const inverseScale = 1 / camera.zoom;
    capitalNodes.forEach((node) => {
      node.setAttribute("transform", `translate(${node.dataset.x} ${node.dataset.y}) scale(${inverseScale})`);
    });
    scenario.armies.forEach((army, index) => {
      const node = armyNodes.get(army.id);
      const province = geography.provinceById[army.provinceId];
      const offset = index % 2 ? 18 : -8;
      node?.setAttribute("transform", `translate(${province.center[0] + offset * inverseScale} ${province.center[1] + 17 * inverseScale}) scale(${inverseScale})`);
    });
  }

  function zoomBy(factor, pointer = { x: 0.5, y: 0.5 }) {
    camera = MODEL.zoomCameraAt(camera, camera.zoom * factor, pointer, DATA.viewBox, mapAspect());
    applyCamera();
  }

  function defaultCameraZoom() {
    const worldAspect = DATA.viewBox.width / DATA.viewBox.height;
    return Math.min(MODEL.MAX_ZOOM, Math.max(1, worldAspect / mapAspect() * 0.84));
  }

  function resetCamera() {
    camera = MODEL.clampCamera({
      cx: DATA.viewBox.x + DATA.viewBox.width / 2,
      cy: DATA.viewBox.y + DATA.viewBox.height / 2,
      zoom: defaultCameraZoom()
    }, DATA.viewBox, mapAspect());
    applyCamera();
    announce(t("镜头已重置", "Camera reset"));
  }

  function beginPinch() {
    const values = Array.from(pointers.values());
    if (values.length < 2) return;
    const [left, right] = values;
    const metrics = mapViewportMetrics();
    const midpoint = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    pinchState = {
      distance: Math.hypot(left.x - right.x, left.y - right.y),
      camera: { ...camera },
      ratio: {
        x: Math.min(1, Math.max(0, (midpoint.x - metrics.left) / metrics.width)),
        y: Math.min(1, Math.max(0, (midpoint.y - metrics.top) / metrics.height))
      },
      midpoint
    };
    dragState = null;
  }

  function setInspectorCollapsed(collapsed) {
    dom.inspector.classList.toggle("is-collapsed", collapsed);
    dom.body.dataset.inspectorCollapsed = collapsed ? "true" : "false";
    dom.inspectorToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  dom.mapSvg.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const provinceNode = event.target.closest?.(".province-shape");
    const armyNode = event.target.closest?.(".army-marker");
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dom.mapSvg.setPointerCapture(event.pointerId);
    dom.mapSvg.classList.add("is-dragging");
    dom.mapTooltip.hidden = true;
    if (pointers.size >= 2) {
      beginPinch();
      return;
    }
    dragState = {
      x: event.clientX,
      y: event.clientY,
      total: 0,
      provinceId: provinceNode?.dataset.provinceId || null,
      armyId: armyNode?.dataset.armyId || null
    };
  });

  dom.mapSvg.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) {
      const provinceNode = event.target.closest?.(".province-shape");
      setHoveredProvince(provinceNode?.dataset.provinceId || null, event);
      return;
    }
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinchState) {
      const values = Array.from(pointers.values());
      const [left, right] = values;
      const distance = Math.max(1, Math.hypot(left.x - right.x, left.y - right.y));
      const midpoint = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
      const nextZoom = pinchState.camera.zoom * distance / Math.max(1, pinchState.distance);
      const viewportAspect = mapAspect();
      let nextCamera = MODEL.zoomCameraAt(pinchState.camera, nextZoom, pinchState.ratio, DATA.viewBox, viewportAspect);
      const view = MODEL.cameraView(nextCamera, DATA.viewBox, viewportAspect);
      const metrics = mapViewportMetrics(view);
      nextCamera.cx -= (midpoint.x - pinchState.midpoint.x) / metrics.width * view.width;
      nextCamera.cy -= (midpoint.y - pinchState.midpoint.y) / metrics.height * view.height;
      camera = MODEL.clampCamera(nextCamera, DATA.viewBox, viewportAspect);
      suppressClick = true;
      applyCamera();
      return;
    }
    if (!dragState) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    const viewportAspect = mapAspect();
    const view = MODEL.cameraView(camera, DATA.viewBox, viewportAspect);
    const metrics = mapViewportMetrics(view);
    camera = MODEL.clampCamera({
      cx: camera.cx - dx / metrics.width * view.width,
      cy: camera.cy - dy / metrics.height * view.height,
      zoom: camera.zoom
    }, DATA.viewBox, viewportAspect);
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    dragState.total += Math.hypot(dx, dy);
    if (dragState.total > 5) suppressClick = true;
    applyCamera();
  });

  function finishPointer(event) {
    const tapTarget = event.type === "pointerup" && pointers.size === 1 && !pinchState && dragState?.total <= 5
      ? { provinceId: dragState.provinceId, armyId: dragState.armyId }
      : null;
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const remaining = Array.from(pointers.values())[0];
      dragState = { x: remaining.x, y: remaining.y, total: 6 };
      pinchState = null;
    } else if (!pointers.size) {
      dragState = null;
      pinchState = null;
      dom.mapSvg.classList.remove("is-dragging");
      if (tapTarget?.armyId || tapTarget?.provinceId) {
        suppressClick = true;
        if (tapTarget.armyId) selectArmy(tapTarget.armyId);
        else selectProvince(tapTarget.provinceId);
      }
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
  }

  dom.mapSvg.addEventListener("pointerup", finishPointer);
  dom.mapSvg.addEventListener("pointercancel", finishPointer);
  dom.mapSvg.addEventListener("pointerleave", (event) => {
    if (!pointers.has(event.pointerId)) setHoveredProvince(null, null);
  });

  dom.mapSvg.addEventListener("click", (event) => {
    if (suppressClick) return;
    const armyNode = event.target.closest?.(".army-marker");
    if (armyNode) {
      selectArmy(armyNode.dataset.armyId);
      return;
    }
    const provinceNode = event.target.closest?.(".province-shape");
    if (provinceNode) selectProvince(provinceNode.dataset.provinceId);
  });

  dom.mapSvg.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0014);
    zoomBy(factor, mapPointerRatio(event));
  }, { passive: false });

  dom.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mapMode)));
  dom.zoomInButton.addEventListener("click", () => zoomBy(1.25));
  dom.zoomOutButton.addEventListener("click", () => zoomBy(0.8));
  dom.zoomResetButton.addEventListener("click", resetCamera);
  dom.inspectorToggle.addEventListener("click", () => setInspectorCollapsed(!dom.inspector.classList.contains("is-collapsed")));
  dom.languageToggle.addEventListener("click", () => {
    language = language === "en" ? "zh" : "en";
    updateStaticLanguage();
    announce(t("已切换为中文", "English enabled"));
  });
  dom.seedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    scenario = MODEL.createScenario(DATA, geography, dom.seedInput.value || Date.now());
    dom.seedInput.value = String(scenario.seed);
    dom.scenarioReadout.textContent = `${scenario.seed} · ${scenario.signature.toUpperCase()}`;
    selectedArmyId = null;
    updateScenarioMap();
    updateUrl();
    announce(t(`局势已按种子 ${scenario.seed} 重排；地理保持不变`, `Scenario reshuffled with seed ${scenario.seed}; geography unchanged`));
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target?.matches?.("input, textarea, select") || target?.isContentEditable) return;
    if (["1", "2", "3"].includes(event.key)) {
      setMode(["political", "terrain", "military"][Number(event.key) - 1]);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      resetCamera();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.25);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomBy(0.8);
    } else if (event.key === "Escape") {
      selectedArmyId = null;
      armyNodes.forEach((node) => node.classList.remove("is-selected"));
      renderInspector();
      setInspectorCollapsed(true);
    }
  });

  window.addEventListener("resize", applyCamera);

  buildStaticMap();
  dom.seedInput.value = String(scenario.seed);
  dom.scenarioReadout.textContent = `${scenario.seed} · ${scenario.signature.toUpperCase()}`;
  updateScenarioMap();
  updateStaticLanguage();
  setMode(mode, false);
  selectProvince(selectedProvinceId);
  resetCamera();
})();
