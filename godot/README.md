# 文明摇篮 · Cunabula Civilitatis / Godot

当前版本：`0.5.0-alpha.5-godot.1`，开发分支：`godot-port`。

本版将 HTML `v0.5.0-alpha.5` 的桌面地图界面和完整玩法移植到 Godot 4.7.1 .NET。网页规则基准固定为提交 `96b05e39429a500ddfce2b160466a87ed75b2d4f`；本分支没有改动根目录 HTML/JavaScript/CSS，也不部署官网。

## 运行

安装 Godot **4.7.1 .NET** 与 .NET SDK（8 或更新），在仓库根目录：

```sh
dotnet build godot/CradlesOfCivilization.csproj
# 将 godot-mono 替换成你的 Godot .NET 可执行文件路径。
godot-mono --editor --path godot
```

Godot 导入图片后按 F6/F5，或直接运行 `godot-mono --path godot`。首次构建需要从 NuGet 恢复 Jint 4.16.4。正常游戏无需浏览器、Node.js、网页服务器或联网。

macOS 本机路径示例：

```sh
/Applications/Godot_mono.app/Contents/MacOS/Godot --path godot
```

## 可玩的内容

- 深石墨、旧金、羊皮纸色的原生桌面界面：顶部七项状态、左侧导航、地图舞台、右侧省份/政权/军团详情、底部年度观测、事件卡及记录窗口。
- 每局随机大陆，数字 seed 可复现：64 省、10 战略区、5 政治实体和真实道路邻接；建国时选发源省份。
- 政治/地形/军事图层、平面/2.5D 立体切换、省名、拖动/缩放/全图/定位；原生 CanvasItem 绘制，无逐省场景节点。
- 全部 21 项决议、6 种国家策略、军队选择/防守/进攻/征募/远征、AI 与战争迷雾。
- 自然增长、世界/特殊事件、经济危机、EERF 1–5、灾变火种与多代重启，自动分裂路线在窗口失焦后暂停。
- A–L 十二个完整结局：正文、单独的引用与出处行、终值/峰值、趋势、文明档案、逐年观测、领土军情；返回地图只读档案、导出终局、新世界。
- 建国设定与执政官肖像、状态趋势、编年筛选/分页、存档导入导出与确认覆盖。

地图：滚轮缩放、拖动平移、`+/-` 缩放、`Home/0` 全图、`F` 定位（地图获得焦点时）。决议按钮标明原版快捷键；输入框和弹窗内不触发决议。`Shift+N` 开新世界，`Shift+L` 清编年。

历史时间滑块只浏览过去观测，不回退模拟；每次执行决议推进一年。随机地图只使用地图种子，不消耗游戏规则 RNG。

## 规则与存档

`Native/Rules/` 是基准提交的只读副本，`source-manifest.json` 记录 SHA-256。C# `GameSession` 在进程内使用 Jint 执行该核心，通过公开命令和 JSON 快照驱动 Godot；界面、地图、图表、窗口与输入均为原生 Godot。此版不是将全部规则重新写成 C#，也没有嵌入 HTML/WebView。后续更新规则应明确更新副本和独立 Node 对照夹具，避免两套规则漂移。

新原生存储：`user://native-v11-storage.json`；显示偏好：`user://native-display.cfg`。导入/导出使用网页版相同的原始 `saveVersion:11` JSON，包含地图版本、seed、RNG、年度状态、军队与结局；导入恢复同一地图与规则 RNG，按网页版现有 v11 迁移规则读取。该迁移器会将政权 development/technology 四舍五入为整数，因此载入后的少量 AI 补兵值可能与不中断的游戏相差 1；原生与网页版载入行为一致，本次未改动这一既有规则。浏览器存档需从网页版导出后手动导入，无法自动读取浏览器存储。

旧 Godot `user://civilization-save.json` 为早期 C# 格式，保持原文件且不自动迁移。损坏的新存储也保留原件，恢复进度存入 `.recovered` 兄弟文件，下次启动继续读取恢复进度。无效/新版本存档不会替换当前游戏；写入先落临时文件再原子替换。

当前新界面文案为中文，结局保留中英文标题与完整双语目录；旧版 `Main.cs` / `Core/` 留作历史参考，不参与主场景运行。

## 验证

```sh
dotnet build godot/CradlesOfCivilization.csproj
godot-mono --headless --path godot -- --verify-native
# 真实场景测试使用独立内存进度，结果目录自行选择。
godot-mono --headless --path godot -- --native-smoke=/tmp/cradles-native-qa
# 去掉 --headless 会保存实际渲染截图。
```

规则测试从新建世界的公开 API 合法重放 A–L：**5,790** 条玩家命令、**74** 个独立 Node/Jint 状态对照点，检查地形、数值、RNG、战争结果、存档继续、终局重载与只读统计。证明每个结局存在一条可达路线，不表示任意种子均能抵达所有结局。UI smoke 检查设定/建国按钮、导航、决议、记录/数值弹窗与全部结局；地图检查 128 次平面/立体投影命中、缩放裁切和空闲不重绘。

可选的纯规则控制台测试（需要 .NET 10；不需要 Godot）：

```sh
dotnet run --project godot/Tests/Runner/NativeRulesRunner.csproj
```

夹具由 Node 在独立 VM 执行打包规则生成：

```sh
node godot/Tests/generate-native-fixtures.mjs
```

`Tests/native-fixtures.json` 包含合法路线与对照点；原验证报告第一次生成可作为可选目录参数提供。旧根目录 `scripts/test-godot-*` 验证历史无地图 C# 版本，不作为此版的检查入口。

## 性能与导出

地图只在状态、视图或尺寸改变时重画，视口外省份/标记裁切，地形预编译。四张肖像按使用加载并小量缓存；图表点数和记录分页有上限，避免成千原生节点与持续模糊。规则命令和 UI 更新发生在主线程；首启动解释器/生成地图及超长存档导入仍可能短暂停顿，大规模扩省之前应先量测并考虑规则线程。

已有 macOS Universal 与 Windows x86_64 导出预设，需要匹配的 **4.7.1 Mono** 模板：

```sh
godot-mono --headless --path godot --export-release "macOS Universal"
godot-mono --headless --path godot --export-release "Windows x86_64"
```

包输出到 `dist/`，不进入 Git。macOS 为 ad-hoc 签名，未 notarize；Windows 未使用发行证书。当前仅源代码分支同步到 GitHub，官网 HTML 不随原生分支发布。

第三方运行依赖与许可证见 `Native/THIRD_PARTY_NOTICES.txt`；原始游戏与美术仍属仓库原作者。
