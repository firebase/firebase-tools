"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsedProducts = exports.bulkCheckProductsProvisioned = exports.checkProductsProvisioned = exports.DeferredProduct = void 0;
const marked_1 = require("marked");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const functional_1 = require("../functional");
const error_1 = require("../error");
const planner_1 = require("../deploy/extensions/planner");
const logger_1 = require("../logger");
/** Product for which provisioning can be (or is) deferred */
var DeferredProduct;
(function (DeferredProduct) {
    DeferredProduct[DeferredProduct["STORAGE"] = 0] = "STORAGE";
    DeferredProduct[DeferredProduct["AUTH"] = 1] = "AUTH";
})(DeferredProduct = exports.DeferredProduct || (exports.DeferredProduct = {}));
/**
 * Checks whether products used by the extension require provisioning.
 *
 * @param spec extension spec
 */
async function checkProductsProvisioned(projectId, spec) {
    const usedProducts = getUsedProducts(spec);
    await checkProducts(projectId, usedProducts);
}
exports.checkProductsProvisioned = checkProductsProvisioned;
/**
 * Checks whether products used for any extension version in a deploy requires provisioning.
 *
 * @param extensionVersionRefs
 */
async function bulkCheckProductsProvisioned(projectId, instanceSpecs) {
    const usedProducts = await Promise.all(instanceSpecs.map(async (i) => {
        const extensionSpec = await (0, planner_1.getExtensionSpec)(i);
        return getUsedProducts(extensionSpec);
    }));
    await checkProducts(projectId, [...(0, functional_1.flattenArray)(usedProducts)]);
}
exports.bulkCheckProductsProvisioned = bulkCheckProductsProvisioned;
async function checkProducts(projectId, usedProducts) {
    const needProvisioning = [];
    let isStorageProvisionedPromise;
    let isAuthProvisionedPromise;
    if (usedProducts.includes(DeferredProduct.STORAGE)) {
        isStorageProvisionedPromise = isStorageProvisioned(projectId);
    }
    if (usedProducts.includes(DeferredProduct.AUTH)) {
        isAuthProvisionedPromise = isAuthProvisioned(projectId);
    }
    try {
        if (isStorageProvisionedPromise && !(await isStorageProvisionedPromise)) {
            needProvisioning.push(DeferredProduct.STORAGE);
        }
        if (isAuthProvisionedPromise && !(await isAuthProvisionedPromise)) {
            needProvisioning.push(DeferredProduct.AUTH);
        }
    }
    catch (err) {
        // If a provisioning check throws, we should fail open since this is best effort.
        logger_1.logger.debug(`Error while checking product provisioning, failing open: ${err}`);
    }
    if (needProvisioning.length > 0) {
        let errorMessage = "Some services used by this extension have not been set up on your " +
            "Firebase project. To ensure this extension works as intended, you must enable these " +
            "services by following the provided links, then retry this command\n\n";
        if (needProvisioning.includes(DeferredProduct.STORAGE)) {
            errorMessage +=
                " - Firebase Storage: store and retrieve user-generated files like images, audio, and " +
                    "video without server-side code.\n";
            errorMessage += `   https://console.firebase.google.com/project/${projectId}/storage`;
            errorMessage += "\n";
        }
        if (needProvisioning.includes(DeferredProduct.AUTH)) {
            errorMessage +=
                " - Firebase Authentication: authenticate and manage users from a variety of providers " +
                    "without server-side code.\n";
            errorMessage += `   https://console.firebase.google.com/project/${projectId}/authentication/users`;
        }
        throw new error_1.FirebaseError(await (0, marked_1.marked)(errorMessage), { exit: 2 });
    }
}
/**
 * From the spec determines which products are used by the extension and
 * returns the list.
 */
function getUsedProducts(spec) {
    var _a, _b;
    const usedProducts = [];
    const usedApis = (_a = spec.apis) === null || _a === void 0 ? void 0 : _a.map((api) => api.apiName);
    const usedRoles = (_b = spec.roles) === null || _b === void 0 ? void 0 : _b.map((r) => r.role.split(".")[0]);
    const usedTriggers = spec.resources.map((r) => getTriggerType(r.propertiesYaml));
    if ((usedApis === null || usedApis === void 0 ? void 0 : usedApis.includes("storage-component.googleapis.com")) ||
        (usedRoles === null || usedRoles === void 0 ? void 0 : usedRoles.includes("storage")) ||
        usedTriggers.find((t) => t === null || t === void 0 ? void 0 : t.startsWith("google.storage."))) {
        usedProducts.push(DeferredProduct.STORAGE);
    }
    if ((usedApis === null || usedApis === void 0 ? void 0 : usedApis.includes("identitytoolkit.googleapis.com")) ||
        (usedRoles === null || usedRoles === void 0 ? void 0 : usedRoles.includes("firebaseauth")) ||
        usedTriggers.find((t) => t === null || t === void 0 ? void 0 : t.startsWith("providers/firebase.auth/"))) {
        usedProducts.push(DeferredProduct.AUTH);
    }
    return usedProducts;
}
exports.getUsedProducts = getUsedProducts;
/**
 * Parses out trigger eventType from the propertiesYaml.
 */
function getTriggerType(propertiesYaml) {
    var _a;
    return (_a = propertiesYaml === null || propertiesYaml === void 0 ? void 0 : propertiesYaml.match(/eventType:\ ([\S]+)/)) === null || _a === void 0 ? void 0 : _a[1];
}
async function isStorageProvisioned(projectId) {
    var _a, _b;
    const client = new apiv2_1.Client({ urlPrefix: (0, api_1.firebaseStorageOrigin)(), apiVersion: "v1beta" });
    const resp = await client.get(`/projects/${projectId}/buckets`);
    return !!((_b = (_a = resp.body) === null || _a === void 0 ? void 0 : _a.buckets) === null || _b === void 0 ? void 0 : _b.find((bucket) => {
        const bucketResourceName = bucket.name;
        // Bucket resource name looks like: projects/PROJECT_NUMBER/buckets/BUCKET_NAME
        // and we just need the BUCKET_NAME part.
        const bucketResourceNameTokens = bucketResourceName.split("/");
        const pattern = "^" + projectId + "(.[[a-z0-9]+)*.(appspot.com|firebasestorage.app)$";
        return new RegExp(pattern).test(bucketResourceNameTokens[bucketResourceNameTokens.length - 1]);
    }));
}
async function isAuthProvisioned(projectId) {
    var _a, _b;
    const client = new apiv2_1.Client({ urlPrefix: (0, api_1.firedataOrigin)(), apiVersion: "v1" });
    const resp = await client.get(`/projects/${projectId}/products`);
    return !!((_b = (_a = resp.body) === null || _a === void 0 ? void 0 : _a.activation) === null || _b === void 0 ? void 0 : _b.map((a) => a.service).includes("FIREBASE_AUTH"));
}
