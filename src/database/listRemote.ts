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
  listPath(
    path: string,
    numSubPath: number,
    startAfter?: string,
    timeout?: number
  ): Promise<string[]>;
}

export class RTDBListRemote implements ListRemote {
  private instance: string;

  constructor(instance: string) {
    this.instance = instance;
  }

  async listPath(
    path: string,
    numSubPath: number,
    startAfter?: string,
    timeout?: number
  ): Promise<string[]> {
    const timeoutParam = timeout ? `timeout=${timeout}ms` : ``;
    const startAfterParam = startAfter ? `startAfter=${startAfter}` : ``;
    const url =
      `${utils.addSubdomain(api.realtimeOrigin, this.instance)}` +
      `${path}.json?shallow=true&limitToFirst=${numSubPath}` +
      `&${startAfterParam}&${timeoutParam}`;

    const t0 = Date.now();
    const reqOptionsWithToken = await api.addRequestHeaders({ url });
    const paths = await new Promise<string[]>((resolve, reject) => {
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
        return resolve([]);
      });
    });
    const dt = Date.now() - t0;
    logger.debug(`[database] Sucessfully fetched ${paths.length} path at ${path} ${dt}`);
    return paths;
  }
}
