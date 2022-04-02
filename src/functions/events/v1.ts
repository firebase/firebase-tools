export const BEFORE_CREATE_EVENT = "google.cloud.auth.user.v1.beforecreate"; // "google.cloud.auth.user.v1.beforeCreate";

export const BEFORE_SIGNIN_EVENT = "google.cloud.auth.user.v1.beforesignin"; // "google.cloud.auth.user.v1.beforeSignIn";

export const AUTH_BLOCKING_EVENTS = [BEFORE_CREATE_EVENT, BEFORE_SIGNIN_EVENT] as const;

export type Event = typeof AUTH_BLOCKING_EVENTS[number];
