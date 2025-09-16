"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCloudSQLInstanceName = exports.parseConnectorName = exports.parseServiceName = void 0;
const error_1 = require("../error");
const serviceNameRegex = /projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/services\/(?<serviceId>[^\/]+)/;
function parseServiceName(serviceName) {
    var _a, _b, _c;
    const res = serviceNameRegex.exec(serviceName);
    const projectId = (_a = res === null || res === void 0 ? void 0 : res.groups) === null || _a === void 0 ? void 0 : _a.projectId;
    const location = (_b = res === null || res === void 0 ? void 0 : res.groups) === null || _b === void 0 ? void 0 : _b.location;
    const serviceId = (_c = res === null || res === void 0 ? void 0 : res.groups) === null || _c === void 0 ? void 0 : _c.serviceId;
    if (!projectId || !location || !serviceId) {
        throw new error_1.FirebaseError(`${serviceName} is not a valid service name`);
    }
    const toString = () => {
        return `projects/${projectId}/locations/${location}/services/${serviceId}`;
    };
    return {
        projectId,
        location,
        serviceId,
        toString,
    };
}
exports.parseServiceName = parseServiceName;
const connectorNameRegex = /projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/services\/(?<serviceId>[^\/]+)\/connectors\/(?<connectorId>[^\/]+)/;
function parseConnectorName(connectorName) {
    var _a, _b, _c, _d;
    const res = connectorNameRegex.exec(connectorName);
    const projectId = (_a = res === null || res === void 0 ? void 0 : res.groups) === null || _a === void 0 ? void 0 : _a.projectId;
    const location = (_b = res === null || res === void 0 ? void 0 : res.groups) === null || _b === void 0 ? void 0 : _b.location;
    const serviceId = (_c = res === null || res === void 0 ? void 0 : res.groups) === null || _c === void 0 ? void 0 : _c.serviceId;
    const connectorId = (_d = res === null || res === void 0 ? void 0 : res.groups) === null || _d === void 0 ? void 0 : _d.connectorId;
    if (!projectId || !location || !serviceId || !connectorId) {
        throw new error_1.FirebaseError(`${connectorName} is not a valid connector name`);
    }
    const toString = () => {
        return `projects/${projectId}/locations/${location}/services/${serviceId}/connectors/${connectorId}`;
    };
    return {
        projectId,
        location,
        serviceId,
        connectorId,
        toString,
    };
}
exports.parseConnectorName = parseConnectorName;
const cloudSQLInstanceNameRegex = /projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/instances\/(?<instanceId>[^\/]+)/;
function parseCloudSQLInstanceName(cloudSQLInstanceName) {
    var _a, _b, _c;
    const res = cloudSQLInstanceNameRegex.exec(cloudSQLInstanceName);
    const projectId = (_a = res === null || res === void 0 ? void 0 : res.groups) === null || _a === void 0 ? void 0 : _a.projectId;
    const location = (_b = res === null || res === void 0 ? void 0 : res.groups) === null || _b === void 0 ? void 0 : _b.location;
    const instanceId = (_c = res === null || res === void 0 ? void 0 : res.groups) === null || _c === void 0 ? void 0 : _c.instanceId;
    if (!projectId || !location || !instanceId) {
        throw new error_1.FirebaseError(`${cloudSQLInstanceName} is not a valid cloudSQL instance name`);
    }
    const toString = () => {
        return `projects/${projectId}/locations/${location}/services/${instanceId}`;
    };
    return {
        projectId,
        location,
        instanceId,
        toString,
    };
}
exports.parseCloudSQLInstanceName = parseCloudSQLInstanceName;
