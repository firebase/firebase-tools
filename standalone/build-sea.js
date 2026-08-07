const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");
const zlib = require("zlib");

const standaloneDir = __dirname;
const distDir = path.join(standaloneDir, "dist");
const vendorDir = path.join(standaloneDir, "vendor");
const tempDownloadsDir = path.join(distDir, "temp_downloads");

const configPath = path.join(standaloneDir, "config.js");
if (!fs.existsSync(configPath)) {
  const configTemplate = path.join(standaloneDir, "config.template.js");
  if (fs.existsSync(configTemplate)) {
    fs.copyFileSync(configTemplate, configPath);
  }
}

// Determine Host Node Binary
function getHostNodeBinary() {
  if (process.env.NODE_BIN && fs.existsSync(process.env.NODE_BIN)) {
    return process.env.NODE_BIN;
  }
  return process.execPath;
}

const hostNodeBin = getHostNodeBinary();
const rawHostVersion = execSync(`"${hostNodeBin}" -v`, { encoding: "utf8" }).trim();
const NODE_VERSION =
  process.env.TARGET_NODE_VERSION || rawHostVersion.replace(/^v/, "") || "26.7.0";

console.log(`[build-sea] Using Host Node: ${hostNodeBin} (${rawHostVersion})`);
console.log(`[build-sea] Packaging Target Node Version: v${NODE_VERSION}`);

