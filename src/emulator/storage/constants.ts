import { randomBytes } from "node:crypto";

export const privateKey = randomBytes(32).toString("hex");
