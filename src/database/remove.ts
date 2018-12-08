import * as pathLib from "path";
import * as FirebaseError from "../error";
import * as logger from "../logger";

import { RemoveRemote, RTDBRemoveRemote } from "./removeRemote";
import { Stack } from "../throttler/stack";

function sumList(ls: number[]): number {
  return ls.reduce((acc, x) => acc + x, 0);
}

function chunkList<T>(ls: T[], chunkSize: number): T[][] {
  const chunks = [];
  for (let i = 0; i < ls.length; i += chunkSize) {
    chunks.push(ls.slice(i, i + chunkSize));
  }
  return chunks;
}

const INITIAL_DELETE_BATCH_SIZE = 25;
const INITIAL_SHALLOW_GET_SIZE = 100;
const MAX_SHALLOW_GET_SIZE = 100000;

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

  async execute(): Promise<number> {
    return this.deletePath(this.path);
  }

  private async deletePath(path: string): Promise<number> {
    const deleteSucessful = await this.deleteJobStack.run(() => this.remote.deletePath(path));
    if (deleteSucessful) {
      return Promise.resolve(1);
    }
    let numChildDeleted = 0;
    let numDeleteTaken = 0;
    let deleteBatchSize = INITIAL_DELETE_BATCH_SIZE;
    let shallowGetBatchSize = INITIAL_SHALLOW_GET_SIZE;
    while (true) {
      const childrenList = await this.listStack.run(() =>
        this.remote.listPath(path, shallowGetBatchSize)
      );
      if (childrenList.length == 0) {
        return Promise.resolve(numDeleteTaken);
      }
      const chunks = chunkList(childrenList, deleteBatchSize);
      const nDeletes = await Promise.all(chunks.map((p) => this.deleteChildren(path, p))).then(
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
      // Start with small number of children to learn about an appropriate size.
      if (shallowGetBatchSize * 2 <= MAX_SHALLOW_GET_SIZE) {
        shallowGetBatchSize = shallowGetBatchSize * 2;
      }
    }
  }

  private async deleteChildren(path: string, children: string[]): Promise<number> {
    if (children.length == 0) {
      throw new Error("deleteChildren is called with empty children list");
    }
    if (children.length == 1) {
      return this.deletePath(pathLib.join(path, children[0]));
    }
    // there is at least two children
    const deleteSucessful = await this.deleteJobStack.run(() =>
      this.remote.deleteSubPath(path, children)
    );
    if (deleteSucessful) {
      return Promise.resolve(1);
    }
    const mid = Math.floor(children.length / 2);
    return Promise.all([
      this.deleteChildren(path, children.slice(0, mid)),
      this.deleteChildren(path, children.slice(mid)),
    ]).then(sumList);
  }
}
