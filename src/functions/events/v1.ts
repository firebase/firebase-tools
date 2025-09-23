export const BEFORE_CREATE_EVENT = "providers/cloud.auth/eventTypes/user.beforeCreate";

export const BEFORE_SIGN_IN_EVENT = "providers/cloud.auth/eventTypes/user.beforeSignIn";

export const BEFORE_SEND_EMAIL_EVENT = "providers/cloud.auth/eventTypes/user.beforeSendEmail";

export const BEFORE_SEND_SMS_EVENT = "providers/cloud.auth/eventTypes/user.beforeSendSms";

export const AUTH_BLOCKING_EVENTS = [
  BEFORE_CREATE_EVENT,
  BEFORE_SIGN_IN_EVENT,
  BEFORE_SEND_EMAIL_EVENT,
  BEFORE_SEND_SMS_EVENT,
] as const;

export type Event = (typeof AUTH_BLOCKING_EVENTS)[number];
