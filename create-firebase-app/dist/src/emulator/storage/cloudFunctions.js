"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageCloudFunctions = void 0;
const uuid = require("uuid");
const registry_1 = require("../registry");
const types_1 = require("../types");
const emulatorLogger_1 = require("../emulatorLogger");
const metadata_1 = require("./metadata");
const STORAGE_V2_ACTION_MAP = {
    finalize: "finalized",
    metadataUpdate: "metadataUpdated",
    delete: "deleted",
    archive: "archived",
};
class StorageCloudFunctions {
    constructor(projectId) {
        this.projectId = projectId;
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE);
        this.multicastPath = "";
        this.enabled = false;
        if (registry_1.EmulatorRegistry.isRunning(types_1.Emulators.FUNCTIONS)) {
            this.enabled = true;
            this.multicastPath = `/functions/projects/${projectId}/trigger_multicast`;
            this.client = registry_1.EmulatorRegistry.client(types_1.Emulators.FUNCTIONS);
        }
    }
    async dispatch(action, object) {
        if (!this.enabled) {
            return;
        }
        const errStatus = [];
        let err;
        try {
            /** Legacy Google Events */
            const eventBody = this.createLegacyEventRequestBody(action, object);
            const eventRes = await this.client.post(this.multicastPath, eventBody);
            if (eventRes.status !== 200) {
                errStatus.push(eventRes.status);
            }
            /** Modern CloudEvents */
            const cloudEventBody = this.createCloudEventRequestBody(action, object);
            const cloudEventRes = await this.client.post(this.multicastPath, cloudEventBody, {
                headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" },
            });
            if (cloudEventRes.status !== 200) {
                errStatus.push(cloudEventRes.status);
            }
        }
        catch (e) {
            err = e;
        }
        if (err || errStatus.length > 0) {
            this.logger.logLabeled("WARN", "functions", `Firebase Storage function was not triggered due to emulation error. Please file a bug.`);
        }
    }
    /** Legacy Google Events type */
    createLegacyEventRequestBody(action, objectMetadataPayload) {
        const timestamp = new Date();
        return {
            eventId: `${timestamp.getTime()}`,
            timestamp: (0, metadata_1.toSerializedDate)(timestamp),
            eventType: `google.storage.object.${action}`,
            resource: {
                service: "storage.googleapis.com",
                name: `projects/_/buckets/${objectMetadataPayload.bucket}/objects/${objectMetadataPayload.name}`,
                type: "storage#object",
            },
            data: objectMetadataPayload,
        };
    }
    /** Modern CloudEvents type */
    createCloudEventRequestBody(action, objectMetadataPayload) {
        const ceAction = STORAGE_V2_ACTION_MAP[action];
        if (!ceAction) {
            throw new Error("Action is not defined as a CloudEvents action");
        }
        const data = objectMetadataPayload;
        let time = new Date().toISOString();
        if (data.updated) {
            time = typeof data.updated === "string" ? data.updated : data.updated.toISOString();
        }
        return {
            specversion: "1.0",
            id: uuid.v4(),
            type: `google.cloud.storage.object.v1.${ceAction}`,
            source: `//storage.googleapis.com/projects/_/buckets/${objectMetadataPayload.bucket}/objects/${objectMetadataPayload.name}`,
            time,
            data,
        };
    }
}
exports.StorageCloudFunctions = StorageCloudFunctions;
