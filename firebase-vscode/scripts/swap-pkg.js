const { writeFileSync } = require("fs");
const path = require("path");
const pkg = require(path.join(__dirname, "../package.json"));


pkg.contributes.configuration.properties["firebase.debug"].default = true;
pkg.contributes.configuration.properties["firebase.debugLogPath"].default =
  "/tmp/firebase-plugin.log";

writeFileSync(
  path.join(__dirname, "../package.json"),
  JSON.stringify(pkg, null, 2),
  { encoding: "utf8" }
);
