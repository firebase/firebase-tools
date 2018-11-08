"use strict";

import * as pathLib from "path";
import { Queue } from "../queue";
import FirebaseError = require("../error");
import logger = require("../logger");
import RemoveRemote from "./remove-remote";

class DatabaseRemove {
  public path: string;
  public concurrency: number;
  public retries: number;
  public remote: any;
  private jobQueue: Queue<string>;
  private waitingPath: Map<string, number>;

  /**
   * Construct a new RTDB delete operation.
   *
   * @constructor
   * @param {string} path path to delete.
   * @param {string} options.instance the RTDB instance ID.
   * @param {string} options.concurrency the number of concurrent chunk delete allowed
   * @param {string} options.retires the number of retries for each chunk delete
   */
  constructor(path: string, options: any) {
    this.path = path;
    this.concurrency = options.concurrency;
    this.retries = options.retries;
    this.remote = options.remote || new RemoveRemote(options.instance);
    this.waitingPath = new Map();
    this.jobQueue = new Queue({
      name: "long delete queue",
      concurrency: this.concurrency,
      handler: this.chunkedDelete.bind(this),
      retries: this.retries,
    });
    this.jobQueue.add(this.path);
  }

  public execute(): Promise<void> {
    return this.jobQueue.wait();
  }

  private chunkedDelete(path: string): Promise<any> {
    return this.remote
      .prefetchTest(path)
      .then((test: string) => {
        switch (test) {
          case "small":
            return this.remote.deletePath(path);
          case "large":
            return this.remote.listPath(path).then((pathList: string[]) => {
              if (pathList) {
                for (const p of pathList) {
                  this.jobQueue.add(pathLib.join(path, p));
                }
                this.waitingPath.set(path, pathList.length);
              }
              return false;
            });
          case "empty":
            return true;
          default:
            throw new FirebaseError("Unexpected prefetch test result: " + test, { exit: 3 });
        }
      })
      .then((deleted: boolean) => {
        if (deleted) {
          if (path === this.path) {
            this.jobQueue.close();
            logger.debug("[database][long delete queue][FINAL]", this.jobQueue.stats());
          } else {
            const parentPath = pathLib.dirname(path);
            const prevParentPathReference = this.waitingPath.get(parentPath);
            if (!prevParentPathReference) {
              throw new FirebaseError(
                "Unexpected error: parent path reference is zero for path=" + path,
                { exit: 3 }
              );
            }
            this.waitingPath.set(parentPath, prevParentPathReference - 1);
            if (this.waitingPath.get(parentPath) === 0) {
              this.jobQueue.add(parentPath);
              this.waitingPath.delete(parentPath);
            }
          }
        }
      });
  }
}

export default DatabaseRemove;
