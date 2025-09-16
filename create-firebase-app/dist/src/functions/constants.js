"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLOCKING_EVENT_TO_LABEL_KEY = exports.BLOCKING_LABEL_KEY_TO_EVENT = exports.BLOCKING_LABEL = exports.HASH_LABEL = exports.CODEBASE_LABEL = void 0;
exports.CODEBASE_LABEL = "firebase-functions-codebase";
exports.HASH_LABEL = "firebase-functions-hash";
exports.BLOCKING_LABEL = "deployment-blocking";
exports.BLOCKING_LABEL_KEY_TO_EVENT = {
    "before-create": "providers/cloud.auth/eventTypes/user.beforeCreate",
    "before-sign-in": "providers/cloud.auth/eventTypes/user.beforeSignIn",
    "before-send-email": "providers/cloud.auth/eventTypes/user.beforeSendEmail",
    "before-send-sms": "providers/cloud.auth/eventTypes/user.beforeSendSms",
};
exports.BLOCKING_EVENT_TO_LABEL_KEY = {
    "providers/cloud.auth/eventTypes/user.beforeCreate": "before-create",
    "providers/cloud.auth/eventTypes/user.beforeSignIn": "before-sign-in",
    "providers/cloud.auth/eventTypes/user.beforeSendEmail": "before-send-email",
    "providers/cloud.auth/eventTypes/user.beforeSendSms": "before-send-sms",
};
