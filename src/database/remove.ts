import * as pathLib from "path";
import * as FirebaseError from "../error";
import * as logger from "../logger";

import { NodeSize, RemoveRemote, RTDBRemoveRemote } from "./removeRemote";
import { Stack } from "../throttler/stack";

export interface DatabaseRemoveOptions {
  // RTBD instance ID.
  instance: string;
  // Number of concurrent chunk deletes to allow.
  concurrency: number;
  // Number of retries for each chunk delete.
  retries: number;
}

export default class DatabaseRemove {
  path: string;
  concurrency: number;
  retries: number;
  remote: RemoveRemote;
  private jobStack: Stack<string, void>;
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
    this.jobStack = new Stack<string, void>({
      name: "long delete stack",
      concurrency: this.concurrency,
      handler: this.chunkedDelete.bind(this),
      retries: this.retries,
    });
  }

  execute(): Promise<void> {
    const prom: Promise<void> = this.jobStack.wait();
    this.jobStack.add(this.path);
    return prom;
  }

  private chunkedDelete(path: string): Promise<void> {
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
                  this.jobStack.add(pathLib.join(path, p));
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
          this.jobStack.close();
          logger.debug("[database][long delete stack][FINAL]", this.jobStack.stats());
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
            this.jobStack.add(parentPath);
            this.waitingPath.delete(parentPath);
          }
        }
      });
  }
}
