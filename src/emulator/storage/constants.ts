import { randomBytes, createHmac } from "node:crypto";

export const privateKey = randomBytes(32).toString("hex");
