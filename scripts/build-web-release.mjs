import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const ui = join(root, "ui-shell");
const built = join(ui, "dist");
const dist = join(root, "dist");
const destination = join(dist, "web-release");
const skipBuild = process.argv.includes("--skip-build");
assert.ok(
  process.argv.slice(2).every((argument) => argument === "--skip-build"),
  "Only --skip-build is supported",
);

// Fixed, non-symlinked output locations keep cleanup away from source/checkouts.
function assertDirectory(path) {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (!info) return;
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), "Expected a real directory: " + path);
}
assertDirectory(ui);
assertDirectory(built);
assertDirectory(dist);
assertDirectory(destination);
assert.equal(dirname(destination), dist);

if (!skipBuild) {
  const vite = join(ui, "node_modules", "vite", "bin", "vite.js");
  assert.ok(existsSync(vite), "Install ui-shell dependencies before building the web release");
  const result = spawnSync(process.execPath, [vite, "build", "--outDir", built, "--emptyOutDir"], {
    cwd: ui,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "The React production build failed");
}

function filesUnder(directory) {
  assertDirectory(directory);
  assert.ok(existsSync(directory), "Missing source directory: " + directory);
  const files = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      assert.ok(!entry.isSymbolicLink(), "Symlinks are not allowed in release inputs: " + full);
      if (entry.isDirectory()) walk(full);
      else {
        assert.ok(entry.isFile(), "Unsupported release input: " + full);
        files.push(full);
      }
    }
  }
  walk(directory);
  return files.sort();
}

