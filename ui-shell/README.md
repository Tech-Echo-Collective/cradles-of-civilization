# 文明摇篮 / CUNABULA CIVILITATIS

Tech Echo 的 React + Canvas 桌面网页界面。默认入口已接入原 `game.js`：年度决议、经济与人口、军事、灾变、EERF、文明重启和终局共用现有规则。石墨黑、青铜旧金与羊皮纸构成原创视觉。

## 运行

需要 Node.js 22.13+。在仓库根目录：

```sh
npm --prefix ui-shell ci
npm run ui:dev
```

打开 `http://127.0.0.1:5173/`。生产构建与预览：

```sh
npm run ui:build
npm run ui:preview -- --port 4173
```

也可在 `ui-shell/` 运行 `npm run build` 和 `npm run preview -- --port 4173`。输出 `dist/` 支持普通静态服务器和子目录部署。运行 `npm run web:release` 生成完整的 `../dist/web-release/`，用于官网 `/games/cradles-of-civilization/`；新版为正式入口，传统双语界面保留在发布包的 `legacy.html`。

## 主要交互

- **世界设定**：国名、种子、四档难度、四档 AI 倾向、四位执政官、领土玩法开关。种子留空随机生成大陆；选择发源地后建立文明。重复种子重现地图，读取存档保持原地图；旧存档没有生成器版本时仍使用旧固定地图。
- **地图**：64 省份、10 战略区域、5 政治实体与真实道路。默认轻量 2.5D 立体视角，包含倾斜大陆、海岸厚度、山脉明暗面、低丘与峡谷；地图上方“立体 / 平面”可切换，沿用原本机视角偏好。政治 / 地形 / 军事图层；拖动、滚轮、加减、重置、定位、地名开关。只绘制视口内标记，军队输入先经过引擎迷雾过滤。方向键、Home、F 与侧栏省份选择提供键盘操作。
- **状态栏**：SC、BE、POP、ECO、LA、秩序与 EERF 实时同步；点击可看精确指标。
- **决议**：发展、治理、军务、设施覆盖原 21 项行动。先选择决议，再执行推进一年；成本、冷却、资源门槛、危机、控制锁和终局条件全部由原引擎判断。预览只显示行动自身效果，年度事件和战事另行结算。
- **军事**：选择可见军团和省份，沿真实道路部署；己方地区防御，其他地区进攻。每支军队每年一次，部署本身不推进年份。国家战略保留原六种配置，敌国军力未知时显示“未知”。
- **灾变与结局**：特殊事件卡、财政危机、分裂自动推演、灾后火种、下一代文明重启、结局观测和最终结局均在新界面完成。终局达成后打开独立结局档案页，保留原A–L结局正文与引用，支持最终/峰值指标、文明档案、领土军情、导出和新世界；返回世界后从底部或“记录 → 终局观测”可再次打开。结局页按需加载。后台标签页暂停自动推演，回前台继续。
- **引用排版**：决议、事件卡、事件详情与编年史将叙述、引句和出处独立分行，保留原文；较长卡片摘要点击查看全文。
- **记录与时间**：事件卡看全文；编年史按类型筛选、每页 20 条，文明档案和终局进度可查看。最近 80 次指标观测由小 Canvas 绘制，断代处断线。时间轴是只读历史，不能回拨模拟；地图保持当前局面。
- **存档**：“世界与存档”导入 / 导出 JSON、开启随机新世界。当前进度使用原键 `three-sun-chronicle:v1` 和原版本 11；结局与成就键保留。新世界会替换当前运行，旧进度可先导出。不同端口、域名的浏览器存储不共享，需手动导入。损坏或未来版本的导入不会替换有效进度。
- **快捷键**：沿用 S/B/P/Shift+B/Z/1/2/H/L/E/M/V/X/C/G/D/F/U/O/R/T；输入框与对话框内不触发行动。Shift+N 打开新世界设置，Shift+L 清空当前编年。

