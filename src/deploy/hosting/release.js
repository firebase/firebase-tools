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
exports.release = void 0;
const api = __importStar(require("../../hosting/api"));
const logger_1 = require("../../logger");
const utils = __importStar(require("../../utils"));
const convertConfig_1 = require("./convertConfig");
const error_1 = require("../../error");
/**
 *  Release finalized a Hosting release.
 */
async function release(context, options, functionsPayload) {
    if (!context.hosting || !context.hosting.deploys) {
        return;
    }
    logger_1.logger.debug(JSON.stringify(context.hosting.deploys, null, 2));
    await Promise.all(context.hosting.deploys.map(async (deploy) => {
        if (!deploy.version) {
            throw new error_1.FirebaseError("Assertion failed: Hosting version should have been set in the prepare phase", { exit: 2 });
        }
        utils.logLabeledBullet(`hosting[${deploy.config.site}]`, "finalizing version...");
        const update = {
            status: "FINALIZED",
            config: await (0, convertConfig_1.convertConfig)(context, functionsPayload, deploy),
        };
        const versionId = utils.last(deploy.version.split("/"));
        const finalizedVersion = await api.updateVersion(deploy.config.site, versionId, update);
        logger_1.logger.debug(`[hosting] finalized version for ${deploy.config.site}:${finalizedVersion}`);
        utils.logLabeledSuccess(`hosting[${deploy.config.site}]`, "version finalized");
        utils.logLabeledBullet(`hosting[${deploy.config.site}]`, "releasing new version...");
        if (context.hostingChannel) {
            logger_1.logger.debug("[hosting] releasing to channel:", context.hostingChannel);
        }
        const otherReleaseOpts = {};
        if (options.message) {
            otherReleaseOpts.message = options.message;
        }
        const release = await api.createRelease(deploy.config.site, context.hostingChannel || "live", deploy.version, otherReleaseOpts);
        logger_1.logger.debug("[hosting] release:", release);
        utils.logLabeledSuccess(`hosting[${deploy.config.site}]`, "release complete");
    }));
}
exports.release = release;
//# sourceMappingURL=release.js.map