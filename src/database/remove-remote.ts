"use strict";

import { Response } from "request";
import * as request from "request";
import responseToError = require("../responseToError");
import utils = require("../utils");
import FirebaseError = require("../error");
import logger = require("../logger");
import api = require("../api");

class RemoveRemote {
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
        request.del(reqOptionsWithToken, (err: any, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError("Unexpected error while removing data at " + path, {
                exit: 2,
                original: err,
              })
            );
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }
          logger.debug("[database] Sucessfully removed data at " + path);
          return resolve(true);
        });
      });
    });
  }

  public prefetchTest(path: string): Promise<string> {
    const url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?timeout=100ms";
    const reqOptions = {
      url,
    };
    return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
      return new Promise<string>((resolve, reject) => {
        logger.debug("[database] Prefetching test at " + path);
        request.get(reqOptionsWithToken, (err: any, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError("Unexpected error while prefetching data to delete" + path, {
                exit: 2,
              })
            );
          }
          switch (res.statusCode) {
            case 200:
              if (body) {
                return resolve("small");
              } else {
                return resolve("empty");
              }
            case 400:
              // timeout. large subtree, recursive delete for each subtree
              return resolve("large");
            case 413:
              // payload too large. large subtree, recursive delete for each subtree
              return resolve("large");
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
        request.get(reqOptionsWithToken, (err: any, res: Response, body: any) => {
          if (err) {
            return reject(
              new FirebaseError("Unexpected error while list subtrees", {
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
          return resolve([]);
        });
      });
    });
  }
}

export default RemoveRemote;
