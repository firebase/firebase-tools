import { Client } from "../apiv2";
import { URL } from "url";
import { logger } from "../logger";
import * as utils from "../utils";

export interface ListRemote {
  /**
   * Call the shallow get API with limitToFirst=numSubPath.
   * @param path the path to list
   * @param numSubPath the number of subPaths to fetch.
   * @param startAfter omit list entries comparing lower than `startAfter`
   * @param timeout milliseconds after which to timeout the request
   * @return the list of sub pathes found.
   */
  listPath(
    path: string,
    numSubPath: number,
    startAfter?: string,
    timeout?: number,
  ): Promise<string[]>;
}

export class RTDBListRemote implements ListRemote {
  private apiClient: Client;

  constructor(
    private instance: string,
    private host: string,
  ) {
    const url = new URL(utils.getDatabaseUrl(this.host, this.instance, "/"));
    this.apiClient = new Client({ urlPrefix: url.origin, auth: true });
  }

  async listPath(
    path: string,
    numSubPath: number,
    startAfter?: string,
    timeout?: number,
  ): Promise<string[]> {
    const url = new URL(utils.getDatabaseUrl(this.host, this.instance, path + ".json"));

    const params: any = {
      shallow: true,
      limitToFirst: numSubPath,
    };
    if (startAfter) {
      params.startAfter = startAfter;
    }
    if (timeout) {
      params.timeout = `${timeout}ms`;
    }

    const t0 = Date.now();
    const res = await this.apiClient.get<{ [key: string]: unknown }>(url.pathname, {
      queryParams: params,
    });
    const paths = res.body ? Object.keys(res.body) : [];
    const dt = Date.now() - t0;
    logger.debug(`[database] sucessfully fetched ${paths.length} path at ${path} ${dt}`);
    return paths;
  }
}
