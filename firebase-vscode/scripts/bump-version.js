const { writeFileSync } = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const { argv } = require("yargs");
const semver = require("semver");
const pkg = require(path.join(__dirname, "../package.json"));

const releaseType = argv['release-type'];

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
