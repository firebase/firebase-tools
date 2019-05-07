import * as request from "request";
import { Response } from "request";
import * as responseToError from "../responseToError";
import * as utils from "../utils";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as api from "../api";

export interface SizeRemote {
  /**
   * Call the shallow get API with limitToFirst=numSubPath.
   * @param path the path to list
   * @param numSubPath the number of subPaths to fetch.
   * @return the list of sub pathes found.
   */
  sizeNode(path: string, timeout: number): Promise<number>;
}

export class RTDBSizeRemote implements SizeRemote {
  private instance: string;

  constructor(instance: string) {
    this.instance = instance;
  }

  sizeNode(path: string, timeout: number): Promise<number> {
    const url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) +
      path +
      ".json?timeout=" +
      timeout +
      "ms";
    const reqOptions = {
      url,
    };
    return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
      return new Promise((resolve, reject) => {
        let response: any;
        let errorResponse = "";
        let payload = "";
        let erroring = false;
        let size = 0;

        request
          .get(reqOptionsWithToken)
          .on("response", (res) => {
            response = res;
            if (response.statusCode >= 400) {
              erroring = true;
            }
          })
          .on("data", (chunk) => {
            if (erroring) {
              errorResponse += chunk;
            } else {
              size += Buffer.byteLength(chunk);
              payload += chunk;
            }
          })
          .on("end", () => {
            let data = {};
            if (erroring) {
              try {
                data = JSON.parse(errorResponse);
                return reject(responseToError(response, data));
              } catch (e) {
                return reject(
                  new FirebaseError("Malformed JSON response", {
                    exit: 2,
                    original: e,
                  })
                );
              }
            } else {
              try {
                data = JSON.parse(payload);
                resolve(size);
              } catch (e) {
                return reject(
                  new FirebaseError("Malformed JSON response", {
                    exit: 2,
                    original: e,
                  })
                );
              }
            }
          })
          .on("error", reject);
      });
    });
  }
}
