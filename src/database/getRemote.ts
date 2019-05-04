import * as request from "request";
import { Response } from "request";
import * as responseToError from "../responseToError";
import * as utils from "../utils";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as api from "../api";

export interface GetRemote {
  /**
   * @param path the path to retrieve
   * @return the size in bytes of the node at the input path
   */
  getPath(path: string, timeout: number): Promise<number>;
}

export class RTDBGetRemote implements GetRemote {
  private instance: string;

  constructor(instance: string) {
    this.instance = instance;
  }

  getPath(path: string, timeout: number): Promise<number> {
    return this.getBytes(path, timeout, "subtree size");
  }

  private getBytes(path: string, timeout: number, note: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const url =
        utils.addSubdomain(api.realtimeOrigin, this.instance) +
        path +
        ".json?timeout=" +
        timeout +
        "s";
      const reqOptions = {
        url,
      };
      return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
        request.get(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
          if (err) {
            return reject();
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }
          let data = {};
          try {
            /*
             * This is strictly for validation, we resolve the promise
             * with the byte-length of the raw payload below.
             */
            data = JSON.parse(body);
          } catch (e) {
            return reject(
              new FirebaseError("Malformed JSON response", {
                exit: 2,
                original: e,
              })
            );
          }
          resolve(Buffer.byteLength(body));
        });
      });
    });
  }
}
