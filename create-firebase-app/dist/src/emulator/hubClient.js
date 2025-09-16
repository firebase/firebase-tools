"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmulatorHubClient = void 0;
const hub_1 = require("./hub");
const error_1 = require("../error");
const apiv2_1 = require("../apiv2");
class EmulatorHubClient {
    constructor(projectId) {
        this.projectId = projectId;
        this.locator = hub_1.EmulatorHub.readLocatorFile(projectId);
    }
    foundHub() {
        return this.locator !== undefined;
    }
    /**
     * Ping possible hub origins for status and return the first successful.
     */
    getStatus() {
        return this.tryOrigins(async (client, origin) => {
            await client.get("/");
            return origin;
        });
    }
    async tryOrigins(task) {
        const origins = this.assertLocator().origins;
        let err = undefined;
        for (const origin of origins) {
            try {
                const apiClient = new apiv2_1.Client({ urlPrefix: origin, auth: false });
                return await task(apiClient, origin);
            }
            catch (e) {
                if (!err) {
                    err = e; // Only record the first error and only throw if all fails.
                }
            }
        }
        throw err !== null && err !== void 0 ? err : new Error("Cannot find working hub origin. Tried:" + origins.join(" "));
    }
    async getEmulators() {
        const res = await this.tryOrigins((client) => client.get(hub_1.EmulatorHub.PATH_EMULATORS));
        return res.body;
    }
    async clearDataConnectData() {
        // This is a POST operation that should not be retried / multicast, so we
        // will try to find the right origin first via GET.
        const origin = await this.getStatus();
        const apiClient = new apiv2_1.Client({ urlPrefix: origin, auth: false });
        await apiClient.post(hub_1.EmulatorHub.PATH_CLEAR_DATA_CONNECT);
    }
    async postExport(options) {
        // This is a POST operation that should not be retried / multicast, so we
        // will try to find the right origin first via GET.
        const origin = await this.getStatus();
        const apiClient = new apiv2_1.Client({ urlPrefix: origin, auth: false });
        await apiClient.post(hub_1.EmulatorHub.PATH_EXPORT, options);
    }
    assertLocator() {
        if (this.locator === undefined) {
            throw new error_1.FirebaseError(`Cannot contact the Emulator Hub for project ${this.projectId}`);
        }
        return this.locator;
    }
}
exports.EmulatorHubClient = EmulatorHubClient;
