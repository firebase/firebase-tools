"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.release = void 0;
const api = require("../../hosting/api");
const logger_1 = require("../../logger");
const utils = require("../../utils");
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
