import * as api from "../api";

const VERSION = "v1";

export function createTopic(name: string): Promise<void> {
  return api.request("PUT", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.pubsubOrigin,
    data: { labels: { deployment: "firebase-schedule" } },
  });
}

export function deleteTopic(name: string): Promise<void> {
  return api.request("DELETE", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.pubsubOrigin,
  });
}
