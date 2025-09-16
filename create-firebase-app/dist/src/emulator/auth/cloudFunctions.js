"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthCloudFunction = void 0;
const uuid = require("uuid");
const types_1 = require("../types");
const emulatorLogger_1 = require("../emulatorLogger");
const registry_1 = require("../registry");
class AuthCloudFunction {
    constructor(projectId) {
        this.projectId = projectId;
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH);
        this.enabled = false;
        this.enabled = registry_1.EmulatorRegistry.isRunning(types_1.Emulators.FUNCTIONS);
    }
    async dispatch(action, user) {
        if (!this.enabled)
            return;
        const userInfoPayload = this.createUserInfoPayload(user);
        const multicastEventBody = this.createEventRequestBody(action, userInfoPayload);
        const c = registry_1.EmulatorRegistry.client(types_1.Emulators.FUNCTIONS);
        let res;
        let err;
        try {
            res = await c.post(`/functions/projects/${this.projectId}/trigger_multicast`, multicastEventBody);
        }
        catch (e) {
            err = e;
        }
        if (err || (res === null || res === void 0 ? void 0 : res.status) !== 200) {
            this.logger.logLabeled("WARN", "functions", `Firebase Authentication function was not triggered due to emulation error. Please file a bug.`);
        }
    }
    createEventRequestBody(action, userInfoPayload) {
        return {
            eventId: uuid.v4(),
            eventType: `providers/firebase.auth/eventTypes/user.${action}`,
            resource: {
                name: `projects/${this.projectId}`,
                service: "firebaseauth.googleapis.com",
            },
            params: {},
            timestamp: new Date().toISOString(),
            data: userInfoPayload,
        };
    }
    createUserInfoPayload(user) {
        var _a;
        return {
            uid: user.localId,
            email: user.email,
            emailVerified: user.emailVerified,
            displayName: user.displayName,
            photoURL: user.photoUrl,
            phoneNumber: user.phoneNumber,
            disabled: user.disabled,
            metadata: {
                creationTime: user.createdAt
                    ? new Date(parseInt(user.createdAt, 10)).toISOString()
                    : undefined,
                lastSignInTime: user.lastLoginAt
                    ? new Date(parseInt(user.lastLoginAt, 10)).toISOString()
                    : undefined,
            },
            customClaims: JSON.parse(user.customAttributes || "{}"),
            providerData: (_a = user.providerUserInfo) === null || _a === void 0 ? void 0 : _a.map((info) => this.createProviderUserInfoPayload(info)),
            tenantId: user.tenantId,
            mfaInfo: user.mfaInfo,
        };
    }
    createProviderUserInfoPayload(info) {
        return {
            rawId: info.rawId,
            providerId: info.providerId,
            displayName: info.displayName,
            email: info.email,
            federatedId: info.federatedId,
            phoneNumber: info.phoneNumber,
            photoURL: info.photoUrl,
            screenName: info.screenName,
        };
    }
}
exports.AuthCloudFunction = AuthCloudFunction;
