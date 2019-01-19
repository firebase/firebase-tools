import * as pathLib from "path";
import * as FirebaseError from "../error";
import * as logger from "../logger";

import { RemoveRemote, RTDBRemoveRemote } from "./removeRemote";
import { Stack } from "../throttler/stack";

function chunkList<T>(ls: T[], chunkSize: number): T[][] {
  const chunks = [];
  for (let i = 0; i < ls.length; i += chunkSize) {
    chunks.push(ls.slice(i, i + chunkSize));
  }
  return chunks;
}

const INITIAL_DELETE_BATCH_SIZE = 25;
const INITIAL_SHALLOW_GET_SIZE = 100;
const MAX_SHALLOW_GET_SIZE = 204800;

export default class DatabaseRemove {
  path: string;
  remote: RemoveRemote;
  private deleteJobStack: Stack<() => Promise<boolean>, boolean>;
  private listStack: Stack<() => Promise<string[]>, string[]>;

  /**
   * Construct a new RTDB delete operation.
   *
   * @constructor
   * @param instance RTBD instance ID.
   * @param path path to delete.
   */
  constructor(instance: string, path: string) {
    this.path = path;
    this.remote = new RTDBRemoveRemote(instance);
    this.deleteJobStack = new Stack({
      name: "delete stack",
      concurrency: 1,
      retries: 3,
    });
    this.listStack = new Stack({
      name: "list stack",
      concurrency: 1,
      retries: 3,
    });
  }

  async execute(): Promise<void> {
    await this.deletePath(this.path);
  }

  /**
   * @return true if this path is small (i.e. can be deleted with a single request with writeSizeLimit=tiny),
   */
  private async deletePath(path: string): Promise<boolean> {
    if (await this.deleteJobStack.run(() => this.remote.deletePath(path))) {
      return Promise.resolve(true);
    }
    let shallowGetBatchSize = INITIAL_SHALLOW_GET_SIZE;
    // The range of batchSize to gradually narrow down.
    let batchSizeLow = 1;
    let batchSizeHigh = MAX_SHALLOW_GET_SIZE + 1;
    let batchSize = INITIAL_DELETE_BATCH_SIZE;
    while (true) {
      const childrenList = await this.listStack.run(() =>
        this.remote.listPath(path, shallowGetBatchSize)
      );
      if (childrenList.length == 0) {
        return Promise.resolve(false);
      }
      const chunks = chunkList(childrenList, batchSize);
      let nNoRetry = 0;
      for (const chunk of chunks) {
        if (await this.deleteChildren(path, chunk)) {
          nNoRetry += 1;
        }
      }
      // Narrow the batchSize range depending on whether the majority of the chunks are small.
      if (nNoRetry > chunks.length / 2) {
        batchSizeLow = batchSize;
        batchSize = Math.floor(
          Math.min(deleteBatchSize * 2, (batchSizeHigh + deleteBatchSize) / 2)
        );
      } else {
        batchSizeHigh = batchSize;
        batchSize = Math.floor((batchSizeLow + deleteBatchSize) / 2);
      }
      // Start with small number of children to learn about an appropriate batchSize.
      if (shallowGetBatchSize * 2 <= MAX_SHALLOW_GET_SIZE) {
        shallowGetBatchSize = shallowGetBatchSize * 2;
      } else {
        shallowGetBatchSize = Math.floor(MAX_SHALLOW_GET_SIZE / batchSize) * deleteBatchSize;
      }
    }
  }

  private async deleteChildren(path: string, children: string[]): Promise<boolean> {
    if (children.length == 0) {
      throw new Error("deleteChildren is called with empty children list");
    }
    if (children.length == 1) {
      return this.deletePath(pathLib.join(path, children[0]));
    }
    if (await this.deleteJobStack.run(() => this.remote.deleteSubPath(path, children))) {
      return Promise.resolve(true);
    }
    const mid = Math.floor(children.length / 2);
    await this.deleteChildren(path, children.slice(0, mid));
    await this.deleteChildren(path, children.slice(mid));
    return Promise.resolve(false);
  }
}
