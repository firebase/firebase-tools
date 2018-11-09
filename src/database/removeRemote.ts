import { Response } from "request";
import * as request from "request";
import * as responseToError from "../responseToError";
import * as utils from "../utils";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as api from "../api";

export enum NodeSize {
  SMALL = "small",
  LARGE = "large",
  EMPTY = "empty",
}

export interface RemoveRemote {
  /**
   *
   * @param {string} path
   * @return {Promise<boolean>} true if the deletion is sucessful.
   */
  deletePath(path: string): Promise<boolean>;

  /**
   *
   * Run a prefetch test on a path before issuing a delete to detect
   * large subtrees and issue recursive chunked deletes instead.
   *
   * @param {string} path
   * @return {Promise<NodeSize>}j
   */
  prefetchTest(path: string): Promise<NodeSize>;

  /**
   *
   * @param {string} path
   * @return {Promise<string[]>} the list of sub pathes found.
   */
  listPath(path: string): Promise<string[]>;
}

export class RTDBRemoveRemote implements RemoveRemote {
  private instance: string;

  constructor(instance: string) {
    this.instance = instance;
  }

  public deletePath(path: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const url =
        utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?print=silent";
      const reqOptions = {
        url,
        json: true,
      };
      return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
        request.del(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError(`Unexpected error while removing data at ${path}`, {
                exit: 2,
                original: err,
              })
            );
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }
          logger.debug(`[database] Sucessfully removed data at ${path}`);
          return resolve(true);
        });
      });
    });
  }

  public prefetchTest(path: string): Promise<NodeSize> {
    const url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?timeout=100ms";
    const reqOptions = {
      url,
    };
    return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
      return new Promise<NodeSize>((resolve, reject) => {
        logger.debug(`[database] Prefetching test at ${path}`);
        request.get(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError(`Unexpected error while prefetching data to delete ${path}`, {
                exit: 2,
              })
            );
          }
          switch (res.statusCode) {
            case 200:
              if (body) {
                return resolve(NodeSize.SMALL);
              } else {
                return resolve(NodeSize.EMPTY);
              }
            case 400:
              // timeout. large subtree, recursive delete for each subtree
              return resolve(NodeSize.LARGE);
            case 413:
              // payload too large. large subtree, recursive delete for each subtree
              return resolve(NodeSize.LARGE);
            default:
              return reject(responseToError(res, body));
          }
        });
      });
    });
  }

  public listPath(path: string): Promise<string[]> {
    const url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) +
      path +
      ".json?shallow=true&limitToFirst=50000";
    const reqOptions = {
      url,
    };
    return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
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
    });
  }
}
