# 文明摇篮 / Cunabula Civilitatis · Godot

Tech Echo Collective 的文明循环策略小游戏，原创企划 Noah Walker。

本分支 **`godot-port`** 为 `0.5.0-alpha.5-godot.1`：Godot 原生桌面界面、随机大陆、2.5D 地形、完整领土军事与 A–L 十二个结局。规则基准对应 HTML 提交 `96b05e3`，通过进程内 Jint 复用已验证核心；地图、交互和界面由 Godot C# 实现，无浏览器或 WebView 依赖。

使用 **Godot 4.7.1 .NET**：

```sh
dotnet build godot/CradlesOfCivilization.csproj
godot-mono --editor --path godot
```

打开 `godot/project.godot`，按 F5 运行。详细玩法、存档互通、性能与双平台导出见 [Godot 说明](godot/README.md)。

```sh
godot-mono --headless --path godot -- --verify-native
godot-mono --headless --path godot -- --native-smoke=/tmp/cradles-native-qa
```

原生验证覆盖 5,790 条合法操作、74 个独立 Node/Jint 检查点和全部十二结局；场景测试覆盖地图投影/命中/裁切/空闲重绘、设定/建国、决议、记录与结局恢复。

HTML 主线继续位于 [`master`](https://github.com/Tech-Echo-Collective/cradles-of-civilization/tree/master)，官网试玩为 [techecho.org](https://techecho.org/games/cradles-of-civilization/)。本次原生移植没有改动或发布 HTML 文件；分支内旧根目录网页文件仅为历史参考。
