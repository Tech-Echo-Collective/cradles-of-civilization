import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sources = [
  "endings.js",
  "balance-model.js",
  "map-lab/map-data.js",
  "map-lab/map-model.js",
  "map-lab/map-generator.js",
  "game.js",
].map((name) => [name, fs.readFileSync(`${root}${name}`, "utf8")]);
const commands = new Set([
  "executeAction",
  "selectProvince",
  "selectArmy",
  "selectEntity",
  "deployArmy",
  "setStrategy",
  "setMapExpanded",
  "tickAutoRun",
]);
const json = (value) => JSON.parse(JSON.stringify(value));

function loadIsolatedEngine(storage) {
  const noLegacyDom = () => {
    throw new Error("A hosted campaign touched the legacy DOM");
  };
  const context = vm.createContext({
    console,
    URL,
    Intl,
    Date,
    Math,
    CRADLES_GAME_HOST: {},
    document: {
      addEventListener: noLegacyDom,
      querySelector: noLegacyDom,
      querySelectorAll: noLegacyDom,
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    location: { href: "http://localhost/index.html" },
    history: { replaceState() {} },
    addEventListener: noLegacyDom,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => true,
  });
  context.window = context;
  for (const [filename, source] of sources) vm.runInContext(source, context, { filename });
  const raw = context.CRADLES_GAME_ENGINE;
  raw.initialize();
  return { raw, context };
}

/** Each campaign starts through the same public host used by React. No state injection. */
export function createCampaign(config, { record = true } = {}) {
  const storage = new Map();
  const { raw, context } = loadIsolatedEngine(storage);
  assert.equal(raw.createGame({ realmName: "结局可达性验证国", ...config }).ok, true);
  assert.equal(raw.completeSetup().ok, true);
  const initial = raw.getView();
  const resolvedConfig = Object.fromEntries(
    [
      "seed",
      "realmName",
      "difficulty",
      "aiAggression",
      "governorId",
      "mapUiExpanded",
      "startingRegionId",
    ].map((key) => [key, initial[key]]),
  );
  const trace = [];
  let commandCount = 0;
  const api = new Proxy(
    { ...raw },
    {
      get(target, key) {
        if (["importSave", "createGame", "completeSetup", "returnToSettings"].includes(key))
          return () => {
            throw new Error(`Campaign routes cannot call ${key}`);
          };
        if (!commands.has(key)) return target[key];
        return (...args) => {
          const result = target[key](...args);
          assert.equal(
            result.ok,
            true,
            `Illegal ${key}(${args.join(", ")}): ${result.reason || "unknown reason"}`,
          );
          commandCount += 1;
          if (record) trace.push([key, ...json(args)]);
          return result;
        };
      },
    },
  );
  return {
    api,
    trace,
    storage,
    view: () => raw.getView(),
    state: () => JSON.parse(raw.exportSave()),
    endingNames: json(context.THREE_SUN_ENDINGS),
    get commandCount() {
      return commandCount;
    },
    proof() {
      const view = raw.getView();
      return {
        config: json(resolvedConfig),
        commands: json(trace),
        ending: view.finalEnding?.id || null,
        years: view.turn,
        civilizations: view.count,
        snapshot: json(view.finalEnding?.snapshot || null),
        commandCount,
      };
    },
  };
}

/** Restore only the storage written by a completed real campaign. */
export function reloadCompletedCampaign(storage) {
  const restored = new Map(storage);
  const { raw } = loadIsolatedEngine(restored);
  return { view: () => raw.getView(), storage: restored };
}

export function firstAvailable(view, ids) {
  return (
    ids.find((id) => view.actions.some((action) => action.id === id && !action.disabledReason)) ||
    null
  );
}

/** Replay recorded player commands from a fresh world; importSave is deliberately unavailable. */
export function replayProof(proof) {
  const campaign = createCampaign(proof.config);
  for (const [method, ...args] of proof.commands) {
    assert.ok(commands.has(method), `Unsupported replay command ${method}`);
    assert.equal(campaign.view().finished, false, "No player command may follow a completed run");
    campaign.api[method](...args);
  }
  const actual = campaign.proof();
  assert.equal(actual.ending, proof.ending);
  assert.equal(actual.years, proof.years);
  assert.equal(actual.civilizations, proof.civilizations);
  assert.deepEqual(actual.snapshot, proof.snapshot);
  return campaign;
}
