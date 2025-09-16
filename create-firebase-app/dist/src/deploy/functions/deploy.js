"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldUploadBeSkipped = exports.deploy = void 0;
const tmp_1 = require("tmp");
const clc = require("colorette");
const fs = require("fs");
const checkIam_1 = require("./checkIam");
const utils_1 = require("../../utils");
const projectConfig_1 = require("../../functions/projectConfig");
const gcs = require("../../gcp/storage");
const gcf = require("../../gcp/cloudfunctions");
const gcfv2 = require("../../gcp/cloudfunctionsv2");
const backend = require("./backend");
const backend_1 = require("./backend");
const extensions_1 = require("../extensions");
(0, tmp_1.setGracefulCleanup)();
async function uploadSourceV1(projectId, source, wantBackend) {
    const v1Endpoints = backend.allEndpoints(wantBackend).filter((e) => e.platform === "gcfv1");
    if (v1Endpoints.length === 0) {
        return;
    }
    const region = v1Endpoints[0].region; // Just pick a region to upload the source.
    const uploadUrl = await gcf.generateUploadUrl(projectId, region);
    const uploadOpts = {
        file: source.functionsSourceV1,
        stream: fs.createReadStream(source.functionsSourceV1),
    };
    if (process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
        (0, utils_1.logLabeledWarning)("functions", "GOOGLE_CLOUD_QUOTA_PROJECT is not usable when uploading source for Cloud Functions.");
    }
    await gcs.upload(uploadOpts, uploadUrl, {
        "x-goog-content-length-range": "0,104857600",
    }, true);
    return uploadUrl;
}
async function uploadSourceV2(projectId, source, wantBackend) {
    const v2Endpoints = backend.allEndpoints(wantBackend).filter((e) => e.platform === "gcfv2");
    if (v2Endpoints.length === 0) {
        return;
    }
    const region = v2Endpoints[0].region; // Just pick a region to upload the source.
    const res = await gcfv2.generateUploadUrl(projectId, region);
    const uploadOpts = {
        file: source.functionsSourceV2,
        stream: fs.createReadStream(source.functionsSourceV2),
    };
    if (process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
        (0, utils_1.logLabeledWarning)("functions", "GOOGLE_CLOUD_QUOTA_PROJECT is not usable when uploading source for Cloud Functions.");
    }
    await gcs.upload(uploadOpts, res.uploadUrl, undefined, true /* ignoreQuotaProject */);
    return res.storageSource;
}
async function uploadCodebase(context, codebase, wantBackend) {
    var _a, _b, _c, _d;
    const source = (_a = context.sources) === null || _a === void 0 ? void 0 : _a[codebase];
    if (!source || (!source.functionsSourceV1 && !source.functionsSourceV2)) {
        return;
    }
    const uploads = [];
    try {
        uploads.push(uploadSourceV1(context.projectId, source, wantBackend));
        uploads.push(uploadSourceV2(context.projectId, source, wantBackend));
        const [sourceUrl, storage] = await Promise.all(uploads);
        if (sourceUrl) {
            source.sourceUrl = sourceUrl;
        }
        if (storage) {
            source.storage = storage;
        }
        const cfg = (0, projectConfig_1.configForCodebase)(context.config, codebase);
        const label = (_d = (_b = cfg.source) !== null && _b !== void 0 ? _b : (_c = cfg.remoteSource) === null || _c === void 0 ? void 0 : _c.dir) !== null && _d !== void 0 ? _d : "remote";
        if (uploads.length) {
            (0, utils_1.logLabeledSuccess)("functions", `${clc.bold(label)} source uploaded successfully`);
        }
    }
    catch (err) {
        (0, utils_1.logWarning)(clc.yellow("functions:") + " Upload Error: " + err.message);
        throw err;
    }
}
/**
 * The "deploy" stage for Cloud Functions -- uploads source code to a generated URL.
 * @param context The deploy context.
 * @param options The command-wide options object.
 * @param payload The deploy payload.
 */
async function deploy(context, options, payload) {
    // Deploy extensions
    if (payload.extensions && context.extensions) {
        await (0, extensions_1.deploy)(context.extensions, options, payload.extensions);
    }
    // Deploy functions
    if (payload.functions && context.config) {
        await (0, checkIam_1.checkHttpIam)(context, options, payload);
        const uploads = [];
        for (const [codebase, { wantBackend, haveBackend }] of Object.entries(payload.functions)) {
            if (shouldUploadBeSkipped(context, wantBackend, haveBackend)) {
                continue;
            }
            uploads.push(uploadCodebase(context, codebase, wantBackend));
        }
        await Promise.all(uploads);
    }
}
exports.deploy = deploy;
/**
 * @return True IFF wantBackend + haveBackend are the same
 */
function shouldUploadBeSkipped(context, wantBackend, haveBackend) {
    // If function targets are specified by --only flag, assume that function will be deployed
    // and go ahead and upload the source.
    if (context.filters && context.filters.length > 0) {
        return false;
    }
    const wantEndpoints = backend.allEndpoints(wantBackend);
    const haveEndpoints = backend.allEndpoints(haveBackend);
    // Mismatching length immediately tells us they are different, and we should not skip.
    if (wantEndpoints.length !== haveEndpoints.length) {
        return false;
    }
    return wantEndpoints.every((wantEndpoint) => {
        const haveEndpoint = (0, backend_1.findEndpoint)(haveBackend, (endpoint) => endpoint.id === wantEndpoint.id);
        if (!haveEndpoint) {
            return false;
        }
        return haveEndpoint.hash && wantEndpoint.hash && haveEndpoint.hash === wantEndpoint.hash;
    });
}
exports.shouldUploadBeSkipped = shouldUploadBeSkipped;
