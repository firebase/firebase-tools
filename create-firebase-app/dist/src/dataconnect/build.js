"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBuildErrors = exports.build = void 0;
const dataconnectEmulator_1 = require("../emulator/dataconnectEmulator");
const error_1 = require("../error");
const prompt_1 = require("../prompt");
const utils = require("../utils");
const graphqlError_1 = require("./graphqlError");
const auth_1 = require("../auth");
async function build(options, configDir, dryRun) {
    var _a, _b;
    const account = (0, auth_1.getProjectDefaultAccount)(options.projectRoot);
    const args = { configDir, account };
    if (options.projectId) {
        args.projectId = options.projectId;
    }
    const buildResult = await dataconnectEmulator_1.DataConnectEmulator.build(args);
    if ((_a = buildResult === null || buildResult === void 0 ? void 0 : buildResult.errors) === null || _a === void 0 ? void 0 : _a.length) {
        await handleBuildErrors(buildResult.errors, options.nonInteractive, options.force, dryRun);
    }
    return (_b = buildResult === null || buildResult === void 0 ? void 0 : buildResult.metadata) !== null && _b !== void 0 ? _b : {};
}
exports.build = build;
async function handleBuildErrors(errors, nonInteractive, force, dryRun) {
    if (errors.filter((w) => { var _a; return !((_a = w.extensions) === null || _a === void 0 ? void 0 : _a.warningLevel); }).length) {
        // Throw immediately if there are any build errors in the GraphQL schema or connectors.
        throw new error_1.FirebaseError(`There are errors in your schema and connector files:\n${errors.map(graphqlError_1.prettify).join("\n")}`);
    }
    const requiredForces = errors.filter((w) => { var _a; return ((_a = w.extensions) === null || _a === void 0 ? void 0 : _a.warningLevel) === "REQUIRE_FORCE"; });
    if (requiredForces.length && !force) {
        // Only INACCESSIBLE issues fall in this category.
        utils.logLabeledError("dataconnect", `There are changes in your schema or connectors that will result in broken behavior:\n` +
            (0, graphqlError_1.prettifyTable)(requiredForces));
        throw new error_1.FirebaseError("Rerun this command with --force to deploy these changes.");
    }
    const interactiveAcks = errors.filter((w) => { var _a; return ((_a = w.extensions) === null || _a === void 0 ? void 0 : _a.warningLevel) === "INTERACTIVE_ACK"; });
    const requiredAcks = errors.filter((w) => { var _a; return ((_a = w.extensions) === null || _a === void 0 ? void 0 : _a.warningLevel) === "REQUIRE_ACK"; });
    const choices = [
        { name: "Acknowledge all changes and proceed", value: "proceed" },
        { name: "Reject changes and abort", value: "abort" },
    ];
    if (requiredAcks.length) {
        // This category contains BREAKING and INSECURE issues.
        utils.logLabeledWarning("dataconnect", `There are changes in your schema or connectors that may break your existing applications or introduce operations that are insecure. These changes require explicit acknowledgement to proceed. You may either reject the changes and update your sources with the suggested workaround(s), if any, or acknowledge these changes and proceed with the deployment:\n` +
            (0, graphqlError_1.prettifyTable)(requiredAcks));
        if (nonInteractive && !force) {
            throw new error_1.FirebaseError("Explicit acknowledgement required for breaking schema or connector changes and new insecure operations. Rerun this command with --force to deploy these changes.");
        }
        else if (!nonInteractive && !force && !dryRun) {
            const result = await (0, prompt_1.select)({
                message: "Would you like to proceed with these changes?",
                choices,
                default: "abort",
            });
            if (result === "abort") {
                throw new error_1.FirebaseError(`Deployment aborted.`);
            }
        }
    }
    if (interactiveAcks.length) {
        // This category contains WARNING and EXISTING_INSECURE issues.
        utils.logLabeledWarning("dataconnect", `There are existing insecure operations or changes in your schema or connectors that may cause unexpected behavior in your existing applications:\n` +
            (0, graphqlError_1.prettifyTable)(interactiveAcks));
        if (!nonInteractive && !force && !dryRun) {
            const result = await (0, prompt_1.select)({
                message: "Would you like to proceed with these changes?",
                choices,
                default: "proceed",
            });
            if (result === "abort") {
                throw new error_1.FirebaseError(`Deployment aborted.`);
            }
        }
    }
}
exports.handleBuildErrors = handleBuildErrors;
