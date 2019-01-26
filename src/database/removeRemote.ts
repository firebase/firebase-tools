import * as request from "request";
import { Response } from "request";
import * as responseToError from "../responseToError";
import * as utils from "../utils";
import * as FirebaseError from "../error";
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

  /**
   * Call the shallow get API with limitToFirst=numSubPath.
   * @param path the path to list
   * @param numSubPath the number of subPaths to fetch.
   * @return the list of sub pathes found.
   */
  listPath(path: string, numSubPath: number): Promise<string[]>;
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

  listPath(path: string, numSubPath: number): Promise<string[]> {
    const url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) +
      path +
      `.json?shallow=true&limitToFirst=${numSubPath}`;
    const t0 = Date.now();
    return api
      .addRequestHeaders({
        url,
      })
      .then((reqOptionsWithToken) => {
        return new Promise<string[]>((resolve, reject) => {
          request.get(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
            if (err) {
              return reject(
                new FirebaseError("Unexpected error while listing subtrees", {
                  exit: 2,
                  original: err,
                })
              );
            } else if (res.statusCode >= 400) {
              return reject(responseToError(res, body));
            }
            let data = {};
            try {
              data = JSON.parse(body);
            } catch (e) {
              return reject(
                new FirebaseError("Malformed JSON response in shallow get ", {
                  exit: 2,
                  original: e,
                })
              );
            }
            if (data) {
              const keyList = Object.keys(data);
              return resolve(keyList);
            }
            resolve([]);
          });
        });
      })
      .then((paths: string[]) => {
        const dt = Date.now() - t0;
        logger.debug(`[database] Sucessfully fetched ${paths.length} path at ${path} ${dt}`);
        return paths;
      });
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
              logger.debug(`[database] Failed to remove ${note} at ${path} time: ${dt}`);
              return resolve(false);
            }
            logger.debug(`[database] Sucessfully removed ${note} at ${path} time: ${dt}`);
            return resolve(true);
          });
        });
    });
  }
}
