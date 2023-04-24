import { AUTH_BLOCKING_EVENTS } from "./events/v1";

export const CODEBASE_LABEL = "firebase-functions-codebase";
export const HASH_LABEL = "firebase-functions-hash";
export const BLOCKING_LABEL = "deployment-blocking";
export const BLOCKING_LABEL_KEY_TO_EVENT: Record<string, (typeof AUTH_BLOCKING_EVENTS)[number]> = {
  "before-create": "providers/cloud.auth/eventTypes/user.beforeCreate",
  "before-sign-in": "providers/cloud.auth/eventTypes/user.beforeSignIn",
};
export const BLOCKING_EVENT_TO_LABEL_KEY: Record<(typeof AUTH_BLOCKING_EVENTS)[number], string> = {
  "providers/cloud.auth/eventTypes/user.beforeCreate": "before-create",
  "providers/cloud.auth/eventTypes/user.beforeSignIn": "before-sign-in",
};
