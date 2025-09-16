"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clc = require("colorette");
const load_1 = require("../../dataconnect/load");
const logger_1 = require("../../logger");
const utils = require("../../utils");
const projectUtils_1 = require("../../projectUtils");
const filters_1 = require("../../dataconnect/filters");
const build_1 = require("../../dataconnect/build");
const ensureApis_1 = require("../../dataconnect/ensureApis");
const requireTosAcceptance_1 = require("../../requireTosAcceptance");
const firedata_1 = require("../../gcp/firedata");
const provisionCloudSql_1 = require("../../dataconnect/provisionCloudSql");
const cloudbilling_1 = require("../../gcp/cloudbilling");
const names_1 = require("../../dataconnect/names");
const error_1 = require("../../error");
const types_1 = require("../../dataconnect/types");
const schemaMigration_1 = require("../../dataconnect/schemaMigration");
const freeTrial_1 = require("../../dataconnect/freeTrial");
/**
 * Prepares for a Firebase DataConnect deployment by loading schemas and connectors from file.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function default_1(context, options) {
    var _a, _b, _c;
    const projectId = (0, projectUtils_1.needProjectId)(options);
    if (!(await (0, cloudbilling_1.checkBillingEnabled)(projectId))) {
        throw new error_1.FirebaseError((0, freeTrial_1.upgradeInstructions)(projectId));
    }
    await (0, ensureApis_1.ensureApis)(projectId);
    await (0, requireTosAcceptance_1.requireTosAcceptance)(firedata_1.DATA_CONNECT_TOS_ID)(options);
    const filters = (0, filters_1.getResourceFilters)(options);
    const serviceInfos = await (0, load_1.loadAll)(projectId, options.config);
    for (const si of serviceInfos) {
        si.deploymentMetadata = await (0, build_1.build)(options, si.sourceDirectory, options.dryRun);
    }
    const unmatchedFilters = filters === null || filters === void 0 ? void 0 : filters.filter((f) => {
        // filter out all filters that match no service
        const serviceMatched = serviceInfos.some((s) => s.dataConnectYaml.serviceId === f.serviceId);
        const connectorMatched = f.connectorId
            ? serviceInfos.some((s) => {
                return (s.dataConnectYaml.serviceId === f.serviceId &&
                    s.connectorInfo.some((c) => c.connectorYaml.connectorId === f.connectorId));
            })
            : true;
        return !serviceMatched || !connectorMatched;
    });
    if (unmatchedFilters === null || unmatchedFilters === void 0 ? void 0 : unmatchedFilters.length) {
        throw new error_1.FirebaseError(`The following filters were specified in --only but didn't match anything in this project: ${unmatchedFilters.map(filters_1.toString).map(clc.bold).join(", ")}`);
        // TODO: Did you mean?
    }
    context.dataconnect = {
        serviceInfos,
        filters,
    };
    utils.logLabeledBullet("dataconnect", `Successfully compiled schema and connectors`);
    if (options.dryRun) {
        for (const si of serviceInfos) {
            await (0, schemaMigration_1.diffSchema)(options, si.schema, (_c = (_b = (_a = si.dataConnectYaml.schema) === null || _a === void 0 ? void 0 : _a.datasource) === null || _b === void 0 ? void 0 : _b.postgresql) === null || _c === void 0 ? void 0 : _c.schemaValidation);
        }
        utils.logLabeledBullet("dataconnect", "Checking for CloudSQL resources...");
        await Promise.all(serviceInfos
            .filter((si) => {
            return !filters || (filters === null || filters === void 0 ? void 0 : filters.some((f) => si.dataConnectYaml.serviceId === f.serviceId));
        })
            .map(async (s) => {
            var _a, _b, _c;
            const postgresDatasource = s.schema.datasources.find((d) => d.postgresql);
            if (postgresDatasource) {
                const instanceId = (_b = (_a = postgresDatasource.postgresql) === null || _a === void 0 ? void 0 : _a.cloudSql) === null || _b === void 0 ? void 0 : _b.instance.split("/").pop();
                const databaseId = (_c = postgresDatasource.postgresql) === null || _c === void 0 ? void 0 : _c.database;
                if (!instanceId || !databaseId) {
                    return Promise.resolve();
                }
                return (0, provisionCloudSql_1.setupCloudSql)({
                    projectId,
                    location: (0, names_1.parseServiceName)(s.serviceName).location,
                    instanceId,
                    databaseId,
                    requireGoogleMlIntegration: (0, types_1.requiresVector)(s.deploymentMetadata),
                    dryRun: true,
                });
            }
        }));
    }
    logger_1.logger.debug(JSON.stringify(context.dataconnect, null, 2));
    return;
}
exports.default = default_1;
