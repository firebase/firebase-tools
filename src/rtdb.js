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
exports.updateRulesWithClient = exports.updateRules = void 0;
const apiv2_1 = require("./apiv2");
const database_1 = require("./management/database");
const error_1 = require("./error");
const api_1 = require("./database/api");
const utils = __importStar(require("./utils"));
/**
 * Updates rules, optionally specifying a dry run flag for validation purposes.
 */
async function updateRules(projectId, instance, src, options = {}) {
    const downstreamOptions = { instance: instance, project: projectId };
    await (0, database_1.populateInstanceDetails)(downstreamOptions);
    if (!downstreamOptions.instanceDetails) {
        throw new error_1.FirebaseError(`Could not get instance details`, { exit: 2 });
    }
    const origin = utils.getDatabaseUrl((0, api_1.realtimeOriginOrCustomUrl)(downstreamOptions.instanceDetails.databaseUrl), instance, "");
    const client = new apiv2_1.Client({ urlPrefix: origin });
    return updateRulesWithClient(client, src, options);
}
exports.updateRules = updateRules;
async function updateRulesWithClient(client, src, options = {}) {
    const queryParams = {};
    if (options.dryRun) {
        queryParams.dryRun = "true";
    }
    const response = await client.request({
        method: "PUT",
        path: ".settings/rules.json",
        queryParams,
        body: src,
        resolveOnHTTPError: true,
    });
    if (response.status === 400) {
        throw new error_1.FirebaseError(`Syntax error in database rules:\n\n${response.body.error}`);
    }
    else if (response.status > 400) {
        throw new error_1.FirebaseError("Unexpected error while deploying database rules.", { exit: 2 });
    }
}
exports.updateRulesWithClient = updateRulesWithClient;
//# sourceMappingURL=rtdb.js.map