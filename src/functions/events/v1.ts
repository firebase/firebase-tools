export const BEFORE_CREATE_EVENT = "providers/cloud.auth/eventTypes/user.beforeCreate";

export const BEFORE_SIGN_IN_EVENT = "providers/cloud.auth/eventTypes/user.beforeSignIn";

export const AUTH_BLOCKING_EVENTS = [BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT] as const;

export type Event = typeof AUTH_BLOCKING_EVENTS[number];
