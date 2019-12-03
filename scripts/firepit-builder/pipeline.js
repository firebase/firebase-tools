#!/usr/bin/env node
const shelljs = require("shelljs");
const path = require("path");
const argv = require("yargs").argv;
const { mkdir, cat, cd, rm, find, echo, exec, mv, ls, pwd, tempdir, cp } = shelljs;

const isPublishing = argv.publish;
const isLocalFirepit = argv.local;

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

const { hub, npm } = useCommands("hub", "npm" );

cd(tempdir());
rm("-rf", "firepit_pipeline");
mkdir("firepit_pipeline");
cd("firepit_pipeline");
const workdir = pwd();

npm("init", "-y");
npm("install", firebaseToolsPackage);

const packageJson = JSON.parse(cat("node_modules/firebase-tools/package.json"));
const releaseTag = `v${packageJson.version}`;
echo(`Installed firebase-tools@${packageJson.version}, using tag ${releaseTag}`);

if (isLocalFirepit) {
  echo("Using local firepit for testing...");
  mkdir("firepit");
  rm("-rf", path.join(__dirname, "../vendor/node_modules"));
  rm("-rf", path.join(__dirname, "../node_modules"));

  cp(path.join(__dirname, "../*.j*"), "firepit/");
  cp("-R", path.join(__dirname, "../vendor"), "firepit/vendor");
} else {
  echo("Attempting to use firebase-tools/standalone...");
  mv("node_modules/firebase-tools/standalone", "firepit");
  echo("Success!");
}

echo("Setting up firepit dev deps...");
cd("firepit");
npm("install");

echo("-- Installing new vendor/node_modules");
mkdir("-p", "vendor");
cd("vendor");
mv("../../node_modules", ".");

echo("-- Removing native platform addons (.node)");
find(".")
  .filter(function(file) {
    return file.match(/\.node$/);
  })
  .forEach((file) => {
    echo(file);
    rm(file);
  });
cd("..");
echo(pwd());

const configTemplate = cat("config.template.js").replace(
  "firebase_tools_package_value",
  firebaseToolsPackage
);

if (styles.headless) {
  echo("-- Building headless binaries...");

  const headlessConfig = configTemplate.replace("headless_value", "true");
  echo(headlessConfig).to("config.js");
  npm("run", "pkg");
  ls("dist/firepit-*").forEach((file) => {
    mv(file, path.join("dist", path.basename(file).replace("firepit", "firebase-tools")));
  });
}

if (styles.headful) {
  echo("-- Building headed binaries...");

  const headfulConfig = configTemplate.replace("headless_value", "false");
  echo(headfulConfig).to("config.js");
  npm("run", "pkg");

  ls("dist/firepit-*").forEach((file) => {
    mv(file, path.join("dist", path.basename(file).replace("firepit", "firebase-tools-instant")));
  });
}

if (isPublishing) {
  echo("Publishing...");
  const publishedFiles = [
    "firebase-tools-instant-win.exe",
    "firebase-tools-linux",
    "firebase-tools-macos",
    "firebase-tools-win.exe",
  ];

  hub("clone", "firebase/firebase-tools");
  cd("firebase-tools");

  ls("../dist").forEach((filename) => {
    if (publishedFiles.indexOf(filename) === -1) return;
    echo(`Publishing ${filename}...`);
    hub("release", "edit", "-m", '""', "-a", path.join("../dist", filename), releaseTag);
  });
  cd("..");
} else {
  echo("Skipping publishing...");
}

echo("-- Artifacts");
console.log(ls("-R", "dist").join("\n"));
rm("-rf", "/tmp/firepit_artifacts");
mv("dist", "/tmp/firepit_artifacts");

// Cleanup
cd("~");
rm("-rf", workdir);
