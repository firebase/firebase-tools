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
exports.ensureNecessaryV2ApisAndRoles = exports.checkSpecForV2Functions = void 0;
const getProjectNumber_1 = require("../../getProjectNumber");
const resourceManager = __importStar(require("../../gcp/resourceManager"));
const logger_1 = require("../../logger");
const error_1 = require("../../error");
const ensureApiEnabled_1 = require("../../ensureApiEnabled");
const planner = __importStar(require("./planner"));
const projectUtils_1 = require("../../projectUtils");
const api_1 = require("../../api");
const computeEngine_1 = require("../../gcp/computeEngine");
const SERVICE_AGENT_ROLE = "roles/eventarc.eventReceiver";
/**
 * Checks whether spec contains v2 function resource.
 */
async function checkSpecForV2Functions(i) {
    const extensionSpec = await planner.getExtensionSpec(i);
    return extensionSpec.resources.some((r) => r.type === "firebaseextensions.v1beta.v2function");
}
exports.checkSpecForV2Functions = checkSpecForV2Functions;
/**
 * Enables APIs and grants roles necessary for running v2 functions.
 */
async function ensureNecessaryV2ApisAndRoles(options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.computeOrigin)(), "extensions", options.markdown);
    await ensureComputeP4SARole(projectId);
}
exports.ensureNecessaryV2ApisAndRoles = ensureNecessaryV2ApisAndRoles;
async function ensureComputeP4SARole(projectId) {
    const projectNumber = await (0, getProjectNumber_1.getProjectNumber)({ projectId });
    const saEmail = await (0, computeEngine_1.getDefaultServiceAccount)(projectNumber);
    let policy;
    try {
        policy = await resourceManager.getIamPolicy(projectId);
    }
    catch (e) {
        if (e instanceof error_1.FirebaseError && e.status === 403) {
            throw new error_1.FirebaseError("Unable to get project IAM policy, permission denied (403). Please " +
                "make sure you have sufficient project privileges or if this is a brand new project " +
                "try again in a few minutes.");
        }
        throw e;
    }
    if (policy.bindings.find((b) => b.role === SERVICE_AGENT_ROLE && b.members.includes("serviceAccount:" + saEmail))) {
        logger_1.logger.debug("Compute Service API Agent IAM policy OK");
        return true;
    }
    else {
        logger_1.logger.debug("Firebase Extensions Service Agent is missing a required IAM role " +
            "`Firebase Extensions API Service Agent`.");
        policy.bindings.push({
            role: SERVICE_AGENT_ROLE,
            members: ["serviceAccount:" + saEmail],
        });
        await resourceManager.setIamPolicy(projectId, policy, "bindings");
        logger_1.logger.debug("Compute Service API Agent IAM policy updated successfully");
        return true;
    }
}
//# sourceMappingURL=v2FunctionHelper.js.map