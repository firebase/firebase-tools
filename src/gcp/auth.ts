import * as api from "../api";
// import { autoInject } from "async";

export interface Domains {
  authorizedDomains: string[];
}

export async function getAuthDomains(project: string): Promise<string[]> {
  const res = await api.request("GET", `/admin/v2/projects/${project}/config`, {
    auth: true,
    origin: api.identityOrigin,
  });
  return res?.body?.authorizedDomains;
}

export async function updateAuthDomains(project: string, authDomains: string[]): Promise<Domains> {
  const resp = await api.request(
    "PATCH",
    `/admin/v2/projects/${project}/config?update_mask=authorizedDomains`,
    {
      auth: true,
      origin: api.identityOrigin,
      data: {
        authorizedDomains: authDomains,
      },
    }
  );
  return resp.body;
}
