const fs = require("fs");

const REGISTRY_RE =
  /"resolved":\s*"https?:\/\/(?!registry\.npmjs\.org\/)[^"]*?\/((?:@[^/]+\/)?[^/@]+\/-\/[^"]+\.tgz)"/g;
const LOCKFILES = ["npm-shrinkwrap.json", "firebase-vscode/package-lock.json"];

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
