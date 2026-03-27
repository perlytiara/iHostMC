/**
 * Generate latest.json for Tauri updater from built artifacts.
 *
 * Usage:
 *   node scripts/gen-latest-json.cjs --input-dir artifacts --output artifacts/latest.json
 *
 * Defaults:
 *   --input-dir src-tauri/target/release/bundle
 *   --output    src-tauri/target/release/bundle/nsis/latest.json
 */
const fs = require("fs");
const path = require("path");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;
const tag = process.env.GITHUB_REF?.startsWith("refs/tags/")
  ? process.env.GITHUB_REF.replace("refs/tags/", "")
  : `v${version}`;

function parseArgs(argv) {
  const args = {
    inputDir: path.join("src-tauri", "target", "release", "bundle"),
    output: path.join("src-tauri", "target", "release", "bundle", "nsis", "latest.json"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input-dir") args.inputDir = argv[i + 1];
    if (arg === "--output") args.output = argv[i + 1];
  }
  return args;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

function readSig(sigPath) {
  return fs.readFileSync(sigPath, "utf8").trim();
}

function toReleaseUrl(filename) {
  return `https://github.com/perlytiara/iHostMC/releases/download/${tag}/${filename}`;
}

const { inputDir, output } = parseArgs(process.argv.slice(2));
const allFiles = walkFiles(inputDir);
const byName = new Map(allFiles.map((filePath) => [path.basename(filePath), filePath]));

const platforms = {};

const windowsInstaller = `iHostMC_${version}_x64-setup.exe`;
const windowsSig = `${windowsInstaller}.sig`;
if (byName.has(windowsInstaller) && byName.has(windowsSig)) {
  platforms["windows-x86_64"] = {
    signature: readSig(byName.get(windowsSig)),
    url: toReleaseUrl(windowsInstaller),
  };
}

const macArmArchive = `iHostMC_${version}_aarch64.app.tar.gz`;
const macArmSig = `${macArmArchive}.sig`;
if (byName.has(macArmArchive) && byName.has(macArmSig)) {
  platforms["darwin-aarch64"] = {
    signature: readSig(byName.get(macArmSig)),
    url: toReleaseUrl(macArmArchive),
  };
}

const macIntelArchive = `iHostMC_${version}_x64.app.tar.gz`;
const macIntelSig = `${macIntelArchive}.sig`;
if (byName.has(macIntelArchive) && byName.has(macIntelSig)) {
  platforms["darwin-x86_64"] = {
    signature: readSig(byName.get(macIntelSig)),
    url: toReleaseUrl(macIntelArchive),
  };
}

if (Object.keys(platforms).length === 0) {
  throw new Error(
    `No updater-capable artifacts found in "${inputDir}". Expected signed NSIS or macOS app.tar.gz files.`
  );
}

const latest = {
  version,
  notes: "See GitHub release for details.",
  pub_date: new Date().toISOString().slice(0, 19) + "Z",
  platforms,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(latest, null, 2));
console.log("Wrote", output);
