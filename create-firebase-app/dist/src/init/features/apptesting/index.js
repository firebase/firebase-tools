"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actuate = exports.askQuestions = void 0;
const path_1 = require("path");
const prompt_1 = require("../../../prompt");
const templates_1 = require("../../../templates");
const ensureProjectConfigured_1 = require("../../../apptesting/ensureProjectConfigured");
const SMOKE_TEST_YAML_TEMPLATE = (0, templates_1.readTemplateSync)("init/apptesting/smoke_test.yaml");
// Prompts the developer about the App Testing service they want to init.
async function askQuestions(setup) {
    var _a, _b;
    setup.featureInfo = Object.assign(Object.assign({}, setup.featureInfo), { apptesting: {
            testDir: ((_b = (_a = setup.featureInfo) === null || _a === void 0 ? void 0 : _a.apptesting) === null || _b === void 0 ? void 0 : _b.testDir) ||
                (await (0, prompt_1.input)({
                    message: "What do you want to use as your test directory?",
                    default: "tests",
                })),
        } });
    if (setup.projectId) {
        await (0, ensureProjectConfigured_1.ensureProjectConfigured)(setup.projectId);
    }
}
exports.askQuestions = askQuestions;
// Writes App Testing product specific configuration info.
async function actuate(setup, config) {
    var _a;
    const info = (_a = setup.featureInfo) === null || _a === void 0 ? void 0 : _a.apptesting;
    if (!info) {
        throw new Error("App Testing feature RequiredInfo is not provided");
    }
    const testDir = info.testDir;
    config.set("apptesting.testDir", testDir);
    await config.askWriteProjectFile((0, path_1.join)(testDir, "smoke_test.yaml"), SMOKE_TEST_YAML_TEMPLATE);
}
exports.actuate = actuate;
