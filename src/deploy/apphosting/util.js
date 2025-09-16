"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArchive = void 0;
const archiver = __importStar(require("archiver"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tmp = __importStar(require("tmp"));
const error_1 = require("../../error");
const fsAsync = __importStar(require("../../fsAsync"));
/**
 * Locates the source code for a backend and creates an archive to eventually upload to GCS.
 * Based heavily on functions upload logic in src/deploy/functions/prepareFunctionsUpload.ts.
 */
async function createArchive(config, projectRoot) {
    const tmpFile = tmp.fileSync({ prefix: `${config.backendId}-`, postfix: ".zip" }).name;
    const fileStream = fs.createWriteStream(tmpFile, {
        flags: "w",
        encoding: "binary",
    });
    const archive = archiver("zip");
    if (!projectRoot) {
        projectRoot = process.cwd();
    }
    // We must ignore firebase-debug.log or weird things happen if you're in the public dir when you deploy.
    const ignore = config.ignore || ["node_modules", ".git"];
    ignore.push("firebase-debug.log", "firebase-debug.*.log");
    const gitIgnorePatterns = parseGitIgnorePatterns(projectRoot);
    ignore.push(...gitIgnorePatterns);
    try {
        const files = await fsAsync.readdirRecursive({
            path: projectRoot,
            ignore: ignore,
            isGitIgnore: true,
        });
        for (const file of files) {
            const name = path.relative(projectRoot, file.name);
            archive.file(file.name, {
                name,
                mode: file.mode,
            });
        }
        await pipeAsync(archive, fileStream);
    }
    catch (err) {
        throw new error_1.FirebaseError("Could not read source directory. Remove links and shortcuts and try again.", { original: err, exit: 1 });
    }
    return { projectSourcePath: projectRoot, zippedSourcePath: tmpFile };
}
exports.createArchive = createArchive;
function parseGitIgnorePatterns(projectRoot, gitIgnorePath = ".gitignore") {
    const absoluteFilePath = path.resolve(projectRoot, gitIgnorePath);
    if (!fs.existsSync(absoluteFilePath)) {
        return [];
    }
    const lines = fs
        .readFileSync(absoluteFilePath)
        .toString() // Buffer -> string
        .split("\n") // split into lines
        .map((line) => line.trim())
        .filter((line) => !line.startsWith("#") && !(line === "")); // remove comments and empty lines
    return lines;
}
async function pipeAsync(from, to) {
    from.pipe(to);
    await from.finalize();
    return new Promise((resolve, reject) => {
        to.on("finish", resolve);
        to.on("error", reject);
    });
}
//# sourceMappingURL=util.js.map