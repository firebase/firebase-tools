"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDenySmsRegionPolicy = exports.setAllowSmsRegionPolicy = exports.setCustomClaim = exports.disableUser = exports.listUsers = exports.findUser = exports.updateAuthDomains = exports.getAuthDomains = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.identityOrigin)(), auth: true });
/**
 * Returns the list of authorized domains.
 * @param project project identifier.
 * @return authorized domains.
 */
async function getAuthDomains(project) {
    const res = await apiClient.get(`/admin/v2/projects/${project}/config`, { headers: { "x-goog-user-project": project } });
    return res.body.authorizedDomains;
}
exports.getAuthDomains = getAuthDomains;
/**
 * Updates the list of authorized domains.
 * @param project project identifier.
 * @param authDomains full list of authorized domains.
 * @return authorized domains.
 */
async function updateAuthDomains(project, authDomains) {
    const res = await apiClient.patch(`/admin/v2/projects/${project}/config`, { authorizedDomains: authDomains }, {
        queryParams: { update_mask: "authorizedDomains" },
        headers: { "x-goog-user-project": project },
    });
    return res.body.authorizedDomains;
}
exports.updateAuthDomains = updateAuthDomains;
/**
 * findUser searches for an auth user in a project.
 * @param project project identifier.
 * @param email the users email to lookup.
 * @param phone the users phone number to lookup.
 * @param uid the users id to lookup.
 * @return an array of user info
 */
async function findUser(project, email, phone, uid) {
    var _a;
    const expression = {
        email,
        phoneNumber: phone,
        userId: uid,
    };
    const res = await apiClient.post(`/v1/projects/${project}/accounts:query`, {
        expression: [expression],
        limit: "1",
    });
    if (!((_a = res.body.userInfo) === null || _a === void 0 ? void 0 : _a.length)) {
        throw new Error("No users found");
    }
    const modifiedUserInfo = res.body.userInfo.map((ui) => {
        ui.uid = ui.localId;
        delete ui.localId;
        return ui;
    });
    return modifiedUserInfo[0];
}
exports.findUser = findUser;
/**
 * listUsers returns all auth users in a project.
 * @param project project identifier.
 * @param limit the total number of users to return.
 * @return an array of users info
 */
async function listUsers(project, limit) {
    let queryLimit = limit;
    let offset = 0;
    if (limit > 500) {
        queryLimit = 500;
    }
    const userInfo = [];
    while (offset < limit) {
        if (queryLimit + offset > limit) {
            queryLimit = limit - offset;
        }
        const res = await apiClient.post(`/v1/projects/${project}/accounts:query`, {
            offset: offset.toString(),
            limit: queryLimit.toString(),
        });
        if (res.body.recordsCount === "0") {
            break;
        }
        offset += Number(res.body.recordsCount);
        const modifiedUserInfo = res.body.userInfo.map((ui) => {
            ui.uid = ui.localId;
            delete ui.localId;
            return ui;
        });
        userInfo.push(...modifiedUserInfo);
    }
    return userInfo;
}
exports.listUsers = listUsers;
/**
 * disableUser disables or enables a user from a particular project.
 * @param project project identifier.
 * @param uid the user id of the user from the firebase project.
 * @param disabled sets whether the user is marked as disabled (true) or enabled (false).
 * @return the call succeeded (true).
 */
async function disableUser(project, uid, disabled) {
    const res = await apiClient.post("/v1/accounts:update", {
        disableUser: disabled,
        targetProjectId: project,
        localId: uid,
    });
    return res.status === 200;
}
exports.disableUser = disableUser;
/**
 * setCustomClaim sets a new custom claim on the uid specified in the project.
 * @param project project identifier.
 * @param uid the user id of the user from the firebase project.
 * @param claim the key value in the custom claim.
 * @param options modifiers to setting custom claims
 * @param options.merge whether to preserve the existing custom claims on the user
 * @return the results of the accounts update request.
 */
async function setCustomClaim(project, uid, claim, options) {
    let user = await findUser(project, undefined, undefined, uid);
    if (user.uid !== uid) {
        throw new Error(`Could not find ${uid} in the auth db, please check the uid again.`);
    }
    let reqClaim = JSON.stringify(claim);
    if (options === null || options === void 0 ? void 0 : options.merge) {
        let attributeJson = new Map();
        if (user.customAttributes !== undefined && user.customAttributes !== "") {
            attributeJson = JSON.parse(user.customAttributes);
        }
        reqClaim = JSON.stringify(Object.assign(Object.assign({}, attributeJson), claim));
    }
    const res = await apiClient.post("/v1/accounts:update", {
        customAttributes: reqClaim,
        targetProjectId: project,
        localId: uid,
    });
    if (res.status !== 200) {
        throw new Error("something went wrong in the request");
    }
    user = await findUser(project, undefined, undefined, uid);
    return user;
}
exports.setCustomClaim = setCustomClaim;
/**
 * setAllowSmsRegionPolicy updates the allowed regions for sms auth and MFA in Firebase.
 * @param project project identifier.
 * @param countryCodes the country codes to allow based on ISO 3166.
 * @return call success.
 */
async function setAllowSmsRegionPolicy(project, countryCodes) {
    const res = await apiClient.patch(`/admin/v2/projects/${project}/config?updateMask=sms_region_config`, {
        sms_region_config: {
            allowlist_only: {
                allowed_regions: countryCodes,
            },
        },
    });
    if (res.status !== 200) {
        throw new Error("SMS Region Policy failed to be configured");
    }
    return true;
}
exports.setAllowSmsRegionPolicy = setAllowSmsRegionPolicy;
/**
 * setDenySmsRegionPolicy updates the deny regions for sms auth and MFA in Firebase.
 * @param project project identifier.
 * @param countryCodes the country codes to allow based on ISO 3166.
 * @return call success.
 */
async function setDenySmsRegionPolicy(project, countryCodes) {
    const res = await apiClient.patch(`/admin/v2/projects/${project}/config?updateMask=sms_region_config`, {
        sms_region_config: {
            allow_by_default: {
                disallowed_regions: countryCodes,
            },
        },
    });
    if (res.status !== 200) {
        throw new Error("SMS Region Policy failed to be configured");
    }
    return true;
}
exports.setDenySmsRegionPolicy = setDenySmsRegionPolicy;