// Targets configuration
const ALL_TARGETS = [
  {
    name: "linux",
    platform: "linux",
    arch: "x64",
    ext: "tar.gz",
    binaryPath: "bin/node"
  },
  {
    name: "macos-x64",
    platform: "darwin",
    arch: "x64",
    ext: "tar.gz",
    binaryPath: "bin/node"
  },
  {
    name: "macos-arm64",
    platform: "darwin",
    arch: "arm64",
    ext: "tar.gz",
    binaryPath: "bin/node"
  },
  {
    name: "win.exe",
    platform: "win",
    arch: "x64",
    ext: "zip",
    binaryPath: "node.exe"
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    function get(currentUrl) {
      https
        .get(currentUrl, response => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            get(response.headers.location);
            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download ${currentUrl}: HTTP ${response.statusCode}`));
            return;
          }
          const file = fs.createWriteStream(dest);
          response.pipe(file);
          file.on("finish", () => {
            file.close(resolve);
          });
        })
        .on("error", err => {
          fs.unlink(dest, () => reject(err));
        });
    }
    get(url);
  });
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  // Try unzip CLI first
  try {
    execSync(`unzip -q -o "${zipPath}" -d "${destDir}"`, { stdio: "ignore" });
    return;
  } catch (e) {
    // Try powershell on Windows
    if (process.platform === "win32") {
      execSync(
        `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        {
          stdio: "inherit"
        }
      );
      return;
    }
  }
  // Fallback: tar on modern systems can extract .zip
  try {
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "ignore" });
    return;
  } catch (e) {
    throw new Error(
      `Unable to extract zip archive at ${zipPath}: please ensure 'unzip' or 'tar' is installed.`
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const currentOnly = args.includes("--current-only");
  const skipDownload = args.includes("--skip-download");

  // Determine active targets
  let targets = ALL_TARGETS;
  if (currentOnly) {
    const isWin = process.platform === "win32";
    const isMac = process.platform === "darwin";
    let hostTargetName;
    if (isWin) hostTargetName = "win.exe";
    else if (isMac) hostTargetName = process.arch === "arm64" ? "macos-arm64" : "macos-x64";
    else hostTargetName = "linux";

    targets = ALL_TARGETS.filter(t => t.name === hostTargetName);
    console.log(`[build-sea] --current-only specified. Building target: ${hostTargetName}`);
  }

  // 1. Prepare dist directory and config.js
  fs.mkdirSync(distDir, { recursive: true });

  const repoRootDir = path.resolve(standaloneDir, "..");
  const repoPkg = JSON.parse(fs.readFileSync(path.join(repoRootDir, "package.json"), "utf8"));
  const configJsPath = path.join(standaloneDir, "config.js");
  const configContent = `module.exports = {
  headless: true,
  firebase_tools_package: "",
  firebase_tools_version: "${repoPkg.version}"
};\n`;
  fs.writeFileSync(configJsPath, configContent);
  console.log(`[build-sea] Generated config.js with firebase_tools_version: ${repoPkg.version}`);

  // 2. Bundle firepit.js and welcome.js with esbuild
  console.log("[build-sea] Step 1: Bundling JavaScript files with esbuild...");
  const firepitBundlePath = path.join(distDir, "firepit.bundle.js");
  const welcomeBundlePath = path.join(distDir, "welcome.bundle.js");

  execSync(
    `npx esbuild "${path.join(
      standaloneDir,
      "firepit.js"
    )}" --bundle --platform=node --target=node26 --external:node:sea --outfile="${firepitBundlePath}"`,
    { stdio: "inherit", cwd: standaloneDir }
  );

  execSync(
    `npx esbuild "${path.join(
      standaloneDir,
      "welcome.js"
    )}" --bundle --platform=node --target=node26 --outfile="${welcomeBundlePath}"`,
    { stdio: "inherit", cwd: standaloneDir }
  );

  // 3. Package assets tarball (firepit-assets.tar.gz)
  console.log("[build-sea] Step 2: Packaging assets into firepit-assets.tar.gz...");
  const assetsTarPath = path.join(distDir, "firepit-assets.tar.gz");
  const assetsDir = path.join(distDir, "dist_assets");
  fs.rmSync(assetsDir, { recursive: true, force: true });

  const assetsLibDir = path.join(assetsDir, "lib");
  const targetNodeModules = path.join(assetsLibDir, "node_modules");
  fs.mkdirSync(targetNodeModules, { recursive: true });

  if (fs.existsSync(path.join(vendorDir, "node_modules"))) {
    // Production release pipeline mode
    console.log("[build-sea] Using vendor/node_modules from pipeline...");
    execSync(
      `cp -R "${path.join(vendorDir, "node_modules")}"/* "${targetNodeModules}/"`
    );
  } else {
    // Clean production package mode for local dev builds
    console.log("[build-sea] Preparing clean production bundle from local repo...");
    const os = require("os");
    const tmpPackDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-pack-"));
    const repoRootDir = path.resolve(standaloneDir, "..");

    try {
      execSync(`npm pack --pack-destination="${tmpPackDir}"`, {
        cwd: repoRootDir,
        stdio: "ignore"
      });
      const packedTarball = fs.readdirSync(tmpPackDir).find(f => f.endsWith(".tgz"));

      if (packedTarball) {
        execSync(`npm init -y`, { cwd: tmpPackDir, stdio: "ignore" });
        execSync(
          `npm install --omit=dev --no-audit --no-fund "${path.join(tmpPackDir, packedTarball)}"`,
          {
            cwd: tmpPackDir,
            stdio: "ignore"
          }
        );
        const prodNodeModules = path.join(tmpPackDir, "node_modules");
        if (fs.existsSync(prodNodeModules)) {
          execSync(
            `cp -R "${prodNodeModules}"/* "${targetNodeModules}/" 2>/dev/null || true`
          );
        }
      }
    } finally {
      fs.rmSync(tmpPackDir, { recursive: true, force: true });
    }

    // Also include standalone runtime dependencies (like chalk, npm)
    const rootNodeModules = path.join(standaloneDir, "node_modules");
    if (fs.existsSync(rootNodeModules)) {
      execSync(
        `cp -R "${rootNodeModules}"/* "${targetNodeModules}/" 2>/dev/null || true`
      );
    }
  }

  // Clean build-only / dev tools from packaged assets
  if (fs.existsSync(targetNodeModules)) {
    fs.rmSync(path.join(targetNodeModules, "esbuild"), { recursive: true, force: true });
    fs.rmSync(path.join(targetNodeModules, ".bin"), { recursive: true, force: true });
  }

  try {
    execSync(`find "${assetsLibDir}" -name "*.node" -delete 2>/dev/null || true`, { stdio: "ignore" });
  } catch (e) {}

  execSync(
    `tar -czf "${assetsTarPath}" --exclude="*.map" --exclude="*.md" --exclude="*.ts" --exclude="*.d.ts" --exclude="test" --exclude="tests" --exclude="docs" -C "${assetsDir}" lib`,
    { stdio: "inherit" }
  );
  fs.rmSync(assetsDir, { recursive: true, force: true });

  // 4. Download & Extract Target Node Binaries
  console.log("[build-sea] Step 3: Preparing Target Node.js Binaries...");
  fs.mkdirSync(tempDownloadsDir, { recursive: true });

  const targetBinaries = {};

  for (const target of targets) {
    const extractDir = path.join(tempDownloadsDir, `extract-${target.name}`);
    const folderName = `node-v${NODE_VERSION}-${target.platform}-${target.arch}`;
    const binaryFullPath = path.join(extractDir, folderName, target.binaryPath);

    if (skipDownload && fs.existsSync(binaryFullPath)) {
      console.log(`[build-sea] Using cached binary for ${target.name}`);
      targetBinaries[target.name] = binaryFullPath;
      continue;
    }

    // Check if host matches target and we are building current only
    if (currentOnly && hostNodeBin && fs.existsSync(hostNodeBin)) {
      console.log(`[build-sea] Using host binary for ${target.name}: ${hostNodeBin}`);
      targetBinaries[target.name] = hostNodeBin;
      continue;
    }

    const archiveName = `node-v${NODE_VERSION}-${target.platform}-${target.arch}.${target.ext}`;
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
    const dest = path.join(tempDownloadsDir, archiveName);

    if (!fs.existsSync(dest)) {
      console.log(`[build-sea] Downloading ${archiveName} from ${url}...`);
      await downloadFile(url, dest);
    }

    console.log(`[build-sea] Extracting ${archiveName}...`);
    fs.mkdirSync(extractDir, { recursive: true });
    if (target.ext === "zip") {
      extractZip(dest, extractDir);
    } else {
      execSync(`tar -xf "${dest}" -C "${extractDir}"`, { stdio: "inherit" });
    }

    targetBinaries[target.name] = binaryFullPath;
  }

  // 5. Generate SEAs using native Node 26 --build-sea
  console.log("[build-sea] Step 4: Generating Single Executable Applications...");
  for (const target of targets) {
    const rawBinary = targetBinaries[target.name];
    if (!fs.existsSync(rawBinary)) {
      throw new Error(`Node binary for target ${target.name} not found at: ${rawBinary}`);
    }

    const outputBinaryName = `firepit-${target.name}`;
    const outputBinaryPath = path.join(distDir, outputBinaryName);

    const seaConfigPath = path.join(distDir, `sea-config-${target.name}.json`);
    const seaConfig = {
      main: firepitBundlePath,
      output: outputBinaryPath,
      executable: rawBinary,
      disableExperimentalSEAWarning: true,
      assets: {
        "welcome.js": welcomeBundlePath,
        "check.js": path.join(standaloneDir, "check.js"),
        "firepit-assets.tar.gz": assetsTarPath
      }
    };

    fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

    console.log(`[build-sea] Building SEA for ${target.name} -> ${outputBinaryPath}...`);
    execSync(`"${hostNodeBin}" --build-sea "${seaConfigPath}"`, { stdio: "inherit" });

    // Make binary executable
    try {
      fs.chmodSync(outputBinaryPath, 0o755);
    } catch (e) {}

    // Sign macOS binaries if on macOS
    if (process.platform === "darwin" && target.platform === "darwin") {
      try {
        console.log(`[build-sea] Signing ${outputBinaryName}...`);
        execSync(`codesign --sign - --force "${outputBinaryPath}"`, { stdio: "inherit" });
      } catch (err) {
        console.warn(
          `[build-sea] Warning: codesign failed for ${outputBinaryName}: ${err.message}`
        );
      }
    }
  }

  // 6. Create macOS Universal Binary if both x64 and arm64 targets exist
  const macX64Bin = path.join(distDir, "firepit-macos-x64");
  const macArm64Bin = path.join(distDir, "firepit-macos-arm64");
  const macUniversalBin = path.join(distDir, "firepit-macos");

  if (fs.existsSync(macX64Bin) && fs.existsSync(macArm64Bin)) {
    if (process.platform === "darwin") {
      console.log("[build-sea] Step 5: Creating macOS Universal 2 binary with lipo...");
      try {
        execSync(`lipo -create -output "${macUniversalBin}" "${macX64Bin}" "${macArm64Bin}"`, {
          stdio: "inherit"
        });
        execSync(`codesign --sign - --force "${macUniversalBin}"`, { stdio: "inherit" });
        fs.chmodSync(macUniversalBin, 0o755);
        console.log(`[build-sea] Created Universal binary: ${macUniversalBin}`);
      } catch (err) {
        console.warn(`[build-sea] Warning: Failed to create lipo universal binary: ${err.message}`);
      }
    } else {
      // On non-macOS hosts, symlink or copy arm64 or x64 to firepit-macos as default
      console.log("[build-sea] Step 5: Setting default firepit-macos binary...");
      fs.copyFileSync(macArm64Bin, macUniversalBin);
      fs.chmodSync(macUniversalBin, 0o755);
    }
  } else if (fs.existsSync(macArm64Bin) && !fs.existsSync(macUniversalBin)) {
    fs.copyFileSync(macArm64Bin, macUniversalBin);
    fs.chmodSync(macUniversalBin, 0o755);
  } else if (fs.existsSync(macX64Bin) && !fs.existsSync(macUniversalBin)) {
    fs.copyFileSync(macX64Bin, macUniversalBin);
    fs.chmodSync(macUniversalBin, 0o755);
  }

  // 7. Create firebase-tools-* aliases and generate SHA256SUMS.txt
  console.log("[build-sea] Step 6: Creating firebase-tools-* release aliases and SHA256 checksums...");
  const crypto = require("crypto");
  const sha256Lines = [];

  const binaryMappings = [
    { src: "firepit-linux", dest: "firebase-tools-linux" },
    { src: "firepit-macos", dest: "firebase-tools-macos" },
    { src: "firepit-macos-arm64", dest: "firebase-tools-macos-arm64" },
    { src: "firepit-macos-x64", dest: "firebase-tools-macos-x64" },
    { src: "firepit-win.exe", dest: "firebase-tools-win.exe" }
  ];

  for (const mapping of binaryMappings) {
    const srcPath = path.join(distDir, mapping.src);
    const destPath = path.join(distDir, mapping.dest);
    if (fs.existsSync(srcPath)) {
      if (srcPath !== destPath) {
        fs.copyFileSync(srcPath, destPath);
        fs.chmodSync(destPath, 0o755);
      }
      const data = fs.readFileSync(destPath);
      const hash = crypto.createHash("sha256").update(data).digest("hex");
      sha256Lines.push(`${hash}  ${mapping.dest}`);
    }
  }

  if (sha256Lines.length > 0) {
    const sha256FilePath = path.join(distDir, "SHA256SUMS.txt");
    fs.writeFileSync(sha256FilePath, sha256Lines.join("\n") + "\n");
    console.log(`[build-sea] Created checksums file: ${sha256FilePath}`);
  }

  console.log("\n[build-sea] Build completed successfully! Generated binaries in dist/:");
  fs.readdirSync(distDir)
    .filter(
      f =>
        (f.startsWith("firepit-") || f.startsWith("firebase-tools-") || f.endsWith(".txt")) &&
        !f.endsWith(".json") &&
        !f.endsWith(".js") &&
        !f.endsWith(".tar.gz")
    )
    .forEach(f => {
      const stat = fs.statSync(path.join(distDir, f));
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
      console.log(`  - dist/${f} (${sizeMB} MB)`);
    });
}

main().catch(err => {
  console.error("[build-sea] Build failed:", err);
  process.exit(1);
});
