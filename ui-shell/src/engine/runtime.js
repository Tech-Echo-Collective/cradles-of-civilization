import "../../../endings.js";
import "../../../balance-model.js";
import "../../../map-lab/map-data.js";
import "../../../map-lab/map-model.js";
import "../../../map-lab/map-generator.js";

// Load the original rule engine once, with its optional React presentation host.
// Rules, seeded randomness and save migrations stay in game.js.
export async function loadEngine() {
  globalThis.CRADLES_GAME_HOST = Object.freeze({ presentation: "react" });
  await import("../../../game.js");
  const engine = globalThis.CRADLES_GAME_ENGINE;
  if (!engine) throw new Error("游戏引擎未能初始化。");
  engine.initialize();
  return engine;
}
