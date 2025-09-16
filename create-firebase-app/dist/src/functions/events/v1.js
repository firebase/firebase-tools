"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_BLOCKING_EVENTS = exports.BEFORE_SEND_SMS_EVENT = exports.BEFORE_SEND_EMAIL_EVENT = exports.BEFORE_SIGN_IN_EVENT = exports.BEFORE_CREATE_EVENT = void 0;
exports.BEFORE_CREATE_EVENT = "providers/cloud.auth/eventTypes/user.beforeCreate";
exports.BEFORE_SIGN_IN_EVENT = "providers/cloud.auth/eventTypes/user.beforeSignIn";
exports.BEFORE_SEND_EMAIL_EVENT = "providers/cloud.auth/eventTypes/user.beforeSendEmail";
exports.BEFORE_SEND_SMS_EVENT = "providers/cloud.auth/eventTypes/user.beforeSendSms";
exports.AUTH_BLOCKING_EVENTS = [
    exports.BEFORE_CREATE_EVENT,
    exports.BEFORE_SIGN_IN_EVENT,
    exports.BEFORE_SEND_EMAIL_EVENT,
    exports.BEFORE_SEND_SMS_EVENT,
];
