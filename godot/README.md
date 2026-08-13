# Godot C# 无地图版

这是以网页版 `v0.3.6-web` 为规则基准的完整非地图、非军事移植。当前版本已经可以从新文明一直游玩到毁灭、EERF 继承、文明重启或 A–J 任一结局。

已迁移：

- 与网页版一致的 LCG 种子和年度结算顺序；
- 13 个年度行动，以及重启文明、结算结局两个状态行动；
- 39 个基础普通事件、全部情境事件、毁灭性灾变与 21 个 SPEC 特殊事件；
- 科学、神学、文学艺术、人口、经济、秩序、知识趋势和系统压力；
- EERF 1–5 级、灾前紧急施工、灾后人口/知识/趋势继承；
- 多代文明循环、隐藏连败路线与 A–J 全部结局；
- 新世界设置、难度、治理者、纪事、保存和读取；
- 1200×820 的完整可玩界面。

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

Godot 存档写入项目的 `user://civilization-save.json`。当前仓库没有提交平台导出模板或二进制安装包。
