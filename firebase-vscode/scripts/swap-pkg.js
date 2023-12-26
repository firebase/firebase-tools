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

if (target === "vsce") {
  delete pkg.extensionDependencies;
  console.log(
    "Removing google.monospace extensionDependency for VSCE packaging."
  );
  pkg.contributes.configuration.properties['firebase.debug'].default = false;
  pkg.contributes.configuration.properties['firebase.debugLogPath'].default = "";
  console.log(
    "Setting default debug log settings to off for VSCE packaging."
  );
} else if (target === "monospace") {
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
