"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantRolesToCloudSqlServiceAccount = void 0;
const iam = require("../gcp/iam");
const resourceManager_1 = require("../gcp/resourceManager");
const cloudSqlAdmin = require("../gcp/cloudsql/cloudsqladmin");
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
