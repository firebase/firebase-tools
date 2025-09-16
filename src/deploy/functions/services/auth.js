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
exports.AuthBlockingService = void 0;
const backend = __importStar(require("../backend"));
const identityPlatform = __importStar(require("../../../gcp/identityPlatform"));
const events = __importStar(require("../../../functions/events"));
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
        if (newConfig.triggers?.beforeCreate?.functionUri !==
            config.triggers?.beforeCreate?.functionUri ||
            newConfig.triggers?.beforeSignIn?.functionUri !==
                config.triggers?.beforeSignIn?.functionUri ||
            newConfig.triggers?.beforeSendEmail?.functionUri !==
                config.triggers?.beforeSendEmail?.functionUri ||
            newConfig.triggers?.beforeSendSms?.functionUri !== config.triggers?.beforeSendSms?.functionUri) {
            return true;
        }
        if (!!newConfig.forwardInboundCredentials?.accessToken !==
            !!config.forwardInboundCredentials?.accessToken ||
            !!newConfig.forwardInboundCredentials?.idToken !==
                !!config.forwardInboundCredentials?.idToken ||
            !!newConfig.forwardInboundCredentials?.refreshToken !==
                !!config.forwardInboundCredentials?.refreshToken) {
            return true;
        }
        return false;
    }
    async registerTriggerLocked(endpoint) {
        const newBlockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
        const oldBlockingConfig = (0, utils_1.cloneDeep)(newBlockingConfig);
        if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_CREATE_EVENT) {
            newBlockingConfig.triggers = {
                ...newBlockingConfig.triggers,
                beforeCreate: {
                    functionUri: endpoint.uri,
                },
            };
        }
        else if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_SIGN_IN_EVENT) {
            newBlockingConfig.triggers = {
                ...newBlockingConfig.triggers,
                beforeSignIn: {
                    functionUri: endpoint.uri,
                },
            };
        }
        else if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_SEND_EMAIL_EVENT) {
            newBlockingConfig.triggers = {
                ...newBlockingConfig.triggers,
                beforeSendEmail: {
                    functionUri: endpoint.uri,
                },
            };
        }
        else if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_SEND_SMS_EVENT) {
            newBlockingConfig.triggers = {
                ...newBlockingConfig.triggers,
                beforeSendSms: {
                    functionUri: endpoint.uri,
                },
            };
        }
        else {
            throw new error_1.FirebaseError(`Received invalid blocking trigger event type ${endpoint.blockingTrigger.eventType}`);
        }
        newBlockingConfig.forwardInboundCredentials = {
            ...oldBlockingConfig.forwardInboundCredentials,
            ...endpoint.blockingTrigger.options,
        };
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
        const blockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
        if (endpoint.uri !== blockingConfig.triggers?.beforeCreate?.functionUri &&
            endpoint.uri !== blockingConfig.triggers?.beforeSignIn?.functionUri &&
            endpoint.uri !== blockingConfig.triggers?.beforeSendEmail?.functionUri &&
            endpoint.uri !== blockingConfig.triggers?.beforeSendSms?.functionUri) {
            return;
        }
        // There is a possibility that the user changed the registration on identity platform,
        // to prevent 400 errors on every create and/or sign in on the app, we will treat
        // the blockingConfig as the source of truth and only delete matching uri's.
        if (endpoint.uri === blockingConfig.triggers?.beforeCreate?.functionUri) {
            delete blockingConfig.triggers?.beforeCreate;
        }
        if (endpoint.uri === blockingConfig.triggers?.beforeSignIn?.functionUri) {
            delete blockingConfig.triggers?.beforeSignIn;
        }
        if (endpoint.uri === blockingConfig.triggers?.beforeSendEmail?.functionUri) {
            delete blockingConfig.triggers?.beforeSendEmail;
        }
        if (endpoint.uri === blockingConfig.triggers?.beforeSendSms?.functionUri) {
            delete blockingConfig.triggers?.beforeSendSms;
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
//# sourceMappingURL=auth.js.map