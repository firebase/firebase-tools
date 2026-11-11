#!/usr/bin/env node
const shelljs = require("shelljs");
const path = require("path");
const fs = require("fs");
const argv = require("yargs").argv;
const { mkdir, cat, cd, rm, find, echo, exec, mv, ls, pwd, tempdir, cp } = shelljs;

const isPublishing = argv.publish;

const styles = (argv.styles || "headless,headful")
  .split(",")
  .map((s) => s.trim())
  .reduce((m, v) => {
    m[v] = true;
    return m;
  }, {});
const firebaseToolsPackage = argv.package || "firebase-tools@latest";

shelljs.config.fatal = true;

const useCommands = (...executables) =>
  executables.reduce((obj, name) => {
    obj[name] = (...args) => exec([name, ...args].join(" "));
    return obj;
  }, {});

const { hub, npm } = useCommands("hub", "npm");

/**
 * Compares two MAJOR.MINOR.PATCH release versions.
 * Throws on anything else (e.g. prereleases), since we can't safely order those here.
 * @param {string} a version to compare.
 * @param {string} b version to compare against.
 * @return {number} positive if a is newer than b, negative if older, and 0 if equal.
 */
function compareReleaseVersions(a, b) {
  const parse = (v) => {
    if (!/^\d+\.\d+\.\d+$/.test(v || "")) {
      throw new Error(`Expected a MAJOR.MINOR.PATCH version, got "${v}"`);
    }
    return v.split(".").map(Number);
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

cd(tempdir());
rm("-rf", "firepit_pipeline");
mkdir("firepit_pipeline");
cd("firepit_pipeline");
const workdir = pwd();

npm("init", "-y");

if (fs.existsSync(firebaseToolsPackage)) {
  cd(firebaseToolsPackage);
  npm("pack");
  cd(workdir);
  const packedModule = ls(path.join(firebaseToolsPackage, "*.tgz"))[0];
  npm("install", packedModule);
  rm(packedModule);
} else {
  npm("install", "--omit=dev", firebaseToolsPackage);
}

const packageJson = JSON.parse(cat("node_modules/firebase-tools/package.json"));
const releaseTag = `v${packageJson.version}`;
echo(`Installed firebase-tools@${packageJson.version}, using tag ${releaseTag}`);

echo("Attempting to use firebase-tools/standalone...");
cp("-r", "node_modules/firebase-tools/standalone", "firepit");
echo("Success!");

echo("Setting up firepit dev deps...");
cd("firepit");
npm("install");

echo("-- Installing new vendor/node_modules");
mkdir("-p", "vendor");
cd("vendor");
mv("../../node_modules", ".");

echo("-- Removing native platform addons (.node)");
find(".")
  .filter(function (file) {
    return file.match(/\.node$/);
  })
  .forEach((file) => {
    echo(file);
    rm(file);
  });
cd("..");
echo(pwd());

const configTemplate = require(path.join(pwd().toString(), "config.template.js"));
configTemplate.firebase_tools_package = firebaseToolsPackage;

if (styles.headless) {
  echo("-- Building headless binaries...");

  configTemplate.headless = true;
  echo(`module.exports = ` + JSON.stringify(configTemplate)).to("config.js");
  npm("run", "pkg");
  ls("dist/firepit-*").forEach((file) => {
    mv(file, path.join("dist", path.basename(file).replace("firepit", "firebase-tools")));
  });
}

if (styles.headful) {
  echo("-- Building headed binaries...");

  configTemplate.headless = false;
  echo(`module.exports = ` + JSON.stringify(configTemplate)).to("config.js");
  npm("run", "pkg");

  ls("dist/firepit-*").forEach((file) => {
    mv(file, path.join("dist", path.basename(file).replace("firepit", "firebase-tools-instant")));
  });
}

if (isPublishing) {
  echo("Publishing standalone artifacts and GitHub release...");
  const publishedFiles = [
    "firebase-tools-instant-win.exe",
    "firebase-tools-linux",
    "firebase-tools-macos",
    "firebase-tools-win.exe",
  ];

  // 1. Verify all expected artifacts exist in dist
  publishedFiles.forEach((filename) => {
    const filePath = path.join("dist", filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Expected build artifact ${filename} not found at ${filePath}`);
    }
  });

  hub("clone", "firebase/firebase-tools");
  cd("firebase-tools");

  // 2. Attach standalone artifacts to the draft release created by publish.sh
  shelljs.config.fatal = false;
  const releaseCheck = exec(`hub release show "${releaseTag}"`, { silent: true });
  shelljs.config.fatal = true;

  // Fail rather than creating a replacement release: this step publishes the release
  // automatically, and a fresh release would go out without the CHANGELOG release notes.
  if (releaseCheck.code !== 0) {
    throw new Error(
      `Draft release ${releaseTag} not found. It should have been created by scripts/publish.sh: ${releaseCheck.stderr}`,
    );
  }
  echo(`Attaching standalone artifacts to release ${releaseTag}...`);
  publishedFiles.forEach((filename) => {
    echo(`Attaching ${filename}...`);
    hub(
      "release",
      "edit",
      "-m",
      '""',
      "-a",
      `"${path.join("../dist", filename)}"`,
      `"${releaseTag}"`,
    );
  });

  // 3. Validate that the draft release has all of the expected artifacts
  echo(`Validating that draft release ${releaseTag} has all expected artifacts...`);
  shelljs.config.fatal = false;
  const showResult = exec(`hub release show -f "%as" "${releaseTag}"`, { silent: true });
  shelljs.config.fatal = true;

  if (showResult.code !== 0) {
    throw new Error(`Failed to query release ${releaseTag}: ${showResult.stderr}`);
  }

  const attachedAssets = showResult.stdout
    .split("\n")
    .map((s) => s.trim().split(/[\t\s]/)[0])
    .filter(Boolean)
    .map((url) => path.basename(url));
  echo(`Found attached assets:\n${attachedAssets.map((a) => "  - " + a).join("\n")}`);

  const missing = publishedFiles.filter((f) => !attachedAssets.includes(f));
  if (missing.length > 0) {
    throw new Error(
      `Validation failed! Draft release ${releaseTag} is missing expected artifacts: ${missing.join(", ")}`,
    );
  }
  echo(`All ${publishedFiles.length} expected artifacts verified on draft release ${releaseTag}.`);

  // Verify artifact health via GitHub API if GITHUB_TOKEN is available
  if (process.env.GITHUB_TOKEN) {
    try {
      const repo = process.env.GITHUB_REPOSITORY || "firebase/firebase-tools";
      shelljs.config.fatal = false;
      const apiResult = exec(
        `curl -s -H "Authorization: token ${process.env.GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${repo}/releases"`,
        { silent: true },
      );
      shelljs.config.fatal = true;
      if (apiResult.code === 0 && apiResult.stdout) {
        const releases = JSON.parse(apiResult.stdout);
        if (Array.isArray(releases)) {
          const matchedRelease = releases.find((r) => r.tag_name === releaseTag);
          if (matchedRelease && Array.isArray(matchedRelease.assets)) {
            for (const expectedFile of publishedFiles) {
              const asset = matchedRelease.assets.find((a) => a.name === expectedFile);
              if (!asset) {
                throw new Error(`Artifact ${expectedFile} is missing from GitHub release assets.`);
              }
              if (asset.state !== "uploaded") {
                throw new Error(
                  `Artifact ${expectedFile} state is "${asset.state}", expected "uploaded".`,
                );
              }
              if (typeof asset.size === "number" && asset.size <= 0) {
                throw new Error(`Artifact ${expectedFile} has invalid size: ${asset.size}`);
              }
            }
            echo("Artifact upload states and sizes confirmed via GitHub API.");
          }
        }
      }
    } catch (apiErr) {
      if (apiErr.message && apiErr.message.startsWith("Artifact ")) {
        throw apiErr;
      }
      echo(`Notice: GitHub API detail check warning: ${apiErr.message}`);
    }
  }

  // 4. Publish the draft release
  echo(`Publishing release ${releaseTag}...`);
  hub("release", "edit", "--draft=false", "-m", '""', `"${releaseTag}"`);
  echo(`Successfully published release ${releaseTag}!`);

  // 5. Move the npm latest tag, but never backwards: re-running this pipeline for an
  // older version must not downgrade everyone who installs firebase-tools@latest.
  const registry = "https://wombat-dressing-room.appspot.com";
  const version = packageJson.version;
  const distTags = JSON.parse(
    exec(`npm view firebase-tools dist-tags --json --registry ${registry}`, { silent: true })
      .stdout,
  );
  const currentLatest = distTags.latest;
  const comparison = compareReleaseVersions(version, currentLatest);
  if (comparison > 0) {
    echo(`Moving npm latest tag from ${currentLatest} to firebase-tools@${version}...`);
    npm("dist-tag", "add", `"firebase-tools@${version}"`, "latest", "--registry", registry);
    echo(`Successfully moved npm latest tag to firebase-tools@${version}!`);
  } else if (comparison === 0) {
    echo(`npm latest tag already points to firebase-tools@${version}.`);
  } else {
    echo(
      `WARNING: Not moving npm latest tag: firebase-tools@${version} is older than the current latest (${currentLatest}).`,
    );
  }
  // Only clean up the staging tag if it belongs to this release, so we don't clobber a
  // newer release that's in flight. Intentionally don't fail if it can't be removed: by
  // this point the release is published, so a leftover staging tag is harmless and
  // gets overwritten by the next release.
  if (distTags.staging === version) {
    shelljs.config.fatal = false;
    npm("dist-tag", "rm", "firebase-tools", "staging", "--registry", registry);
    shelljs.config.fatal = true;
  }

  cd("..");
} else {
  echo("Skipping publishing...");
}

echo("-- Artifacts");
rm("-rf", "/tmp/firepit_artifacts");

const outputDir = path.join(tempdir().toString(), "firepit_artifacts");
echo(outputDir);
mkdir(outputDir);
mv("dist/*", outputDir);
cd(outputDir);
console.log(
  ls(".")
    .map((fn) => path.join(pwd().toString(), fn.toString()))
    .join("\n"),
);

// Cleanup
cd("~");
rm("-rf", workdir);
