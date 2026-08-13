# Godot 移植验证

这是网页版 `v0.3.6-web` 之后的最小 C# 竖切片，不是完整移植。

当前范围：

- 与网页版相同的初始指标；
- 与网页版相同的 LCG 种子算法；
- 基础年度漂移；
- 39 个基础普通事件及情境事件的标题、选择条件和数值效果；
- 人口承载、经济、秩序与知识互斥构成的系统压力；
- 建造研究所、潜心苦修、扩建聚居地、均衡治理四个行动；
- 9 组由网页版生成、由 C# 读取的跨语言结果校验，包含经济危机冻结边界。

当前的“普通事件”不包含文明毁灭灾变和 SPEC 特殊事件。暂未移植：灾变、特殊事件、知识趋势演化、地图、军事、存档、结局和导出流程。

对照数据由 `scripts/godot-parity-fixtures.mjs` 直接读取网页版源码生成。网页版规则变化后，校验会提醒固定数据已经过期，避免两套逻辑悄悄分叉。

在仓库根目录运行：

```sh
npm run test:godot-fixtures
dotnet build godot/CradlesOfCivilization.csproj
godot-mono --path godot
godot-mono --headless --path godot -- --verify-prototype
```
