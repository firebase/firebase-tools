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
exports.createApp = void 0;
const cors = __importStar(require("cors"));
const express = __importStar(require("express"));
const emulatorLogger_1 = require("../emulatorLogger");
const types_1 = require("../types");
const bodyParser = __importStar(require("body-parser"));
const gcloud_1 = require("./apis/gcloud");
const firebase_1 = require("./apis/firebase");
const errors_1 = require("../auth/errors");
/**
 * @param defaultProjectId
 * @param emulator
 */
function createApp(defaultProjectId, emulator) {
    const { storageLayer } = emulator;
    const app = express();
    emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE).log("DEBUG", `Temp file directory for storage emulator: ${storageLayer.dirPath}`);
    // Return access-control-allow-private-network header if requested
    // Enables accessing locahost when site is exposed via tunnel see https://github.com/firebase/firebase-tools/issues/4227
    // Aligns with https://wicg.github.io/private-network-access/#headers
    // Replace with cors option if adopted, see https://github.com/expressjs/cors/issues/236
    app.use("/", (req, res, next) => {
        if (req.headers["access-control-request-private-network"]) {
            res.setHeader("access-control-allow-private-network", "true");
        }
        next();
    });
    // Enable CORS for all APIs, all origins (reflected), and all headers (reflected).
    // This is similar to production behavior. Safe since all APIs are cookieless.
    app.use(cors({
        origin: true,
        exposedHeaders: [
            "content-type",
            "x-firebase-storage-version",
            "X-Goog-Upload-Size-Received",
            "x-goog-upload-url",
            "x-goog-upload-command",
            "x-gupload-uploadid",
            "x-goog-upload-header-content-length",
            "x-goog-upload-header-content-type",
            "x-goog-upload-protocol",
            "x-goog-upload-status",
            "x-goog-upload-chunk-granularity",
            "x-goog-upload-control-url",
        ],
    }));
    app.use(bodyParser.raw({ limit: "130mb", type: "application/x-www-form-urlencoded" }));
    app.use(bodyParser.raw({ limit: "130mb", type: "multipart/related" }));
    app.use(express.json({
        type: ["application/json"],
    }));
    app.post("/internal/export", async (req, res) => {
        const initiatedBy = req.body.initiatedBy || "unknown";
        const path = req.body.path;
        if (!path) {
            res.status(400).send("Export request body must include 'path'.");
            return;
        }
        await storageLayer.export(path, { initiatedBy });
        res.sendStatus(200);
    });
    /**
     * Internal endpoint to overwrite current rules. Callers provide either a single set of rules to
     * be applied to all resources or an array of rules/resource objects.
     *
     * Example payload for single set of rules:
     *
     * ```
     * {
     *    rules: {
     *      files: [{ name: <string>, content: <string> }]
     *    }
     * }
     * ```
     *
     * Example payload for multiple rules/resource objects:
     *
     * ```
     * {
     *    rules: {
     *      files: [
     *        { name: <string>, content: <string>, resource: <string> },
     *        ...
     *      ]
     *    }
     * }
     * ```
     */
    app.put("/internal/setRules", async (req, res) => {
        const rulesRaw = req.body.rules;
        if (!(rulesRaw && Array.isArray(rulesRaw.files) && rulesRaw.files.length > 0)) {
            res.status(400).json({
                message: "Request body must include 'rules.files' array",
            });
            return;
        }
        const { files } = rulesRaw;
        function parseRulesFromFiles(files) {
            if (files.length === 1) {
                const file = files[0];
                if (!isRulesFile(file)) {
                    throw new errors_1.InvalidArgumentError("Each member of 'rules.files' array must contain 'name' and 'content'");
                }
                return { name: file.name, content: file.content };
            }
            const rules = [];
            for (const file of files) {
                if (!isRulesFile(file) || !file.resource) {
                    throw new errors_1.InvalidArgumentError("Each member of 'rules.files' array must contain 'name', 'content', and 'resource'");
                }
                rules.push({ resource: file.resource, rules: { name: file.name, content: file.content } });
            }
            return rules;
        }
        let rules;
        try {
            rules = parseRulesFromFiles(files);
        }
        catch (err) {
            if (err instanceof errors_1.InvalidArgumentError) {
                res.status(400).json({ message: err.message });
                return;
            }
            throw err;
        }
        const issues = await emulator.replaceRules(rules);
        if (issues.errors.length > 0) {
            res.status(400).json({
                message: "There was an error updating rules, see logs for more details",
            });
            return;
        }
        res.status(200).json({
            message: "Rules updated successfully",
        });
    });
    app.post("/internal/reset", (req, res) => {
        emulator.reset();
        res.sendStatus(200);
    });
    app.use("/v0", (0, firebase_1.createFirebaseEndpoints)(emulator));
    app.use("/", (0, gcloud_1.createCloudEndpoints)(emulator));
    return Promise.resolve(app);
}
exports.createApp = createApp;
function isRulesFile(file) {
    return (typeof file.name === "string" && typeof file.content === "string");
}
//# sourceMappingURL=server.js.map