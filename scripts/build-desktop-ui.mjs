import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const desktopDir = path.join(root, "dist", "desktop-ui");

const files = [
  "index.html",
  "ending.html",
  "endings.js",
  "game.js",
  "styles.css",
  "desktop.js"
];

await rm(desktopDir, { recursive: true, force: true });
await mkdir(desktopDir, { recursive: true });

await Promise.all(files.map(async (file) => {
  await copyFile(path.join(root, file), path.join(desktopDir, file));
}));

await writeFile(
  path.join(desktopDir, "ORIGINAL_WORK.txt"),
  [
    "Cradles Of Civilization / 文明摇篮",
    "Original concept: Noah Walker",
    "Desktop package build asset. Commercial redistribution requires permission.",
    ""
  ].join("\n"),
  "utf8"
);

console.log(`桌面前端已生成：${desktopDir}`);
