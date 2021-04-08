export * as cloudfucntions from "./cloudfunctions";
export * as cloudscheduler from "./cloudscheduler";
export * as iam from "./iam";
export * as pubsub from "./pubsub";
export * as rules from "./rules";

// Files that use exports = cannot use export * as 
import cloudlogging = require("./cloudlogging");
exports.cloudlogging = cloudlogging;
import storage = require("./storage");
exports.storage = storage;