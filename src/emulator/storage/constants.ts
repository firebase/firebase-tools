import { randomBytes, createHmac } from "node:crypto";

export const privateKey = randomBytes(32).toString("hex");
export const SIGNED_URL_MAX_TTL_MILLIS = 7 * 24 * 60 * 60 * 1000;