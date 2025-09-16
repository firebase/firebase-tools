"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerTag = exports.printAbortedErrors = exports.printErrors = exports.logAndTrackDeployStats = exports.AbortedDeploymentError = exports.DeploymentError = void 0;
const backend = require("../backend");
const clc = require("colorette");
const logger_1 = require("../../../logger");
const track_1 = require("../../../track");
const utils = require("../../../utils");
const functionsDeployHelper_1 = require("../functionsDeployHelper");
/** An error with a deployment phase. */
class DeploymentError extends Error {
    constructor(endpoint, op, original) {
        super(`Failed to ${op} function ${endpoint.id} in region ${endpoint.region}`);
        this.endpoint = endpoint;
        this.op = op;
        this.original = original;
    }
}
exports.DeploymentError = DeploymentError;
/**
 * A specific error used to indicate that a function was not deleted because
 * other errors happened during deploy.
 */
class AbortedDeploymentError extends DeploymentError {
    constructor(endpoint) {
        super(endpoint, "delete", new Error("aborted"));
        this.endpoint = endpoint;
    }
}
exports.AbortedDeploymentError = AbortedDeploymentError;
/** Add debugger logs and GA metrics for deploy stats. */
async function logAndTrackDeployStats(summary, context) {
    var _a, _b, _c;
    let totalTime = 0;
    let totalErrors = 0;
    let totalSuccesses = 0;
    let totalAborts = 0;
    const reports = [];
    const regions = new Set();
    const codebases = new Set();
    for (const result of summary.results) {
        const fnDeployEvent = {
            platform: result.endpoint.platform,
            trigger_type: backend.endpointTriggerType(result.endpoint),
            region: result.endpoint.region,
            runtime: result.endpoint.runtime,
            status: !result.error
                ? "success"
                : result.error instanceof AbortedDeploymentError
                    ? "aborted"
                    : "failure",
            duration: result.durationMs,
        };
        reports.push((0, track_1.trackGA4)("function_deploy", fnDeployEvent));
        regions.add(result.endpoint.region);
        codebases.add(result.endpoint.codebase || "default");
        totalTime += result.durationMs;
        if (!result.error) {
            totalSuccesses++;
            if (((_a = context === null || context === void 0 ? void 0 : context.codebaseDeployEvents) === null || _a === void 0 ? void 0 : _a[result.endpoint.codebase || "default"]) !== undefined) {
                context.codebaseDeployEvents[result.endpoint.codebase || "default"]
                    .fn_deploy_num_successes++;
            }
        }
        else if (result.error instanceof AbortedDeploymentError) {
            totalAborts++;
            if (((_b = context === null || context === void 0 ? void 0 : context.codebaseDeployEvents) === null || _b === void 0 ? void 0 : _b[result.endpoint.codebase || "default"]) !== undefined) {
                context.codebaseDeployEvents[result.endpoint.codebase || "default"]
                    .fn_deploy_num_canceled++;
            }
        }
        else {
            totalErrors++;
            if (((_c = context === null || context === void 0 ? void 0 : context.codebaseDeployEvents) === null || _c === void 0 ? void 0 : _c[result.endpoint.codebase || "default"]) !== undefined) {
                context.codebaseDeployEvents[result.endpoint.codebase || "default"]
                    .fn_deploy_num_failures++;
            }
        }
    }
    for (const codebase of codebases) {
        if (context === null || context === void 0 ? void 0 : context.codebaseDeployEvents) {
            reports.push((0, track_1.trackGA4)("codebase_deploy", Object.assign({}, context.codebaseDeployEvents[codebase])));
        }
    }
    const fnDeployGroupEvent = {
        codebase_deploy_count: codebases.size >= 5 ? "5+" : codebases.size.toString(),
        fn_deploy_num_successes: totalSuccesses,
        fn_deploy_num_canceled: totalAborts,
        fn_deploy_num_failures: totalErrors,
        has_runtime_config: String(!!(context === null || context === void 0 ? void 0 : context.hasRuntimeConfig)),
    };
    reports.push((0, track_1.trackGA4)("function_deploy_group", fnDeployGroupEvent));
    const avgTime = totalTime / (totalSuccesses + totalErrors);
    logger_1.logger.debug(`Total Function Deployment time: ${summary.totalTime}`);
    logger_1.logger.debug(`${totalErrors + totalSuccesses + totalAborts} Functions Deployed`);
    logger_1.logger.debug(`${totalErrors} Functions Errored`);
    logger_1.logger.debug(`${totalAborts} Function Deployments Aborted`);
    logger_1.logger.debug(`Average Function Deployment time: ${avgTime}`);
    await utils.allSettled(reports);
}
exports.logAndTrackDeployStats = logAndTrackDeployStats;
/** Print error messages for failures in summary. */
function printErrors(summary) {
    const errored = summary.results.filter((r) => r.error);
    if (errored.length === 0) {
        return;
    }
    errored.sort((left, right) => backend.compareFunctions(left.endpoint, right.endpoint));
    logger_1.logger.info("");
    logger_1.logger.info("Functions deploy had errors with the following functions:" +
        errored
            .filter((r) => !(r.error instanceof AbortedDeploymentError))
            .map((result) => `\n\t${(0, functionsDeployHelper_1.getFunctionLabel)(result.endpoint)}`)
            .join(""));
    printIamErrors(errored);
    printQuotaErrors(errored);
    printAbortedErrors(errored);
}
exports.printErrors = printErrors;
/** Print errors for failures to set invoker. */
function printIamErrors(results) {
    const iamFailures = results.filter((r) => r.error instanceof DeploymentError && r.error.op === "set invoker");
    if (!iamFailures.length) {
        return;
    }
    logger_1.logger.info("");
    logger_1.logger.info("Unable to set the invoker for the IAM policy on the following functions:" +
        iamFailures.map((result) => `\n\t${(0, functionsDeployHelper_1.getFunctionLabel)(result.endpoint)}`).join(""));
    logger_1.logger.info("");
    logger_1.logger.info("Some common causes of this:");
    logger_1.logger.info("");
    logger_1.logger.info("- You may not have the roles/functions.admin IAM role. Note that " +
        "roles/functions.developer does not allow you to change IAM policies.");
    logger_1.logger.info("");
    logger_1.logger.info("- An organization policy that restricts Network Access on your project.");
    // We implicitly set IAM permissions to public invoker when creating a function that
    // has no explicit invoker set. If these failures were on an inferred setInvoker command
    // we need to let the customer know that it needs to be explicit next time.
    const hadImplicitMakePublic = iamFailures.find((r) => backend.isHttpsTriggered(r.endpoint) && !r.endpoint.httpsTrigger.invoker);
    if (!hadImplicitMakePublic) {
        return;
    }
    logger_1.logger.info("");
    logger_1.logger.info("One or more functions were being implicitly made publicly available on function create.");
    logger_1.logger.info("Functions are not implicitly made public on updates. To try to make " +
        "these functions public on next deploy, configure these functions with " +
        `${clc.bold("invoker")} set to ${clc.bold(`"public"`)}`);
}
/** Print errors for failures with the GCF API. */
function printQuotaErrors(results) {
    const hadQuotaError = results.find((r) => {
        var _a, _b, _c, _d, _e, _f;
        if (!(r.error instanceof DeploymentError)) {
            return false;
        }
        const original = r.error.original;
        const code = (original === null || original === void 0 ? void 0 : original.status) ||
            (original === null || original === void 0 ? void 0 : original.code) ||
            ((_b = (_a = original === null || original === void 0 ? void 0 : original.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) ||
            ((_c = original === null || original === void 0 ? void 0 : original.original) === null || _c === void 0 ? void 0 : _c.code) ||
            ((_f = (_e = (_d = original === null || original === void 0 ? void 0 : original.original) === null || _d === void 0 ? void 0 : _d.context) === null || _e === void 0 ? void 0 : _e.response) === null || _f === void 0 ? void 0 : _f.statusCode);
        return code === 429 || code === 409;
    });
    if (!hadQuotaError) {
        return;
    }
    logger_1.logger.info("");
    logger_1.logger.info("Exceeded maximum retries while deploying functions. " +
        "If you are deploying a large number of functions, " +
        "please deploy your functions in batches by using the --only flag, " +
        "and wait a few minutes before deploying again. " +
        "Go to https://firebase.google.com/docs/cli/#partial_deploys to learn more.");
}
/** Print errors for aborted deletes. */
function printAbortedErrors(results) {
    const aborted = results.filter((r) => r.error instanceof AbortedDeploymentError);
    if (!aborted.length) {
        return;
    }
    logger_1.logger.info("");
    logger_1.logger.info("Because there were errors creating or updating functions, the following " +
        "functions were not deleted" +
        aborted.map((result) => `\n\t${(0, functionsDeployHelper_1.getFunctionLabel)(result.endpoint)}`).join(""));
    logger_1.logger.info(`To delete these, use ${clc.bold("firebase functions:delete")}`);
}
exports.printAbortedErrors = printAbortedErrors;
/** Get a short synopsis of trigger type for analytics */
function triggerTag(endpoint) {
    var _a;
    const prefix = endpoint.platform === "gcfv1" ? "v1" : "v2";
    if (backend.isScheduleTriggered(endpoint)) {
        return `${prefix}.scheduled`;
    }
    if (backend.isTaskQueueTriggered(endpoint)) {
        return `${prefix}.taskQueue`;
    }
    if (backend.isCallableTriggered(endpoint)) {
        return `${prefix}.callable`;
    }
    if (backend.isHttpsTriggered(endpoint)) {
        // NOTE: Legacy trigger annotation relies on a special label to differentiate http vs callable triggers.
        if ((_a = endpoint.labels) === null || _a === void 0 ? void 0 : _a["deployment-callable"]) {
            return `${prefix}.callable`;
        }
        return `${prefix}.https`;
    }
    if (backend.isBlockingTriggered(endpoint)) {
        return `${prefix}.blocking`;
    }
    return endpoint.eventTrigger.eventType;
}
exports.triggerTag = triggerTag;
