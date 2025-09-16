"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTopic = exports.updateTopic = exports.getTopic = exports.createTopic = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const proto = __importStar(require("./proto"));
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
//# sourceMappingURL=pubsub.js.map