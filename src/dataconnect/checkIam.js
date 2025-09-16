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
exports.grantRolesToCloudSqlServiceAccount = void 0;
const iam = __importStar(require("../gcp/iam"));
const resourceManager_1 = require("../gcp/resourceManager");
const cloudSqlAdmin = __importStar(require("../gcp/cloudsql/cloudsqladmin"));
const error_1 = require("../error");
async function grantRolesToCloudSqlServiceAccount(projectId, instanceId, roles) {
    const instance = await cloudSqlAdmin.getInstance(projectId, instanceId);
    const saEmail = instance.serviceAccountEmailAddress;
    const policy = await (0, resourceManager_1.getIamPolicy)(projectId);
    const requiredBindings = roles.map((r) => {
        const binding = {
            role: r,
            members: [`serviceAccount:${saEmail}`],
        };
        return binding;
    });
    const updated = iam.mergeBindings(policy, requiredBindings);
    if (updated) {
        try {
            await (0, resourceManager_1.setIamPolicy)(projectId, policy, "bindings");
        }
        catch (err) {
            iam.printManualIamConfig(requiredBindings, projectId, "dataconnect");
            throw new error_1.FirebaseError("Unable to make required IAM policy changes.");
        }
    }
}
exports.grantRolesToCloudSqlServiceAccount = grantRolesToCloudSqlServiceAccount;
//# sourceMappingURL=checkIam.js.map