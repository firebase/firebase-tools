import { Client } from "../apiv2";
import { URL } from "url";
import { logger } from "../logger";
import * as utils from "../utils";

export interface RemoveRemote {
  /**
   * @param path the path to delete
   * @return false if the deleteion failed because the path exceeds the writeSizeLimit.
   */
  deletePath(path: string): Promise<boolean>;

  /**
   * @param path the path to delete subpaths from
   * @param subPaths the subpaths
   * @return false if the deleteion failed because the the total size of subpaths exceeds the writeSizeLimit.
   */
  deleteSubPath(path: string, subPaths: string[]): Promise<boolean>;
}

export class RTDBRemoveRemote implements RemoveRemote {
  private instance: string;
  private host: string;
  private apiClient: Client;
  private disableTriggers: boolean;

  constructor(instance: string, host: string, disableTriggers: boolean) {
    this.instance = instance;
    this.host = host;
    this.disableTriggers = disableTriggers;

    const url = new URL(utils.getDatabaseUrl(this.host, this.instance, "/"));
    this.apiClient = new Client({ urlPrefix: url.origin, auth: true });
  }

  deletePath(path: string): Promise<boolean> {
    return this.patch(path, null, "all data");
  }

  deleteSubPath(path: string, subPaths: string[]): Promise<boolean> {
    const body: any = {};
    for (const c of subPaths) {
      body[c] = null;
    }
    return this.patch(path, body, `${subPaths.length} subpaths`);
  }

  private async patch(path: string, body: any, note: string): Promise<boolean> {
    const t0 = Date.now();
    const url = new URL(utils.getDatabaseUrl(this.host, this.instance, path + ".json"));
    const queryParams = {
      print: "silent",
      writeSizeLimit: "tiny",
      disableTriggers: this.disableTriggers.toString(),
    };
    const res = await this.apiClient.request({
      method: "PATCH",
      path: url.pathname,
      body,
      queryParams,
      responseType: "stream",
      resolveOnHTTPError: true,
    });
    const dt = Date.now() - t0;
    if (res.status >= 400) {
      logger.debug(
        `[database] Failed to remove ${note} at ${path} time: ${dt}ms, will try recursively chunked deletes.`,
      );
      return false;
    }
    logger.debug(`[database] Sucessfully removed ${note} at ${path} time: ${dt}ms`);
    return true;
  }
}
