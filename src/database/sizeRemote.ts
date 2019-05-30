import * as request from "request";
import { Response } from "request";
import * as responseToError from "../responseToError";
import * as utils from "../utils";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as api from "../api";

export interface SizeResult {
  success: boolean;
  bytes: number;
  error: FirebaseError;
}

export interface SizeRemote {
  /**
   * Call the shallow get API with limitToFirst=numSubPath.
   * @param path the path to list
   * @param numSubPath the number of subPaths to fetch.
   * @return the list of sub pathes found.
   */
  sizeNode(path: string, timeout: number): Promise<SizeResult>;
}

export class RTDBSizeRemote implements SizeRemote {
  private instance: string;

  constructor(instance: string) {
    this.instance = instance;
  }

  sizeNode(path: string, timeout: number): Promise<SizeResult> {
    const url = `${utils.addSubdomain(api.realtimeOrigin, this.instance)}${path}.json`;
    const params: any = { timeout: `${timeout}ms` };

    const reqOptions = {
      url,
    };
    return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
      reqOptionsWithToken.qs = params;
      return new Promise((resolve, reject) => {
        request.get(reqOptionsWithToken, (err: Error, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError(`Unexpected error sizing node: ${path}`, {
                exit: 2,
                original: err,
              })
            );
          }
          let data = {};
          try {
            data = JSON.parse(body);
          } catch (e) {
            return reject(
              new FirebaseError(`Malformed JSON response when sizing node: ${path}`, {
                exit: 2,
                original: e,
              })
            );
          }
          if (res.statusCode >= 400) {
            return resolve({
              success: false,
              bytes: 0,
              error: responseToError(res, data),
            });
          }
          /*
           * For simplicity, we consider size to be the raw byte length
           * in the payload of the response. This is an estimate. It
           * does not necessarily reflect the size of the JSON subtree
           * as stored in the RTDB persistence layer, but is meaningful
           * to applications that process the output of such requests.
           */
          return resolve({
            success: true,
            bytes: Buffer.byteLength(body),
            error: undefined,
          });
        });
      });
    });
  }
}
