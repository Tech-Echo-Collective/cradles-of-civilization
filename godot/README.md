# Godot 移植验证

这是网页版 `v0.3.6-web` 之后的最小 C# 竖切片，不是完整移植。

当前范围：

- 与网页版相同的初始五项指标；
- 与网页版相同的 LCG 种子算法；
- 基础年度漂移；
- 建造研究所、潜心苦修、扩建聚居地、均衡治理四个行动；
- Seed `1058` + `science` 的固定结果校验。

暂未移植：随机事件、特殊事件、地图、军事、存档、结局和导出流程。这样可以先验证 C# 核心与 Godot UI 的工作方式，再决定后续结构。

在仓库根目录运行：

```sh
dotnet build godot/CradlesOfCivilization.csproj
godot-mono --path godot
godot-mono --headless --path godot -- --verify-prototype
```
