const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const REGISTRY_RE =
  /"resolved":\s*"https?:\/\/(?!registry\.npmjs\.org\/)[^"]*?\/((?:@[^/]+\/)?[^/@]+\/-\/[^"]+\.tgz)"/g;
const LOCKFILES = [
  path.join(ROOT_DIR, "npm-shrinkwrap.json"),
  path.join(ROOT_DIR, "firebase-vscode/package-lock.json"),
];

for (const file of LOCKFILES) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    const sanitized = content.replace(REGISTRY_RE, (_, packagePath) => {
      return `"resolved": "https://registry.npmjs.org/${packagePath}"`;
    });
    if (sanitized !== content) {
      fs.writeFileSync(file, sanitized, "utf8");
    }
  }
}
