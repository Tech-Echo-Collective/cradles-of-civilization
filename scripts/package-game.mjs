import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const packageName = "cradles-of-civilization";
const packageDir = join(dist, packageName);
const zipPath = join(dist, `${packageName}.zip`);
const files = [
  "index.html",
  "ending.html",
  "endings.js",
  "game.js",
  "desktop.js",
  "styles.css",
  "README.md"
];

rmSync(packageDir, { force: true, recursive: true });
rmSync(zipPath, { force: true });
mkdirSync(packageDir, { recursive: true });

files.forEach((file) => {
  cpSync(join(root, file), join(packageDir, file));
});

writeFileSync(
  join(packageDir, "START_HERE.txt"),
  [
    "文明摇篮 / Cradles Of Civilization",
    "原创企划 / Original concept: Noah Walker",
    "",
    "运行方式：",
    "1. 解压整个文件夹。",
    "2. 双击 index.html。",
    "3. 不要只单独发送 index.html；ending.html、game.js、endings.js、styles.css 需要和它放在同一层。",
    "",
    "存档说明：",
    "浏览器会把存档保存在本机本浏览器内。把 zip 发给朋友不会带走你的本地存档。",
    ""
  ].join("\n")
);

writeFileSync(
  join(packageDir, "ORIGINAL_WORK.txt"),
  [
    "Cradles Of Civilization / 文明摇篮",
    "Original concept: Noah Walker",
    "This package is a static share build generated from the local project.",
    "If this game is shared further, keep this attribution file with the HTML/CSS/JS files.",
    ""
  ].join("\n")
);

const zipResult = spawnSync("zip", ["-qr", zipPath, packageName], {
  cwd: dist,
  encoding: "utf8"
});

if (zipResult.error || zipResult.status !== 0 || !existsSync(zipPath)) {
  console.warn("打包文件夹已生成，但当前系统没有可用的 zip 命令。");
  console.warn(`文件夹位置：${packageDir}`);
  process.exitCode = 0;
} else {
  console.log(`打包完成：${zipPath}`);
}
