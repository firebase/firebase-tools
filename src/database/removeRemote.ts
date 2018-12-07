import { Response } from "request";
import * as request from "request";
import * as responseToError from "../responseToError";
import * as utils from "../utils";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as api from "../api";

export interface RemoveRemote {
  /**
   * @return {Promise<boolean>} true if the deletion is sucessful.
   */
  deletePath(path: string): Promise<boolean>;

  /**
   * @return {Promise<boolean>} true if the deletion is sucessful.
   */
  deleteSubPath(path: string, children: string[]): Promise<boolean>;

  /**
   * @return {Promise<string[]>} the list of sub pathes found.
   */
  listPath(path: string, numChildren: number): Promise<string[]>;
}

export class RTDBRemoveRemote implements RemoveRemote {
  private instance: string;

  constructor(instance: string) {
    this.instance = instance;
  }

  deletePath(path: string): Promise<boolean> {
    return this.patch(path, null)
    .then((x) => {
      if (x) {
          logger.debug(`[database] Sucessfully removed data at ${path}`);
          } else {
          logger.debug(`[database] Failed removed data at ${path}`);
          }
      return x;
    });
  }

  deleteSubPath(path: string, children: string[]): Promise<boolean> {
    const body:any = {};
    for (const c in children) {
      body[c] = null;
    }
    return this.patch(path, body)
    .then((x) => {
      if (x) {
      logger.debug(`[database] Sucessfully removed paths at ${path} length:${children.length} \n\r\r${children}`);
      } else {
      logger.debug(`[database] Failed removed paths at ${path} length:${children.length} \n\r\r${children}`);
      }
      return x;
    });
  }

  listPath(path: string, numChildren: number): Promise<string[]> {
    const url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) +
      path +
      `.json?shallow=true&limitToFirst=${numChildren}`;
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

  private patch(path: string, body: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const url =
        utils.addSubdomain(api.realtimeOrigin, this.instance) +
        path +
        ".json?print=silent&timeWrite=200000000";
      const reqOptions = {
        url,
        body,
        json: true,
      };
      return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
        request.patch(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError(`Unexpected error while removing data at ${path}`, {
                exit: 2,
                original: err,
              })
            );
          } else if (res.statusCode >= 400) {
          //          console.log(res);
            return resolve(false);
          }
          return resolve(true);
        });
      });
    });
  }
}