## 文件和接口

| 文件                                                        | 用途                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `src/App.jsx` / `src/game.css`                              | 真实游戏界面、命令、对话框与布局                 |
| `src/EndingPage.jsx` / `src/ending.css`                     | 独立终局档案页与原结局文案展示                   |
| `src/QuotedCopy.jsx` / `src/data/quoted-copy.js`            | 引句/来源解析与分行，保留原内容                  |
| `src/engine/runtime.js`                                     | 按需加载原引擎与地图模块，启用 presentation host |
| `../game.js`                                                | 原规则及可选 `CRADLES_GAME_ENGINE` 适配器        |
| `src/GameMap.jsx` / `src/map/game-geometry.js`              | 平面 Canvas 地图、相机、命中与缓存               |
| `src/base.css`                                              | 两个入口共用的最小基础样式                       |
| `scripts/check-game-browser.mjs`                            | 真实玩法、存档、迷雾和基础性能检查               |
| `../scripts/test-react-engine.mjs`                          | 新旧界面命令的规则/RNG一致性检查                 |
| `src/DemoApp.jsx` / `src/AtlasMap.jsx` / `src/data/demo.js` | 最初的历史四文明展示，仅 `?demo=1` 加载          |

接入契约详见 [`docs/game-integration.md`](docs/game-integration.md)。React 从不可变快照读取，地图只消费几何与可见数据；UI 不计算规则。后续模拟可继续通过这个数据层输出快照和命令结果。

## 检查与性能

```sh
npm test
npm run ui:test
npm run test:endings
# 先在另一终端开启生产预览，再运行：
npm --prefix ui-shell run test:browser
npm --prefix ui-shell run test:endings:browser
# 可选的历史展示检查：
npm --prefix ui-shell run test:demo-browser
```

浏览器检查需要 Playwright Chromium，首次可在 `ui-shell/` 用 `npx playwright install chromium` 安装。支持 `BASE_URL`、`PLAYWRIGHT_BROWSERS_PATH` 和 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。报告与截图生成在忽略的 `test-results/`。

主地图有一个可见画布和一个脱离 DOM 的底图缓存；另一个小可见画布绘制时间指标。没有省份 SVG / React 节点。底图预编译 Path2D、小纹理缓存和有限外扩区域允许平移复用；数据或选择变化只重绘动态层。立体底图与山体进入同一缓存；倾斜视角的省份命中、四角裁切、鼠标缩放锚点、拖动与军队标记使用同一投影。空闲无绘制循环。主地图与缓存各最多 240 万像素，DPR 上限 1.5，两块原始 RGBA 合计约 19.2 MB 上限。所有图片 lazy / async；没有远程字体、巨大纹理、blur 或 backdrop-filter。

详细结果和限制见 [`docs/performance.md`](docs/performance.md)。这些是本机 Chromium 基础检查，不代表全页面内存上限、弱设备 FPS 或 Safari/Firefox 验收。

A–L 全部结局已用真实新局的合法行动路径达成，并完成完整重放与终局恢复。路线设置、实际年数和代际证据见 [`docs/ending-reachability.md`](docs/ending-reachability.md)。

## 展示参考与素材

`?demo=1` 保留最初 Egypt / Mesopotamia / Indus / Yellow River 的合成历史地图、编年与收藏。它使用独立收藏键，不能改变正式游戏，也不占默认入口的 JS/CSS 请求。

旧对话没有提供 sample 图片附件，因此实现依据明确的文字方向，没有声称逐像素验收。布局、装饰和图标为项目原创，没有使用 CK 游戏图片、纹理或 UI 文件。历史展示的四张原创概念图说明见 [`docs/art-prompts.md`](docs/art-prompts.md)，公有领域地理来源见 [`docs/map-source.md`](docs/map-source.md)。正式界面复用项目现有执政官肖像。
