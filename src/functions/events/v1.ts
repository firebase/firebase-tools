export const AUTH_BLOCKING_EVENTS = [
  "providers/cloud.auth/eventTypes/user.beforeCreate",
  "providers/cloud.auth/eventTypes/user.beforeSignIn",
] as const;

export type Event = typeof AUTH_BLOCKING_EVENTS[number];
