# 真实游戏接入

React 界面通过原 `game.js` 的可选 presentation host 驱动现有三日世界。没有复制行动、战损、灾变、继承或结局公式。

## 加载和快照

`src/engine/runtime.js` 先加载原 endings / balance / map-data / map-model / map-generator 模块，再设置 `globalThis.CRADLES_GAME_HOST` 并动态导入 `game.js`。只有启用 host 时，原 DOM 启动、渲染、自动计时与结局跳转交由 React 接管。传统 HTML 没有设置 host，继续执行原入口。

中文 React 使用 `game.js` 内置 I18N fallback；传统双语入口仍加载原 localization。地图与演示界面通过独立入口分块，默认游戏不加载历史 demo。

`initialize()` 幂等。`getView()` 返回冻结的快照，未发生有效命令时引用不变；`subscribe(listener)` 返回退订函数。UI 使用 `useSyncExternalStore`。几何仅地图版本或种子变化时换引用；选择省份不会重建几何。

快照包含原指标和回合字段、21 actions（效果/快捷键/禁用原因）、世界配置、geometry、regions、entities、visibleArmies、选中省份与军队、合法部署目标、日志、档案、指标观测、财政危机、火种与结局观测。敌军只在原侦察规则允许时出现；不能完整观察的敌国总军力为 null。地图与侧栏都消费同一可见数据。

## 命令

| 方法 | 原用途 |
| --- | --- |
| `createGame(config)` | 新局：国名、种子、难度、AI、执政官、地图玩法开关 |
| `selectStartingRegion(id)` / `completeSetup()` / `returnToSettings()` | 发源地与建国流程 |
| `executeAction(id)` | 原 21 行动，检查禁用原因后才消耗 RNG 或年份 |
| `selectProvince(id)` / `selectArmy(id)` / `selectEntity(id)` | 原选择状态 |
| `deployArmy(targetId)` / `setStrategy(strategy)` | 原军事调动与国家战略 |
| `setMapExpanded(boolean)` | 原领土/数值玩法切换 |
| `tickAutoRun()` | 分裂时的原年度自动行动；UI 管理时钟 |
| `clearChronicle()` | 清理当前日志，不改变年份或 RNG |
| `exportSave()` / `importSave(serialized)` | 原格式 JSON 存档与迁移 |

有效命令完成后发出一次通知；失败返回 `{ok:false, reason}`。所有年份改变来自引擎命令，历史时间轴只读。

## 随机地图与兼容性

原 `seeded-continent-v1` 生成器生成大陆、省心、多边形、河流与道路。新局未提供种子时生成新的种子，重复相同显式种子保持几何一致。地图生成不消耗年度玩法的 RNG。

存档版本仍为 11，键和结局统计沿用原游戏。保存 geometryVersion / geometrySeed 与 rngState；刷新继续原地图和后续随机序列。缺少 geometryVersion 的旧存档仍加载原固定地图，避免迁移时移动省份。最终结局保存几何信息并能重新打开。

React 的 `EndingPage` 在快照含 `finalEnding` 时按需加载，直接读取原 A–L 正文、`snapshot` / `peakSnapshot`、`metricArchive` 和 `mapArchive`。返回世界只切换页面显示；终局仍保持只读，底部和“记录 → 终局观测”可重新进入。新世界设置取消不改变当前档案，提交后由原引擎生成新种子和地图。导出使用原宿主存档格式，读取已完成存档会恢复结局页。

`QuotedCopy` 只解析原文的引用边界，将叙述、引句和来源分别呈现，不改写文案，也不参与模拟和持久化。

导入先验证并迁移，构建候选快照成功后才提交，失败恢复有效状态。界面不支持未来未知存档/地图生成版本。部署到不同域名或端口时使用导入/导出搬运存档。

## 验证边界

`../scripts/test-react-engine.mjs` 在三个种子下对比原引擎和 host 的连续行动状态/RNG；验证冻结快照、失败命令不消耗年份、迁移、战损、迷雾、分裂、灾变传承、文明重启、日志清理与终局重载。生产浏览器验证通过 UI 操作；特殊状态由原格式 fixture 导入。

后续增加玩法时继续在原引擎定义规则，再将快照字段与命令接到界面。大规模世界或长时自动模拟应重新测量结算和快照复制成本；当前 64 省与原日志/档案上限没有引入 Worker 的必要。
