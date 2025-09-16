"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthBlockingService = void 0;
const backend = require("../backend");
const identityPlatform = require("../../../gcp/identityPlatform");
const events = require("../../../functions/events");
const error_1 = require("../../../error");
const utils_1 = require("../../../utils");
const index_1 = require("./index");
class AuthBlockingService {
    constructor() {
        this.name = "authblocking";
        this.api = "identitytoolkit.googleapis.com";
        this.triggerQueue = Promise.resolve();
        this.ensureTriggerRegion = index_1.noop;
    }
    /**
     * Ensure that at most one blocking function of that type exists and merges identity platform options on our backend to deploy.
     * @param endpoint the Auth Blocking endpoint
     * @param wantBackend the backend we are deploying
     */
    validateTrigger(endpoint, wantBackend) {
        if (!backend.isBlockingTriggered(endpoint)) {
            return; // this should never happen
        }
        const blockingEndpoints = backend
            .allEndpoints(wantBackend)
            .filter((ep) => backend.isBlockingTriggered(ep));
        if (blockingEndpoints.find((ep) => ep.blockingTrigger.eventType === endpoint.blockingTrigger.eventType &&
            ep.id !== endpoint.id)) {
            throw new error_1.FirebaseError(`Can only create at most one Auth Blocking Trigger for ${endpoint.blockingTrigger.eventType} events`);
        }
    }
    configChanged(newConfig, config) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
        if (((_b = (_a = newConfig.triggers) === null || _a === void 0 ? void 0 : _a.beforeCreate) === null || _b === void 0 ? void 0 : _b.functionUri) !==
            ((_d = (_c = config.triggers) === null || _c === void 0 ? void 0 : _c.beforeCreate) === null || _d === void 0 ? void 0 : _d.functionUri) ||
            ((_f = (_e = newConfig.triggers) === null || _e === void 0 ? void 0 : _e.beforeSignIn) === null || _f === void 0 ? void 0 : _f.functionUri) !==
                ((_h = (_g = config.triggers) === null || _g === void 0 ? void 0 : _g.beforeSignIn) === null || _h === void 0 ? void 0 : _h.functionUri) ||
            ((_k = (_j = newConfig.triggers) === null || _j === void 0 ? void 0 : _j.beforeSendEmail) === null || _k === void 0 ? void 0 : _k.functionUri) !==
                ((_m = (_l = config.triggers) === null || _l === void 0 ? void 0 : _l.beforeSendEmail) === null || _m === void 0 ? void 0 : _m.functionUri) ||
            ((_p = (_o = newConfig.triggers) === null || _o === void 0 ? void 0 : _o.beforeSendSms) === null || _p === void 0 ? void 0 : _p.functionUri) !== ((_r = (_q = config.triggers) === null || _q === void 0 ? void 0 : _q.beforeSendSms) === null || _r === void 0 ? void 0 : _r.functionUri)) {
            return true;
        }
        if (!!((_s = newConfig.forwardInboundCredentials) === null || _s === void 0 ? void 0 : _s.accessToken) !==
            !!((_t = config.forwardInboundCredentials) === null || _t === void 0 ? void 0 : _t.accessToken) ||
            !!((_u = newConfig.forwardInboundCredentials) === null || _u === void 0 ? void 0 : _u.idToken) !==
                !!((_v = config.forwardInboundCredentials) === null || _v === void 0 ? void 0 : _v.idToken) ||
            !!((_w = newConfig.forwardInboundCredentials) === null || _w === void 0 ? void 0 : _w.refreshToken) !==
                !!((_x = config.forwardInboundCredentials) === null || _x === void 0 ? void 0 : _x.refreshToken)) {
            return true;
        }
        return false;
    }
    async registerTriggerLocked(endpoint) {
        const newBlockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
        const oldBlockingConfig = (0, utils_1.cloneDeep)(newBlockingConfig);
        if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_CREATE_EVENT) {
            newBlockingConfig.triggers = Object.assign(Object.assign({}, newBlockingConfig.triggers), { beforeCreate: {
                    functionUri: endpoint.uri,
                } });
        }
        else if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_SIGN_IN_EVENT) {
            newBlockingConfig.triggers = Object.assign(Object.assign({}, newBlockingConfig.triggers), { beforeSignIn: {
                    functionUri: endpoint.uri,
                } });
        }
        else if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_SEND_EMAIL_EVENT) {
            newBlockingConfig.triggers = Object.assign(Object.assign({}, newBlockingConfig.triggers), { beforeSendEmail: {
                    functionUri: endpoint.uri,
                } });
        }
        else if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_SEND_SMS_EVENT) {
            newBlockingConfig.triggers = Object.assign(Object.assign({}, newBlockingConfig.triggers), { beforeSendSms: {
                    functionUri: endpoint.uri,
                } });
        }
        else {
            throw new error_1.FirebaseError(`Received invalid blocking trigger event type ${endpoint.blockingTrigger.eventType}`);
        }
        newBlockingConfig.forwardInboundCredentials = Object.assign(Object.assign({}, oldBlockingConfig.forwardInboundCredentials), endpoint.blockingTrigger.options);
        if (!this.configChanged(newBlockingConfig, oldBlockingConfig)) {
            return;
        }
        await identityPlatform.setBlockingFunctionsConfig(endpoint.project, newBlockingConfig);
    }
    /**
     * Registers the auth blocking trigger to identity platform.
     * @param ep the blocking endpoint
     */
    registerTrigger(ep) {
        if (!backend.isBlockingTriggered(ep)) {
            return Promise.resolve(); // this should never happen
        }
        this.triggerQueue = this.triggerQueue.then(() => this.registerTriggerLocked(ep));
        return this.triggerQueue;
    }
    async unregisterTriggerLocked(endpoint) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        const blockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
        if (endpoint.uri !== ((_b = (_a = blockingConfig.triggers) === null || _a === void 0 ? void 0 : _a.beforeCreate) === null || _b === void 0 ? void 0 : _b.functionUri) &&
            endpoint.uri !== ((_d = (_c = blockingConfig.triggers) === null || _c === void 0 ? void 0 : _c.beforeSignIn) === null || _d === void 0 ? void 0 : _d.functionUri) &&
            endpoint.uri !== ((_f = (_e = blockingConfig.triggers) === null || _e === void 0 ? void 0 : _e.beforeSendEmail) === null || _f === void 0 ? void 0 : _f.functionUri) &&
            endpoint.uri !== ((_h = (_g = blockingConfig.triggers) === null || _g === void 0 ? void 0 : _g.beforeSendSms) === null || _h === void 0 ? void 0 : _h.functionUri)) {
            return;
        }
        // There is a possibility that the user changed the registration on identity platform,
        // to prevent 400 errors on every create and/or sign in on the app, we will treat
        // the blockingConfig as the source of truth and only delete matching uri's.
        if (endpoint.uri === ((_k = (_j = blockingConfig.triggers) === null || _j === void 0 ? void 0 : _j.beforeCreate) === null || _k === void 0 ? void 0 : _k.functionUri)) {
            (_l = blockingConfig.triggers) === null || _l === void 0 ? true : delete _l.beforeCreate;
        }
        if (endpoint.uri === ((_o = (_m = blockingConfig.triggers) === null || _m === void 0 ? void 0 : _m.beforeSignIn) === null || _o === void 0 ? void 0 : _o.functionUri)) {
            (_p = blockingConfig.triggers) === null || _p === void 0 ? true : delete _p.beforeSignIn;
        }
        if (endpoint.uri === ((_r = (_q = blockingConfig.triggers) === null || _q === void 0 ? void 0 : _q.beforeSendEmail) === null || _r === void 0 ? void 0 : _r.functionUri)) {
            (_s = blockingConfig.triggers) === null || _s === void 0 ? true : delete _s.beforeSendEmail;
        }
        if (endpoint.uri === ((_u = (_t = blockingConfig.triggers) === null || _t === void 0 ? void 0 : _t.beforeSendSms) === null || _u === void 0 ? void 0 : _u.functionUri)) {
            (_v = blockingConfig.triggers) === null || _v === void 0 ? true : delete _v.beforeSendSms;
        }
        await identityPlatform.setBlockingFunctionsConfig(endpoint.project, blockingConfig);
    }
    /**
     * Un-registers the auth blocking trigger from identity platform. If the endpoint uri is not on the resource, we do nothing.
     * @param ep the blocking endpoint
     */
    unregisterTrigger(ep) {
        if (!backend.isBlockingTriggered(ep)) {
            return Promise.resolve(); // this should never happen
        }
        this.triggerQueue = this.triggerQueue.then(() => this.unregisterTriggerLocked(ep));
        return this.triggerQueue;
    }
}
exports.AuthBlockingService = AuthBlockingService;
