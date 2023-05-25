const { writeFileSync } = require("fs");
const path = require('path');
const pkg = require(path.join(__dirname, "../package.json"));

let target = 'vsce';

process.argv.forEach(arg => {
  if (arg === 'vsce' || arg === 'monospace') {
    target = arg;
  }
});

if (target === 'vsce') {
  delete pkg.extensionDependencies;
  console.log(JSON.stringify(pkg, null, 2));
} else if (target === 'monospace') {
  pkg.extensionDependencies = ["google.monospace"];
}

console.log(__dirname);

writeFileSync(path.join(__dirname, "../package.json"), JSON.stringify(pkg, null, 2), { encoding: 'utf8' });