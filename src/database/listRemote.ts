import * as request from "request";
import { Response } from "request";
import * as responseToError from "../responseToError";
import * as utils from "../utils";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as api from "../api";

export interface ListRemote {
  /**
   * Call the shallow get API with limitToFirst=numSubPath.
   * @param path the path to list
   * @param numSubPath the number of subPaths to fetch.
   * @return the list of sub pathes found.
   */
  listPath(path: string, numSubPath: number, offset?: string): Promise<string[]>;
}

export class RTDBListRemote implements ListRemote {
  private instance: string;

  constructor(instance: string) {
    this.instance = instance;
  }

  listPath(path: string, numSubPath: number, offset?: string): Promise<string[]> {
    const offsetSuffix = offset ? "&startAfter=" + offset : "";
    const url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) +
      path +
      `.json?shallow=true&limitToFirst=${numSubPath}` +
      offsetSuffix;

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
              return resolve(Object.keys(data));
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
}
