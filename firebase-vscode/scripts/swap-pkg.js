const { writeFileSync } = require("fs");
const path = require("path");
const pkg = require(path.join(__dirname, "../package.json"));

let target = "vsce";

process.argv.forEach((arg) => {
  if (arg === "vsce" || arg === "monospace") {
    target = arg;
  }
});

if (target === "vsce") {
  delete pkg.extensionDependencies;
  console.log(
    "Removing google.monospace extensionDependency for VSCE" + " packaging."
  );
} else if (target === "monospace") {
  pkg.extensionDependencies = ["google.monospace"];
  console.log(
    "Adding google.monospace extensionDependency for Monospace" + " packaging."
  );
}

writeFileSync(
  path.join(__dirname, "../package.json"),
  JSON.stringify(pkg, null, 2),
  { encoding: "utf8" }
);
