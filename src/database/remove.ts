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
  public path: string;
  public concurrency: number;
  public retries: number;
  public remote: RemoveRemote;
  private jobStack: Stack<() => Promise<any>>;

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
    this.jobStack = new Stack({
      name: "long delete stack",
      concurrency: this.concurrency,
      retries: this.retries,
    });
  }

  public execute(): Promise<void> {
    return this.chunkedDelete(this.path);
  }

  private async chunkedDelete(path: string): Promise<void> {
    const prefetchTestResult = await this.jobStack.throttle<NodeSize>(() =>
      this.remote.prefetchTest(path)
    );
    switch (prefetchTestResult) {
      case NodeSize.SMALL:
        return this.jobStack.throttle<void>(() => this.remote.deletePath(path));
      case NodeSize.LARGE:
        const pathList = await this.jobStack.throttle<string[]>(() => this.remote.listPath(path));
        await Promise.all(pathList.map((p) => this.chunkedDelete(pathLib.join(path, p))));
        return this.chunkedDelete(path);
      case NodeSize.EMPTY:
        return;
      default:
        throw new FirebaseError("Unexpected prefetch test result: ${prefetchTestResult}", {
          exit: 3,
        });
    }
  }
}
