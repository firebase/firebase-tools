import * as api from "../api";

const VERSION = "v1";

export async function createTopic(name: string): Promise<void> {
  await api.request("PUT", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.pubsubOrigin,
    data: { labels: { deployment: "firebase-schedule" } },
  });
}

export async function deleteTopic(name: string): Promise<void> {
  await api.request("DELETE", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.pubsubOrigin,
  });
}
