const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");
const shell = require("shelljs");

shell.config.fatal = true;

const NODE_VERSION = "24.18.0";

const targets = [
  {
    name: "macos",
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
    name: "linux",
    platform: "linux",
    arch: "x64",
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
    function get(url) {
      https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          get(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: status code ${response.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      }).on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }
    get(url);
  });
}

async function main() {
  console.log("Creating dist/ directory...");
  shell.mkdir("-p", "dist");
  shell.rm("-f", "dist/firepit.bundle.js", "dist/welcome.bundle.js", "dist/firepit-assets.tar.gz", "dist/sea-config.json", "dist/sea-prep.blob");
  shell.rm("-rf", "dist/dist_assets");
  targets.forEach(t => shell.rm("-f", path.join("dist", `firepit-${t.name}`)));

  console.log("Bundling firepit.js and welcome.js...");
  execSync("npx esbuild firepit.js --bundle --platform=node --external:node:sea --external:shelljs --external:chalk --outfile=dist/firepit.bundle.js", { stdio: "inherit" });
  execSync("npx esbuild welcome.js --bundle --platform=node --outfile=dist/welcome.bundle.js", { stdio: "inherit" });

  console.log("Preparing assets directory structure...");
  const assetsDir = "dist/dist_assets";
  shell.mkdir("-p", `${assetsDir}/lib`);
  shell.cp("-R", "vendor/node_modules", `${assetsDir}/lib/node_modules`);
  // Copy all node_modules (which includes npm, shelljs, chalk and their dependencies)
  shell.cp("-R", "node_modules", `${assetsDir}/node_modules`);
  
  // Clean up build/dev dependencies from assets
  shell.rm("-rf", `${assetsDir}/node_modules/esbuild`);
  shell.rm("-rf", `${assetsDir}/node_modules/postject`);
  shell.rm("-rf", `${assetsDir}/node_modules/.bin`);

  console.log("Archiving assets...");
  execSync(`tar -czf dist/firepit-assets.tar.gz -C ${assetsDir} lib node_modules`, { stdio: "inherit" });
  shell.rm("-rf", assetsDir);

  console.log("Writing sea-config.json...");
  const seaConfig = {
    main: "dist/firepit.bundle.js",
    output: "dist/sea-prep.blob",
    disableExperimentalSEAWarning: true,
    assets: {
      "welcome.js": "dist/welcome.bundle.js",
      "check.js": "check.js",
      "firepit-assets.tar.gz": "dist/firepit-assets.tar.gz"
    }
  };
  fs.writeFileSync("dist/sea-config.json", JSON.stringify(seaConfig, null, 2));

  const tempDownloads = "dist/temp_downloads";
  shell.mkdir("-p", tempDownloads);

  // 1. Download and extract all targets
  for (const target of targets) {
    const archiveName = `node-v${NODE_VERSION}-${target.platform}-${target.arch}.${target.ext}`;
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
    const dest = path.join(tempDownloads, archiveName);

    console.log(`Downloading Node.js binary for ${target.name} from ${url}...`);
    await downloadFile(url, dest);

    console.log(`Extracting ${archiveName}...`);
    const extractDir = path.join(tempDownloads, `extract-${target.name}`);
    shell.mkdir("-p", extractDir);
    execSync(`tar -xf "${dest}" -C "${extractDir}"`, { stdio: "inherit" });
  }

  // 2. Identify the host target to compile the blob
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  let hostTargetName;
  if (isWin) hostTargetName = "win.exe";
  else if (isMac) {
    hostTargetName = process.arch === "arm64" ? "macos-arm64" : "macos";
  } else {
    hostTargetName = "linux";
  }
  const hostTarget = targets.find(t => t.name === hostTargetName);
  if (!hostTarget) {
    throw new Error(`Failed to find target matching host platform: ${process.platform} ${process.arch}`);
  }

  const hostExtractDir = path.join(tempDownloads, `extract-${hostTarget.name}`);
  const hostFolderName = `node-v${NODE_VERSION}-${hostTarget.platform}-${hostTarget.arch}`;
  const hostNodeBinary = path.join(hostExtractDir, hostFolderName, hostTarget.binaryPath);

  console.log(`Generating SEA preparation blob using downloaded Node v${NODE_VERSION} binary at ${hostNodeBinary}...`);
  execSync(`"${hostNodeBinary}" --experimental-sea-config dist/sea-config.json`, { stdio: "inherit" });

  // 3. Inject blob and sign all targets
  for (const target of targets) {
    const extractDir = path.join(tempDownloads, `extract-${target.name}`);
    const folderName = `node-v${NODE_VERSION}-${target.platform}-${target.arch}`;
    const rawBinary = path.join(extractDir, folderName, target.binaryPath);
    const targetBinary = path.join("dist", `firepit-${target.name}`);

    console.log(`Injecting blob into ${targetBinary}...`);
    shell.cp(rawBinary, targetBinary);

    // Remove signature before injection (on macOS only)
    if (target.platform === "darwin" && process.platform === "darwin") {
      try {
        console.log(`Removing signature from ${targetBinary}...`);
        execSync(`codesign --remove-signature "${targetBinary}"`, { stdio: "inherit" });
      } catch (err) {
        console.warn(`Warning: failed to remove signature: ${err.message}`);
      }
    }

    // Inject blob using postject
    let postjectCmd = `npx postject "${targetBinary}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
    if (target.platform === "darwin") {
      postjectCmd += " --macho-segment-name NODE_SEA";
    }
    execSync(postjectCmd, { stdio: "inherit" });

    // Sign the binary if we are on macOS and the target is macos
    if (target.platform === "darwin" && process.platform === "darwin") {
      try {
        console.log(`Signing ${targetBinary}...`);
        execSync(`codesign --sign - "${targetBinary}"`, { stdio: "inherit" });
      } catch (err) {
        console.warn(`Warning: failed to sign binary: ${err.message}`);
      }
    }

    shell.chmod("+x", targetBinary);
  }

  console.log("Cleaning up temporary downloads...");
  shell.rm("-rf", tempDownloads);
  console.log("SEA build complete!");
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
