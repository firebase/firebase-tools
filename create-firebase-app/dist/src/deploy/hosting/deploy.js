"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploy = void 0;
const uploader_1 = require("./uploader");
const detectProjectRoot_1 = require("../../detectProjectRoot");
const listFiles_1 = require("../../listFiles");
const logger_1 = require("../../logger");
const utils_1 = require("../../utils");
const colorette_1 = require("colorette");
const ora = require("ora");
const fsutils_1 = require("../../fsutils");
const error_1 = require("../../error");
/**
 * Uploads static assets to the upcoming Hosting versions.
 */
async function deploy(context, options) {
    var _a, _b;
    if (!((_a = context.hosting) === null || _a === void 0 ? void 0 : _a.deploys)) {
        return;
    }
    const spinner = ora();
    function updateSpinner(newMessage, debugging) {
        // don't try to rewrite lines if debugging since it's likely to get interrupted
        if (debugging) {
            (0, utils_1.logLabeledBullet)("hosting", newMessage);
        }
        else {
            spinner.text = `${(0, colorette_1.bold)((0, colorette_1.cyan)(" hosting:"))} ${newMessage}`;
        }
    }
    async function runDeploys(deploys, debugging) {
        var _a;
        const deploy = deploys.shift();
        if (!deploy) {
            return;
        }
        // No need to run Uploader for no-file deploys
        if (!((_a = deploy.config) === null || _a === void 0 ? void 0 : _a.public)) {
            (0, utils_1.logLabeledBullet)(`hosting[${deploy.config.site}]`, 'no "public" directory to upload, continuing with release');
            return runDeploys(deploys, debugging);
        }
        (0, utils_1.logLabeledBullet)(`hosting[${deploy.config.site}]`, "beginning deploy...");
        const t0 = Date.now();
        const publicDir = options.config.path(deploy.config.public);
        if (!(0, fsutils_1.dirExistsSync)(`${publicDir}`)) {
            throw new error_1.FirebaseError(`Directory '${deploy.config.public}' for Hosting does not exist.`);
        }
        const files = (0, listFiles_1.listFiles)(publicDir, deploy.config.ignore);
        (0, utils_1.logLabeledBullet)(`hosting[${deploy.config.site}]`, `found ${files.length} files in ${(0, colorette_1.bold)(deploy.config.public)}`);
        let concurrency = 200;
        const envConcurrency = (0, utils_1.envOverride)("FIREBASE_HOSTING_UPLOAD_CONCURRENCY", "");
        if (envConcurrency) {
            const c = parseInt(envConcurrency, 10);
            if (!isNaN(c) && c > 0) {
                concurrency = c;
            }
        }
        logger_1.logger.debug(`[hosting] uploading with ${concurrency} concurrency`);
        const uploader = new uploader_1.Uploader({
            version: deploy.version,
            files: files,
            public: publicDir,
            cwd: options.cwd,
            projectRoot: (0, detectProjectRoot_1.detectProjectRoot)(options),
            uploadConcurrency: concurrency,
        });
        const progressInterval = setInterval(() => updateSpinner(uploader.statusMessage(), debugging), debugging ? 2000 : 200);
        if (!debugging) {
            spinner.start();
        }
        try {
            await uploader.start();
        }
        finally {
            clearInterval(progressInterval);
            updateSpinner(uploader.statusMessage(), debugging);
        }
        if (!debugging) {
            spinner.stop();
        }
        (0, utils_1.logLabeledSuccess)(`hosting[${deploy.config.site}]`, "file upload complete");
        const dt = Date.now() - t0;
        logger_1.logger.debug(`[hosting] deploy completed after ${dt}ms`);
        return runDeploys(deploys, debugging);
    }
    const debugging = !!(options.debug || options.nonInteractive);
    const deploys = [...(((_b = context.hosting) === null || _b === void 0 ? void 0 : _b.deploys) || [])];
    return runDeploys(deploys, debugging);
}
exports.deploy = deploy;
