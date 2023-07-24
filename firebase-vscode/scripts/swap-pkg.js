const { writeFileSync } = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const { argv } = require("yargs");
const semver = require("semver");
const pkg = require(path.join(__dirname, "../package.json"));

// Swaps package.json config as appropriate for packaging for
// Monospace or VSCE marketplace.

// TODO(chholland): Don't overwrite the real package.json file and
// create a generated one in dist/ - redo .vscodeignore to package
// dist/

const releaseType = argv['release-type'];
const platform = argv.platform;

const currentVersion = pkg.version;

if (releaseType === 'canary') {
  const nextPatchVersion = semver.inc(currentVersion, 'patch');
  const headSha = execSync('git rev-parse --short HEAD').toString().trim();
  // Should we use sha or timestamp? Does sha read as always incrementing?
  // Pros: sha lets you trace back to the exact commit
  pkg.version = `${nextPatchVersion}-alpha.${headSha}`;

  writeFileSync(
    path.join(__dirname, "../package.json"),
    JSON.stringify(pkg, null, 2),
    { encoding: "utf8" }
  );
}

if (platform === "vsce") {
  delete pkg.extensionDependencies;
  console.log(
    "Removing google.monospace extensionDependency for VSCE packaging."
  );
  pkg.contributes.configuration.properties['firebase.debug'].default = false;
  pkg.contributes.configuration.properties['firebase.debugLogPath'].default = "";
  console.log(
    "Setting default debug log settings to off for VSCE packaging."
  );
} else if (platform === "monospace") {
  pkg.extensionDependencies = ["google.monospace"];
  console.log(
    "Adding google.monospace extensionDependency for Monospace packaging."
  );
  pkg.contributes.configuration.properties['firebase.debug'].default = true;
  pkg.contributes.configuration.properties['firebase.debugLogPath'].default =
    "/tmp/firebase-plugin.log";
  console.log(
    "Setting default debug log settings to on for Monospace packaging."
  );
}

writeFileSync(
  path.join(__dirname, "../package.json"),
  JSON.stringify(pkg, null, 2),
  { encoding: "utf8" }
);
