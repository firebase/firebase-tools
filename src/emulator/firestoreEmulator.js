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
exports.FirestoreEmulator = void 0;
const chokidar = __importStar(require("chokidar"));
const fs = __importStar(require("fs"));
const clc = __importStar(require("colorette"));
const path = __importStar(require("path"));
const utils = __importStar(require("../utils"));
const downloadableEmulators = __importStar(require("./downloadableEmulators"));
const types_1 = require("../emulator/types");
const registry_1 = require("./registry");
const constants_1 = require("./constants");
class FirestoreEmulator {
    constructor(args) {
        this.args = args;
    }
    async start() {
        if (registry_1.EmulatorRegistry.isRunning(types_1.Emulators.FUNCTIONS)) {
            this.args.functions_emulator = registry_1.EmulatorRegistry.url(types_1.Emulators.FUNCTIONS).host;
        }
        if (this.args.rules && this.args.project_id) {
            const rulesPath = this.args.rules;
            this.rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
            this.rulesWatcher.on("change", async () => {
                // There have been some race conditions reported (on Windows) where reading the
                // file too quickly after the watcher fires results in an empty file being read.
                // Adding a small delay prevents that at very little cost.
                await new Promise((res) => setTimeout(res, 5));
                utils.logLabeledBullet("firestore", "Change detected, updating rules...");
                const newContent = fs.readFileSync(rulesPath, "utf8").toString();
                const issues = await this.updateRules(newContent);
                if (issues) {
                    for (const issue of issues) {
                        utils.logWarning(this.prettyPrintRulesIssue(rulesPath, issue));
                    }
                }
                if (issues.some((issue) => issue.severity === types_1.Severity.ERROR)) {
                    utils.logWarning("Failed to update rules");
                }
                else {
                    utils.logLabeledSuccess("firestore", "Rules updated.");
                }
            });
        }
        return downloadableEmulators.start(types_1.Emulators.FIRESTORE, this.args);
    }
    connect() {
        return Promise.resolve();
    }
    stop() {
        if (this.rulesWatcher) {
            this.rulesWatcher.close();
        }
        return downloadableEmulators.stop(types_1.Emulators.FIRESTORE);
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.FIRESTORE);
        const reservedPorts = this.args.websocket_port ? [this.args.websocket_port] : [];
        return {
            name: this.getName(),
            host,
            port,
            pid: downloadableEmulators.getPID(types_1.Emulators.FIRESTORE),
            reservedPorts: reservedPorts,
            webSocketHost: this.args.websocket_port ? host : undefined,
            webSocketPort: this.args.websocket_port ? this.args.websocket_port : undefined,
        };
    }
    getName() {
        return types_1.Emulators.FIRESTORE;
    }
    async updateRules(content) {
        const projectId = this.args.project_id;
        const body = {
            // Invalid rulesets will still result in a 200 response but with more information
            ignore_errors: true,
            rules: {
                files: [
                    {
                        name: "security.rules",
                        content,
                    },
                ],
            },
        };
        const res = await registry_1.EmulatorRegistry.client(types_1.Emulators.FIRESTORE).put(`/emulator/v1/projects/${projectId}:securityRules`, body);
        if (res.body && Array.isArray(res.body.issues)) {
            return res.body.issues;
        }
        return [];
    }
    /**
     * Create a colorized and human-readable string describing a Rules validation error.
     * Ex: firestore:21:4 - ERROR expected 'if'
     */
    prettyPrintRulesIssue(filePath, issue) {
        const relativePath = path.relative(process.cwd(), filePath);
        const line = issue.sourcePosition.line || 0;
        const col = issue.sourcePosition.column || 0;
        return `${clc.cyan(relativePath)}:${clc.yellow(line)}:${clc.yellow(col)} - ${clc.red(issue.severity)} ${issue.description}`;
    }
}
exports.FirestoreEmulator = FirestoreEmulator;
//# sourceMappingURL=firestoreEmulator.js.map