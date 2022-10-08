const { pathToFileURL } = require("url");

exports.dynamicImport = function(mod) {
    if (mod.startsWith("file://")) return import(mod);
    if (mod.startsWith("/")) return import(pathToFileURL(mod).toString());
    try {
        const path = require.resolve(mod);
        return import(pathToFileURL(path).toString());
    } catch(e) {
        return Promise.reject(e);
    }
}
