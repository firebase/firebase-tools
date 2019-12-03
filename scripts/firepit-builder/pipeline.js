#!/usr/bin/env node
const shelljs = require("shelljs");
const path = require("path");
const argv = require('yargs').argv
const { mkdir, cat, cd, rm, find, echo, exec, mv, ls, pwd, tempdir, cp } = shelljs;

const isPublishing = argv.publish;
const isLocalFirepit = argv.local;

const styles = (argv.styles || "headless,headful").split(",").map((s) => s.trim()).reduce((m, v) => {
  m[v] = true;
  return m;
}, {});
const firebase_tools_package = argv.package || "firebase-tools@latest";

shelljs.config.fatal = true;

const use_commands = (...executables) =>
    executables.forEach(
        name => (global[name] = (...args) => exec([name, ...args].join(" ")))
    );

use_commands("hub", "npm", "wget", "tar", "git");

cd(tempdir());
rm("-rf", "firepit_pipeline");
mkdir("firepit_pipeline");
cd("firepit_pipeline");
const workdir = pwd();

npm("init", "-y");
npm("install", firebase_tools_package);

const package_json = JSON.parse(cat("node_modules/firebase-tools/package.json"));
const release_tag = `v${package_json.version}`;
echo(`Installed firebase-tools@${package_json.version}, using tag ${release_tag}`);

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
    .forEach(file => {
      echo(file);
      rm(file);
    });
cd("..");
echo(pwd());

const config_template = cat("config.template.js").replace(
    "firebase_tools_package_value",
    firebase_tools_package
);

if (styles.headless) {
  echo("-- Building headless binaries...");

  const headless_config = config_template.replace(
      "headless_value",
      "true"
  );
  echo(headless_config).to("config.js");
  npm("run", "pkg");
  ls("dist/firepit-*").forEach(file => {
    mv(
        file,
        path.join(
            "dist",
            path.basename(file).replace("firepit", "firebase-tools")
        )
    );
  });
}

if (styles.headful) {
  echo("-- Building headed binaries...");

  const headful_config = config_template.replace(
      "headless_value",
      "false"
  );
  echo(headful_config).to("config.js");
  npm("run", "pkg");

  ls("dist/firepit-*").forEach(file => {
    mv(
        file,
        path.join(
            "dist",
            path.basename(file).replace("firepit", "firebase-tools-instant")
        )
    );
  });
}

if (isPublishing) {
  echo("Publishing...");
  const published_files = [
    "firebase-tools-instant-win.exe",
    "firebase-tools-linux",
    "firebase-tools-macos",
    "firebase-tools-win.exe"
  ]
  // Temporary hack to release to hub-release-playground instead of prod
  hub("clone", "firebase/firebase-tools");
  cd("firebase-tools");
  // EOHack

  ls("../dist").forEach((filename) => {
    if (published_files.indexOf(filename) === -1) return;
    echo(`Publishing ${filename}...`)
    hub("release", "edit", "-m", '""', "-a", path.join("../dist", filename), release_tag);
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
