# Godot C# 无地图版（v0.4.0-alpha.1）

这是以网页版 `v0.3.6-web` 为规则基准的完整非地图、非军事移植。当前版本已经可以从新文明一直游玩到毁灭、EERF 继承、文明重启或 A–J 任一结局。

已迁移：

- 与网页版一致的 LCG 种子和年度结算顺序；
- 13 个年度行动，以及重启文明、结算结局两个状态行动；
- 39 个基础普通事件、全部情境事件、毁灭性灾变与 21 个 SPEC 特殊事件；
- 科学、神学、文学艺术、人口、经济、秩序、知识趋势和系统压力；
- EERF 1–5 级、灾前紧急施工、灾后人口/知识/趋势继承；
- 多代文明循环、隐藏连败路线与 A–J 全部结局；
- 与网页版一致的国度命名、难度、执政官三步开始流程，以及纪事、保存和读取；
- 默认最大化并适配屏幕尺寸的纵向滚动界面，恢复网页版的身份栏、双终端、特殊事件横幅、六张状态仪表、分组行动卡、编年史与文明系统视觉结构。

本阶段明确不包含：地图、政治实体、领土交互、军队与战争、军事行动，以及依赖地图/军事的 K、L 结局。为保持网页版经济模型的基准值，系统压力仍按初始五块领土计算，但玩家不会看到或操作地图。

验证分三层：

- 9 组固定夹具防止普通年度规则悄悄漂移；
- 47 组由网页版实时生成的跨语言结果，覆盖全部非军事行动、行动锁定边界、治理者效果、全部 SPEC 事件、灾变、EERF 继承和重启；
- Godot 内部完整循环检查，覆盖保存/读取、18 代隐藏结局和 A–J 全部结局。

在仓库根目录运行：

```sh
npm run test:godot-fixtures
npm run test:godot-full
dotnet build godot/CradlesOfCivilization.csproj
godot-mono --headless --path godot -- --verify-prototype
godot-mono --headless --path godot -- --verify-complete
godot-mono --path godot
```

Godot 存档写入项目的 `user://civilization-save.json`。仓库只提交可复用的导出预设；Godot 官方二进制模板和生成的试玩包不会进入 Git。

## 导出试玩包

安装与 Godot `4.7.1 .NET` 完全匹配的官方 Mono 导出模板后，在仓库根目录运行：

```sh
/Applications/Godot_mono.app/Contents/MacOS/Godot --headless --path godot --export-release "macOS Universal"
/Applications/Godot_mono.app/Contents/MacOS/Godot --headless --path godot --export-release "Windows x86_64"
```

两个可直接分发的 ZIP 会写入 `dist/`。macOS 包为 Intel/Apple Silicon 通用构建并使用系统 `codesign` 的 ad-hoc 签名；Windows 包面向 x86_64。`dist/` 和本机导出模板均不进入 Git。

这是内部 Alpha 基线，尚未购买平台发行证书，也未做 Apple notarization。macOS 从聊天软件或浏览器下载后可能需要右键应用选择“打开”；Windows 首次启动可能出现 SmartScreen 提示。正式对外发布前再补双平台签名，不在本阶段提前引入证书管理。
