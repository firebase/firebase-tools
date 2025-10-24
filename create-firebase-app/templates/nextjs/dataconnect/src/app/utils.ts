import { randomUUID } from "node:crypto";

export function getDateString() {
  return new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
  });
}

export function getRandomUUID() {
  return randomUUID();
}
