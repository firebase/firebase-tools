import * as pathLib from "path";
import * as FirebaseError from "../error";
import * as logger from "../logger";

import { RemoveRemote, RTDBRemoveRemote } from "./removeRemote";
import { Stack } from "../throttler/stack";

export interface DatabaseRemoveOptions {
  // RTBD instance ID.
  instance: string;
  // Number of concurrent chunk deletes to allow.
  concurrency: number;
  // Number of retries for each chunk delete.
  retries: number;
}

function sumList(ls: number[]) {
  return ls.reduce((acc, x) => acc + x, 0);
}

function chunkList(ls: number[], chunkSize: number) {
  const chunks = [];
  for (let i = 0; i < ls.length; i += chunkSize) {
    chunks.push(ls.slice(i, i + chunkSize));
  }
  return chunks;
}

export default class DatabaseRemove {
  path: string;
  concurrency: number;
  retries: number;
  remote: RemoveRemote;
  private jobStack: Stack<() => Promise<any>>;
  private INITIAL_DELETE_BATCH_SIZE = 25;
  private INITIAL_SHALLOW_GET_SIZE = 100;
  private MAX_SHALLOW_GET_SIZE = 102400;

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

  async execute(): Promise<number> {
    return this.deletePath(this.path);
  }

  private async deletePath(path: string): Promise<number> {
    const deleteSucessful = await this.jobStack.run<NodeSize>(() => this.remote.deletePath(path));
    if (deleteSucessful) {
      return Promise.resolve(1);
    }
    let numChildDeleted = 0;
    let numDeleteTaken = 0;
    let deleteBatchSize = INITIAL_DELETE_BATCH_SIZE;
    let shallowGetBatchSize = INITIAL_SHALLOW_GET_SIZE;
    while (true) {
      const childrenList = await this.jobStack.run<string[]>(() =>
        this.remote.listPath(paths, shallowGetBatchSize)
      );
      if (childrenList.length == 0) {
        return Promise.resolve(numDeleteTaken);
      }
      const chunks = chunkList(childrenList, deleteBatchSize);
      const nDeletes = await Promise.all(chunks.map((p) => this.deleteChildren(path, chunks))).then(
        sumList
      );
      numChildDeleted += childrenList.length;
      numDeleteTaken += nDeletes;
      if (nDeletes == chunks.length) {
        // All chunks are small, double deleteBatchSize.
        deleteBatchSize = deleteBatchSize * 2;
      } else {
        // Some chunk are large, set deleteBatchSize to the average sucessful chunk size.
        // If all children are large, then deleteBatchSize will be set to 1.
        deleteBatchSize = Math.ceil(numChildDeleted / numDeleteTaken);
      }
      const suggestBatchSize = Math.ceil(
        suggestBatchSizeList.reduce((p, c) => p + c, 0) / suggestBatchSizeList.length
      );
      // Start with small number of children to learn about an appropriate size.
      if (shallowGetBatchSize <= MAX_SHALLOW_GET_SIZE) {
        shallowGetBatchSize = shallowGetBatchSize * 2;
      }
    }
  }

  private async deleteChildren(path: string, children: string[]): Promise<number> {
    if (children.length == 0) {
      throw new Exception("deleteChildren is called with empty children list");
    }
    if (children.length == 1) {
      return deletePath(pathLib.join(path, children[0]));
    }
    // there is at least two children
    const deleteSucessful = await this.jobStack.run<NodeSize>(() =>
      this.remote.deleteSubPath(paths, children)
    );
    if (deleteSucessful) {
      return Promise.resolve(1);
    }
    const mid = Math.floor(children.length / 2);
    return Promise.all([
      deleteChildren(path, children.slice(0, mid)),
      deleteChildren(path, children.slice(mid)),
    ]).then(sumList);
  }
}