const productionIndex = readFileSync(join(built, "index.html"), "utf8");
assert.match(
  productionIndex,
  /<script\b[^>]*type=["']module["'][^>]*>/i,
  "Missing production module entry",
);
assert.doesNotMatch(productionIndex, /["']\/?src\//, "A development entry cannot be released");
assert.match(productionIndex, /\.\/assets\/[^"']+\.js/, "Expected relative Vite entry paths");

const inputs = new Map();
function add(source, target) {
  assert.ok(
    !isAbsolute(target) && !target.split(/[\\/]/).includes(".."),
    "Invalid output path: " + target,
  );
  assert.ok(existsSync(source) && lstatSync(source).isFile(), "Missing source file: " + source);
  assert.ok(
    !inputs.has(target),
    "Release asset collision: " + target + "\n" + inputs.get(target) + "\n" + source,
  );
  inputs.set(target, source);
}
function addTree(source, prefix = "") {
  for (const file of filesUnder(source)) add(file, join(prefix, relative(source, file)));
}

// Legacy assets are reserved first: a Vite/public file may never overwrite one.
add(join(root, "index.html"), "legacy.html");
for (const file of [
  "ending.html",
  "game.js",
  "localization.js",
  "endings.js",
  "balance-model.js",
  "styles.css",
]) {
  add(join(root, file), file);
}
addTree(join(root, "assets"), "assets");
addTree(join(root, "map-lab"), "map-lab");
addTree(built);
assert.ok(!inputs.has("release.json"), "release.json is reserved for package metadata");

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const uiPackage = JSON.parse(readFileSync(join(ui, "package.json"), "utf8"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
function sourceValue(file, expression, label) {
  const match = readFileSync(join(root, file), "utf8").match(expression);
  assert.ok(match, "Cannot read " + label + " from " + file);
  return match[1];
}
const metadata = {
  title: "Cunabula Civilitatis",
  version: packageJson.version,
  sourceCommit: git("rev-parse", "HEAD"),
  sourceDirty: Boolean(git("status", "--porcelain")),
  generatedAt: new Date().toISOString(),
  buildMode: skipBuild ? "copy-existing-production-build" : "fresh-production-build",
  interface: {
    name: "CRADLES_GAME_ENGINE",
    presentation: "react",
    packageVersion: uiPackage.version,
  },
  saveVersion: Number(sourceValue("game.js", /const SAVE_VERSION = (\d+);/, "save version")),
  mapGeneratorVersion: sourceValue(
    "map-lab/map-generator.js",
    /const VERSION = ["']([^"']+)["'];/,
    "map generator version",
  ),
  legacyGeometryRevision: sourceValue(
    "map-lab/map-data.js",
    /geometryRevision:\s*["']([^"']+)["']/,
    "legacy map revision",
  ),
  entries: {
    game: "index.html",
    legacy: "legacy.html",
    legacyEnding: "ending.html",
    mapLab: "map-lab/index.html",
  },
  packageAdjustments: [
    "The three legacy ending return/challenge URLs point to legacy.html; source files are unchanged.",
  ],
};

mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(join(dist, ".web-release-"));
assert.equal(dirname(staging), dist);
let checkedReferences = 0;
try {
  for (const [target, source] of inputs) {
    const output = join(staging, target);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(source, output);
    assert.ok(readFileSync(source).equals(readFileSync(output)), "Copy differs: " + target);
  }

  // Keep the traditional restart/seed-challenge chain inside its own entry.
  const legacyEndingPath = join(staging, "ending.html");
  const legacyEnding = readFileSync(legacyEndingPath, "utf8");
  const legacyReturn = /new URL\("index\.html", window\.location\.href\)/g;
  assert.equal(
    [...legacyEnding.matchAll(legacyReturn)].length,
    3,
    "Review changed legacy navigation before publishing",
  );
  writeFileSync(
    legacyEndingPath,
    legacyEnding.replace(legacyReturn, 'new URL("legacy.html", window.location.href)'),
  );

  function checkReference(reference, from, documentRelative = false) {
    const value = reference.trim().replaceAll("&amp;", "&");
    if (!value || /^[#?]/.test(value) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return;
    assert.ok(
      !value.startsWith("/"),
      "Root-relative link breaks subdirectory deployment: " + from + " → " + value,
    );
    const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (!pathname) return;
    const candidate = resolve(dirname(join(staging, from)), pathname);
    const candidates = (
      documentRelative ? [candidate, resolve(staging, pathname)] : [candidate]
    ).filter((path) => path === staging || path.startsWith(staging + sep));
    assert.ok(candidates.length, "Link escapes release: " + from + " → " + value);
    assert.ok(
      candidates.some((path) => existsSync(path) && statSync(path).isFile()),
      "Missing local resource: " + from + " → " + value,
    );
    checkedReferences += 1;
  }

  for (const [file] of inputs) {
    const extension = extname(file);
    if (![".html", ".css", ".js"].includes(extension)) continue;
    const source = readFileSync(join(staging, file), "utf8");
    if (extension === ".html") {
      for (const match of source.matchAll(/\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gs))
        checkReference(match[2], file);
    }
    if (extension !== ".js") {
      for (const match of source.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)'"\s]+))\s*\)/gs))
        checkReference(match[2] ?? match[3], file);
      for (const match of source.matchAll(/@import\s*(["'])([^"']+)\1/g))
        checkReference(match[2], file);
    }
    if (extension !== ".css") {
      for (const match of source.matchAll(
        /\bnew URL\(\s*(["'\x60])([^"'\x60]+)\1\s*,\s*(?:window\.location\.href|document\.baseURI|import\.meta\.url)/g,
      )) {
        if (!match[2].includes("$" + "{")) checkReference(match[2], file, extension === ".js");
      }
    }
    if (extension === ".js") {
      // Strictly resolve static/dynamic ESM imports next to their emitting chunk.
      for (const match of source.matchAll(
        /\b(?:from\s*|import\s*(?:\(\s*)?)(["'\x60])(\.{1,2}\/[^"'\x60]+)\1/g,
      )) {
        if (!match[2].includes("$" + "{")) checkReference(match[2], file);
      }
      // Includes Vite preload arrays and assets resolved by document.baseURI.
      for (const match of source.matchAll(
        /(["'\x60])((?:\.{1,2}\/|(?:assets|art|map|map-lab)\/)[^"'\x60\s<>]*\.(?:js|css|json|png|jpe?g|webp|avif|svg|woff2?)(?:[?#][^"'\x60\s]*)?)\1/g,
      )) {
        if (!match[2].includes("$" + "{")) checkReference(match[2], file, true);
      }
    }
  }

  for (const entry of Object.values(metadata.entries))
    assert.ok(inputs.has(entry), "Missing entry: " + entry);
  const chunks = [...inputs.keys()].filter(
    (file) => file.startsWith("assets" + sep) && /\.(js|css)$/.test(file),
  );
  assert.ok(chunks.length > 0, "No production chunks found");
  const inventory = [...inputs.keys()].sort().map((file) => {
    const contents = readFileSync(join(staging, file));
    return {
      path: file.split(sep).join("/"),
      bytes: contents.length,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  });
  writeFileSync(
    join(staging, "release.json"),
    JSON.stringify(
      { ...metadata, verification: { checkedReferences, chunks: chunks.length }, files: inventory },
      null,
      2,
    ) + "\n",
  );

  // Replace only this generated package after all validation succeeds.
  assertDirectory(destination);
  rmSync(destination, { recursive: true, force: true });
  renameSync(staging, destination);
  console.log("Web release " + metadata.version + ": " + destination);
  console.log(
    inventory.length +
      1 +
      " files; " +
      chunks.length +
      " production chunks; " +
      checkedReferences +
      " local references verified.",
  );
  console.log(
    "Source " +
      metadata.sourceCommit +
      (metadata.sourceDirty ? " (working tree contains uncommitted changes)" : ""),
  );
} finally {
  // staging is a unique directory created above, always directly under root/dist.
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
}
