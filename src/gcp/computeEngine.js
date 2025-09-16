"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultServiceAccount = void 0;
const logger_1 = require("../logger");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const computeClient = () => new apiv2_1.Client({ urlPrefix: (0, api_1.computeOrigin)() });
const defaultServiceAccountCache = {};
/** Returns the default compute engine service agent */
async function getDefaultServiceAccount(projectNumber) {
    if (defaultServiceAccountCache[projectNumber]) {
        return defaultServiceAccountCache[projectNumber];
    }
    try {
        const res = await computeClient().get(`compute/v1/projects/${projectNumber}`);
        defaultServiceAccountCache[projectNumber] = res.body.defaultServiceAccount;
        return res.body.defaultServiceAccount;
    }
    catch (err) {
        const bestGuess = `${projectNumber}-compute@developer.gserviceaccount.com`;
        logger_1.logger.debug(`unable to look up default compute service account. Falling back to ${bestGuess}. Error: ${JSON.stringify(err)}`);
        return bestGuess;
    }
}
exports.getDefaultServiceAccount = getDefaultServiceAccount;
//# sourceMappingURL=computeEngine.js.map