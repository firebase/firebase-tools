const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const REGISTRY_RE =
  /"resolved":\s*"https?:\/\/(?!registry\.npmjs\.org\/)[^"]*?\/(?:(@[^/]+)\/)?([^/@]+)\/-\/(?:@[^/]+\/)?([^"/]+\.tgz)"/g;
const LOCKFILES = [
  path.join(ROOT_DIR, "npm-shrinkwrap.json"),
  path.join(ROOT_DIR, "firebase-vscode/package-lock.json"),
];

/**
 * Rewrites non-npmjs tarball URLs in lockfile content to https://registry.npmjs.org/.
 * @param {string} content Raw lockfile JSON content.
 * @return {string} Sanitized lockfile JSON content.
 */
function sanitizeLockfileContent(content) {
  return content.replace(REGISTRY_RE, (_, scope, pkg, tarball) => {
    const pkgPath = scope ? `${scope}/${pkg}/-/${tarball}` : `${pkg}/-/${tarball}`;
    return `"resolved": "https://registry.npmjs.org/${pkgPath}"`;
  });
}

/**
 * Sanitizes all configured lockfiles in the repository.
 * @param {string[]} [files] Paths to lockfiles to sanitize.
 */
function sanitizeLockfiles(files = LOCKFILES) {
  for (const file of files) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, "utf8");
      const sanitized = sanitizeLockfileContent(content);
      if (sanitized !== content) {
        fs.writeFileSync(file, sanitized, "utf8");
      }
    }
  }
}

if (require.main === module) {
  sanitizeLockfiles();
}

module.exports = {
  REGISTRY_RE,
  LOCKFILES,
  sanitizeLockfileContent,
  sanitizeLockfiles,
};
