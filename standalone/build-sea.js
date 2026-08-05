const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const standaloneDir = __dirname;
const distDir = path.join(standaloneDir, "dist");
const vendorDir = path.join(standaloneDir, "vendor");

const configPath = path.join(standaloneDir, "config.js");
if (!fs.existsSync(configPath)) {
  fs.copyFileSync(path.join(standaloneDir, "config.template.js"), configPath);
}

const esbuildBin = path.join(standaloneDir, "node_modules", ".bin", "esbuild");

function getNodeBinaryPath() {
  if (process.env.NODE_BIN && fs.existsSync(process.env.NODE_BIN)) {
    return process.env.NODE_BIN;
  }
  if (process.execPath && fs.existsSync(process.execPath) && process.execPath.endsWith("node")) {
    return process.execPath;
  }
  const nvmNode26 = "/Users/andrewheard/.nvm/versions/node/v26.6.0/bin/node";
  if (fs.existsSync(nvmNode26)) {
    return nvmNode26;
  }
  return process.execPath;
}

const hostNodeBin = getNodeBinaryPath();
console.log(`[build-sea] Using host Node binary: ${hostNodeBin}`);

console.log("[build-sea] 1. Bundling firepit JS with esbuild...");
const bundlePath = path.join(distDir, "firepit-bundle.js");
execSync(
  `"${esbuildBin}" "${path.join(standaloneDir, "firepit.js")}" --bundle --platform=node --target=node26 --outfile="${bundlePath}"`,
  { stdio: "inherit", cwd: standaloneDir }
);

const welcomeSrc = path.join(standaloneDir, "welcome.js");
if (fs.existsSync(welcomeSrc)) {
  fs.copyFileSync(welcomeSrc, path.join(distDir, "welcome.js"));
}

console.log("[build-sea] 2. Packaging vendor directory...");
const vendorTarPath = path.join(distDir, "vendor.tar.gz");

// Ensure vendor bin directory contains standard Node binary
const vendorBinDir = path.join(vendorDir, "bin");
if (fs.existsSync(vendorDir)) {
  if (!fs.existsSync(vendorBinDir)) {
    fs.mkdirSync(vendorBinDir, { recursive: true });
  }
  const isWin = process.platform === "win32";
  const nodeBinName = isWin ? "node.exe" : "node";
  const targetNodeBin = path.join(vendorBinDir, nodeBinName);
  fs.copyFileSync(hostNodeBin, targetNodeBin);
  fs.chmodSync(targetNodeBin, 0o755);
  execSync(
    `tar -czf "${vendorTarPath}" --exclude="*.map" --exclude="*.md" --exclude="*.ts" --exclude="*.d.ts" --exclude="test" --exclude="tests" --exclude="docs" -C "${vendorDir}" .`,
    { stdio: "inherit" }
  );
} else {
  // Minimal dummy archive if vendor directory does not exist yet
  const tempVendor = path.join(distDir, "temp_vendor");
  fs.mkdirSync(tempVendor, { recursive: true });
  execSync(`tar -czf "${vendorTarPath}" -C "${tempVendor}" .`, { stdio: "inherit" });
  fs.rmSync(tempVendor, { recursive: true, force: true });
}

console.log("[build-sea] 3. Building Node 26 Single Executable Application...");
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
let arch = process.arch;
try {
  const fileOut = execSync(`file "${hostNodeBin}"`, { encoding: "utf8" });
  if (fileOut.includes("x86_64")) arch = "x64";
  else if (fileOut.includes("arm64")) arch = "arm64";
} catch (e) {}
let targetBinaryName = `firepit-${process.platform}-${arch}`;
if (isWin) targetBinaryName += ".exe";
const targetBinaryPath = path.join(distDir, targetBinaryName);

const seaConfigPath = path.join(distDir, "sea-config.json");
const seaConfig = {
  main: bundlePath,
  output: targetBinaryPath,
  executable: hostNodeBin,
  disableExperimentalSEAWarning: true,
  assets: {
    "vendor.tar.gz": vendorTarPath
  }
};
fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

// Native Node 26 --build-sea workflow
execSync(`"${hostNodeBin}" --build-sea "${seaConfigPath}"`, { stdio: "inherit" });

if (isMac) {
  console.log(`[build-sea] Ad-hoc signing macOS binary ${targetBinaryName}...`);
  execSync(`codesign --sign - --force "${targetBinaryPath}"`, { stdio: "inherit" });
}

fs.chmodSync(targetBinaryPath, 0o755);
console.log(`[build-sea] Successfully created SEA binary: ${targetBinaryPath}`);
