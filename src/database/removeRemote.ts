import * as request from "request";
import { Response } from "request";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import * as logger from "../logger";
import * as api from "../api";

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

  constructor(instance: string) {
    this.instance = instance;
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

  private patch(path: string, body: any, note: string): Promise<boolean> {
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      const url =
        utils.addSubdomain(api.realtimeOrigin, this.instance) +
        path +
        ".json?print=silent&writeSizeLimit=tiny";
      return api
        .addRequestHeaders({
          url,
          body,
          json: true,
        })
        .then((reqOptionsWithToken) => {
          request.patch(reqOptionsWithToken, (err: Error, res: Response, resBody: any) => {
            if (err) {
              return reject(
                new FirebaseError(`Unexpected error while removing data at ${path}`, {
                  exit: 2,
                  original: err,
                })
              );
            }
            const dt = Date.now() - t0;
            if (res.statusCode >= 400) {
              logger.debug(
                `[database] Failed to remove ${note} at ${path} time: ${dt}ms, will try recursively chunked deletes.`
              );
              return resolve(false);
            }
            logger.debug(`[database] Sucessfully removed ${note} at ${path} time: ${dt}ms`);
            return resolve(true);
          });
        });
    });
  }
}
