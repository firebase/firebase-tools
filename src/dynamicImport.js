import { pathToFileURL } from "url";

export function dynamicImport(mod) {
    if (mod.startsWith("file://")) return import(mod);
    if (mod.startsWith("/")) return import(pathToFileURL(mod).toString());
    try {
        const path = require.resolve(mod);
        return import(pathToFileURL(path).toString());
    } catch(e) {
        return Promise.reject(e);
    }
}
