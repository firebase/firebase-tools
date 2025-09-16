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
exports.AuthEmulator = exports.SingleProjectMode = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const utils = __importStar(require("../../utils"));
const constants_1 = require("../constants");
const emulatorLogger_1 = require("../emulatorLogger");
const types_1 = require("../types");
const server_1 = require("./server");
const error_1 = require("../../error");
const track_1 = require("../../track");
/**
 * An enum that dictates the behavior when the project ID in the request doesn't match the
 * defaultProjectId.
 */
var SingleProjectMode;
(function (SingleProjectMode) {
    SingleProjectMode[SingleProjectMode["NO_WARNING"] = 0] = "NO_WARNING";
    SingleProjectMode[SingleProjectMode["WARNING"] = 1] = "WARNING";
    SingleProjectMode[SingleProjectMode["ERROR"] = 2] = "ERROR";
})(SingleProjectMode = exports.SingleProjectMode || (exports.SingleProjectMode = {}));
class AuthEmulator {
    constructor(args) {
        this.args = args;
    }
    async start() {
        const { host, port } = this.getInfo();
        const app = await (0, server_1.createApp)(this.args.projectId, this.args.singleProjectMode);
        const server = app.listen(port, host);
        this.destroyServer = utils.createDestroyer(server);
    }
    async connect() {
        // No-op
    }
    stop() {
        return this.destroyServer ? this.destroyServer() : Promise.resolve();
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.AUTH);
        return {
            name: this.getName(),
            host,
            port,
        };
    }
    getName() {
        return types_1.Emulators.AUTH;
    }
    async importData(authExportDir, projectId, options) {
        void (0, track_1.trackEmulator)("emulator_import", {
            initiated_by: options.initiatedBy,
            emulator_name: types_1.Emulators.AUTH,
        });
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH);
        const { host, port } = this.getInfo();
        // TODO: In the future when we support import on demand, clear data first.
        const configPath = path.join(authExportDir, "config.json");
        const configStat = await stat(configPath);
        if (configStat?.isFile()) {
            logger.logLabeled("BULLET", "auth", `Importing config from ${configPath}`);
            await importFromFile({
                method: "PATCH",
                host: utils.connectableHostname(host),
                port,
                path: `/emulator/v1/projects/${projectId}/config`,
                headers: {
                    Authorization: "Bearer owner",
                    "Content-Type": "application/json",
                },
            }, configPath);
        }
        else {
            logger.logLabeled("WARN", "auth", `Skipped importing config because ${configPath} does not exist.`);
        }
        const accountsPath = path.join(authExportDir, "accounts.json");
        const accountsStat = await stat(accountsPath);
        if (accountsStat?.isFile()) {
            logger.logLabeled("BULLET", "auth", `Importing accounts from ${accountsPath}`);
            await importFromFile({
                method: "POST",
                host: utils.connectableHostname(host),
                port,
                path: `/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchCreate`,
                headers: {
                    Authorization: "Bearer owner",
                    "Content-Type": "application/json",
                },
            }, accountsPath, 
            // Ignore the error when there are no users. No action needed.
            { ignoreErrors: ["MISSING_USER_ACCOUNT"] });
        }
        else {
            logger.logLabeled("WARN", "auth", `Skipped importing accounts because ${accountsPath} does not exist.`);
        }
    }
}
exports.AuthEmulator = AuthEmulator;
function stat(path) {
    return new Promise((resolve, reject) => fs.stat(path, (err, stats) => {
        if (err) {
            if (err.code === "ENOENT") {
                return resolve(undefined);
            }
            return reject(err);
        }
        else {
            return resolve(stats);
        }
    }));
}
function importFromFile(reqOptions, path, options = {}) {
    const readStream = fs.createReadStream(path);
    return new Promise((resolve, reject) => {
        const req = http.request(reqOptions, (response) => {
            if (response.statusCode === 200) {
                resolve();
            }
            else {
                let data = "";
                response
                    .on("data", (d) => {
                    data += d.toString();
                })
                    .on("error", reject)
                    .on("end", () => {
                    const ignoreErrors = options?.ignoreErrors;
                    if (ignoreErrors?.length) {
                        let message;
                        try {
                            message = JSON.parse(data).error.message;
                        }
                        catch {
                            message = undefined;
                        }
                        if (message && ignoreErrors.includes(message)) {
                            return resolve();
                        }
                    }
                    return reject(new error_1.FirebaseError(`Received HTTP status code: ${response.statusCode}\n${data}`));
                });
            }
        });
        req.on("error", reject);
        readStream.pipe(req, { end: true });
    }).catch((e) => {
        throw new error_1.FirebaseError(`Error during Auth Emulator import: ${e.message}`, {
            original: e,
            exit: 1,
        });
    });
}
//# sourceMappingURL=index.js.map