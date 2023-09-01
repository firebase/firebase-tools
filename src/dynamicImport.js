const { pathToFileURL } = require("url");

// If being compiled with webpack, use non webpack require for these calls.
// (VSCode plugin uses webpack which by default replaces require calls
// with its own require, which doesn't work on files)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const requireFunc =
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore prevent VSCE webpack from erroring on non_webpack_require
  // eslint-disable-next-line camelcase
  typeof __webpack_require__ === "function" ? __non_webpack_require__ : require;

exports.dynamicImport = function(mod) {
    if (mod.startsWith("file://")) return import(mod);
    if (mod.startsWith("/")) return import(pathToFileURL(mod).toString());
    try {
        const path = requireFunc.resolve(mod);
        return import(pathToFileURL(path).toString());
    } catch(e) {
        return Promise.reject(e);
    }
}
