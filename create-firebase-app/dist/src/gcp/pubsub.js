"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTopic = exports.updateTopic = exports.getTopic = exports.createTopic = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const proto = require("./proto");
const API_VERSION = "v1";
const client = new apiv2_1.Client({
    urlPrefix: (0, api_1.pubsubOrigin)(),
    auth: true,
    apiVersion: API_VERSION,
});
async function createTopic(topic) {
    const result = await client.put(topic.name, topic);
    return result.body;
}
exports.createTopic = createTopic;
async function getTopic(name) {
    const result = await client.get(name);
    return result.body;
}
exports.getTopic = getTopic;
async function updateTopic(topic) {
    const queryParams = {
        updateMask: proto.fieldMasks(topic).join(","),
    };
    const result = await client.patch(topic.name, topic, { queryParams });
    return result.body;
}
exports.updateTopic = updateTopic;
async function deleteTopic(name) {
    await client.delete(name);
}
exports.deleteTopic = deleteTopic;
// NOTE: We currently don't need or have specFromTopic.
// backend.ExistingBackend infers actual topics by the fact that it sees a function
// with a scheduled annotation. This may not be good enough when we're
// using Run, because we'll have to to query multiple resources (e.g. triggers)
// Were we to get a standalone Topic, we wouldn't have any idea how to set the
// "target service" since that is part of the subscription.
