import * as pathLib from "path";
import * as FirebaseError from "../error";
import * as logger from "../logger";

import { NodeSize, RemoveRemote, RTDBRemoveRemote } from "./removeRemote";
import { Queue } from "../queue";

export interface DatabaseRemoveOptions {
  // RTBD instance ID.
  instance: string;
  // Number of concurrent chunk deletes to allow.
  concurrency: number;
  // Number of retries for each chunk delete.
  retries: number;
}

export default class DatabaseRemove {
  public path: string;
  public concurrency: number;
  public retries: number;
  public remote: RemoveRemote;
  private jobQueue: Queue<string>;
  private waitingPath: Map<string, number>;

  /**
   * Construct a new RTDB delete operation.
   *
   * @constructor
   * @param path path to delete.
   * @param options
   */
  constructor(path: string, options: DatabaseRemoveOptions) {
    this.path = path;
    this.concurrency = options.concurrency;
    this.retries = options.retries;
    this.remote = new RTDBRemoveRemote(options.instance);
    this.waitingPath = new Map();
    this.jobQueue = new Queue({
      name: "long delete queue",
      concurrency: this.concurrency,
      handler: this.chunkedDelete.bind(this),
      retries: this.retries,
    });
  }

  public execute(): Promise<void> {
    const prom: Promise<void> = this.jobQueue.wait();
    this.jobQueue.add(this.path);
    return prom;
  }

  private chunkedDelete(path: string): Promise<any> {
    return this.remote
      .prefetchTest(path)
      .then((test: NodeSize) => {
        switch (test) {
          case NodeSize.SMALL:
            return this.remote.deletePath(path);
          case NodeSize.LARGE:
            return this.remote.listPath(path).then((pathList: string[]) => {
              if (pathList) {
                for (const p of pathList) {
                  this.jobQueue.add(pathLib.join(path, p));
                }
                this.waitingPath.set(path, pathList.length);
              }
              return false;
            });
          case NodeSize.EMPTY:
            return true;
          default:
            throw new FirebaseError("Unexpected prefetch test result: " + test, { exit: 3 });
        }
      })
      .then((deleted: boolean) => {
        if (!deleted) {
          return;
        }
        if (path === this.path) {
          this.jobQueue.close();
          logger.debug("[database][long delete queue][FINAL]", this.jobQueue.stats());
        } else {
          const parentPath = pathLib.dirname(path);
          const prevParentPathReference = this.waitingPath.get(parentPath);
          if (!prevParentPathReference) {
            throw new FirebaseError(
              `Unexpected error: parent path reference is zero for path=${path}`,
              { exit: 3 }
            );
          }
          this.waitingPath.set(parentPath, prevParentPathReference - 1);
          if (this.waitingPath.get(parentPath) === 0) {
            this.jobQueue.add(parentPath);
            this.waitingPath.delete(parentPath);
          }
        }
      });
  }
}
