import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const destination = path.join(here, 'native-fixtures.json');
const proofDir = process.argv[2];
const previous = fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination, 'utf8')) : null;
const proofs = proofDir ? [...'ABCDEFGHIJKL'].map(id => JSON.parse(fs.readFileSync(path.join(proofDir, `ending-reachability-${id}.json`), 'utf8')).cases[0].proof) : previous?.cases.map(item => item.proof);
if (!proofs) throw new Error('Supply a directory containing the 12 verified legal ending route reports');
const files = ['endings.js','balance-model.js','map-data.js','map-model.js','map-generator.js','game.js'];
const sources = files.map(file => [file, fs.readFileSync(path.join(here, '../Native/Rules', file), 'utf8')]);
const select = view => JSON.parse(JSON.stringify(Object.fromEntries([
  'seed','geometryVersion','geometrySeed','rngState','setupComplete','setupStage','realmName','difficulty','aiAggression','governorId','startingRegionId',
  'turn','count','sc','be','la','pop','eco','stability','scTrend','beTrend','eerfLevel','selectedArmyId','selectedEntityId','selectedRegionId',
  'awaitingCivilizationRestart','endingCandidate','finished','pendingRestart','regions','entities','visibleArmies','visibleMilitaryRegionIds','ownerCounts',
  'specialDecisionState','autoRunUntilCollapse','controlLocked','populationLockTurns','doomCountdown','populationGrowthMultiplier','knowledgeGrowthMultiplier'
].map(key => [key, view[key] ?? null]))));
function create() {
  const storage = new Map();
  const noDom = () => { throw new Error('Native host must never touch DOM'); };
  const context = vm.createContext({ console, URL, Intl, Date, Math, CRADLES_GAME_HOST:{}, document:{addEventListener:noDom,querySelector:noDom,querySelectorAll:noDom}, localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)}, location:{href:'http://localhost/index.html'},history:{replaceState(){}},addEventListener:noDom,performance:{now:()=>0},requestAnimationFrame:()=>0,cancelAnimationFrame(){},setTimeout:()=>0,clearTimeout(){},confirm:()=>true });
  context.window = context;
  for (const [name, source] of sources) vm.runInContext(source, context, { filename:name });
  const engine = context.CRADLES_GAME_ENGINE;
  engine.initialize();
  return { engine, storage };
}
const cases = proofs.map(proof => {
  const { engine } = create();
  if (!engine.createGame(proof.config).ok || !engine.completeSetup().ok) throw new Error('Invalid new game route');
  const checkpoints = [{ after:0, view:select(engine.getView()) }];
  proof.commands.forEach(([method,...args],index) => {
    const result = engine[method](...args);
    if (!result.ok) throw new Error(`Illegal ${proof.ending} command ${index}: ${result.reason}`);
    if ((index+1)%100===0 || index===proof.commands.length-1) checkpoints.push({ after:index+1, view:select(engine.getView()) });
  });
  if (engine.getView().finalEnding?.id!==proof.ending) throw new Error('Route final ending changed');
  console.log(`${proof.ending}: ${proof.commands.length} legal commands, ${checkpoints.length} parity checkpoints`);
  return { id:proof.ending, proof, checkpoints, snapshot:engine.getView().finalEnding.snapshot, geometry:engine.getView().geometry, terminalSave:engine.exportSave() };
});
fs.writeFileSync(destination, JSON.stringify({ sourceCommit:'96b05e39429a500ddfce2b160466a87ed75b2d4f', version:11, scope:'One legal fresh-game route per ending; no state injection. Checkpoints compare the native Jint interpreter against Node.js.', cases }));
