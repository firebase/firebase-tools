const { writeFileSync } = require("fs");
const path = require("path");
const pkg = require(path.join(__dirname, "../package.json"));

// Swaps package.json config as appropriate for packaging for
// Monospace or VSCE marketplace.

// TODO(chholland): Don't overwrite the real package.json file and
// create a generated one in dist/ - redo .vscodeignore to package
// dist/

let target = "vsce";

process.argv.forEach((arg) => {
  if (arg === "vsce" || arg === "monospace") {
    target = arg;
  }
});

/**
 * These settings override defaults in package.json. If the defaults
 * should be the same in both the standalone and IDX build, there's no
 * need to include them in the swap set here.
 */
const SETTINGS = {
  /**
   * Settings for standalone extension
   */
  vsce: {
    "firebase.debug": false,
    "firebase.debugLogPath": "",
    "firebase.features.enableFrameworks": false,
    "firebase.features.enableHosting": false,
  },
  /**
   * Settings for IDX
   */
  monospace: {
    "firebase.debug": true,
    "firebase.debugLogPath": "/tmp/firebase-plugin.log",
    "firebase.features.enableFrameworks": true,
    "firebase.features.enableHosting": true,
  }
};

function assignDefaultSettings(pkg, target) {
  console.log(`Setting default settings for: ${target}`);
  const newDefaultSettings = SETTINGS[target];
  for (const settingField in newDefaultSettings) {
    console.log(`Setting: [${settingField}]: ${newDefaultSettings[settingField]}`);
    pkg.contributes.configuration.properties[settingField].default = newDefaultSettings[settingField];
  }
}

if (target === "vsce") {
  delete pkg.extensionDependencies;
  console.log(
    "Removed google.monospace extensionDependency for VSCE packaging."
  );
} else if (target === "monospace") {
  pkg.extensionDependencies = ["google.monospace"];
  console.log(
    "Added google.monospace extensionDependency for Monospace packaging."
  );
}
assignDefaultSettings(pkg, target);

writeFileSync(
  path.join(__dirname, "../package.json"),
  JSON.stringify(pkg, null, 2),
  { encoding: "utf8" }
);
