import * as pathLib from "path";

import { RemoveRemote, RTDBRemoveRemote } from "./removeRemote";
import { ListRemote, RTDBListRemote } from "./listRemote";
import { Stack } from "../throttler/stack";

function chunkList<T>(ls: T[], chunkSize: number): T[][] {
  const chunks = [];
  for (let i = 0; i < ls.length; i += chunkSize) {
    chunks.push(ls.slice(i, i + chunkSize));
  }
  return chunks;
}

const INITIAL_DELETE_BATCH_SIZE = 25;
const INITIAL_LIST_NUM_SUB_PATH = 100;
const MAX_LIST_NUM_SUB_PATH = 204800;

export default class DatabaseRemove {
  path: string;
  remote: RemoveRemote;
  listRemote: ListRemote;
  private deleteJobStack: Stack<() => Promise<boolean>, boolean>;
  private listStack: Stack<() => Promise<string[]>, string[]>;

  /**
   * Construct a new RTDB delete operation.
   *
   * @param instance RTBD instance ID.
   * @param path path to delete.
   * @param host db host.
   * @param disableTriggers if true, suppresses any Cloud functions that would be triggered by this operation.
   */
  constructor(instance: string, path: string, host: string, disableTriggers: boolean) {
    this.path = path;
    this.remote = new RTDBRemoveRemote(instance, host, disableTriggers);
    this.deleteJobStack = new Stack({
      name: "delete stack",
      concurrency: 1,
      retries: 3,
    });
    this.listRemote = new RTDBListRemote(instance, host);
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
   * First, attempt to delete the path, if the path is big (i.e. exceeds writeSizeLimit of tiny),
   * it will perform multi-path recursive chunked deletes in rounds.
   * Each round, it fetches listNumSubPath subPaths and issue batches based on batchSize.
   * At the end of each round, it adjustes the batchSize based on whether the majority of the batches are small.
   *
   * listNumSubPath starts with INITIAL_LIST_NUM_SUB_PATH and grow expontentially until MAX_LIST_NUM_SUB_PATH.
   *
   * @param path path to delete
   * @return true if this path is small (Does not exceed writeSizeLimit of tiny)
   */
  private async deletePath(path: string): Promise<boolean> {
    if (await this.deleteJobStack.run(() => this.remote.deletePath(path))) {
      return true;
    }
    let listNumSubPath = INITIAL_LIST_NUM_SUB_PATH;
    // The range of batchSize to gradually narrow down.
    let batchSizeLow = 1;
    let batchSizeHigh = MAX_LIST_NUM_SUB_PATH + 1;
    let batchSize = INITIAL_DELETE_BATCH_SIZE;
    while (true) {
      const subPathList = await this.listStack.run(() =>
        this.listRemote.listPath(path, listNumSubPath),
      );
      if (subPathList.length === 0) {
        return false;
      }
      const chunks = chunkList(subPathList, batchSize);
      let nSmallChunks = 0;
      for (const chunk of chunks) {
        if (await this.deleteSubPath(path, chunk)) {
          nSmallChunks += 1;
        }
      }
      // Narrow the batchSize range depending on whether the majority of the chunks are small.
      if (nSmallChunks > chunks.length / 2) {
        batchSizeLow = batchSize;
        batchSize = Math.floor(Math.min(batchSize * 2, (batchSizeHigh + batchSize) / 2));
      } else {
        batchSizeHigh = batchSize;
        batchSize = Math.floor((batchSizeLow + batchSize) / 2);
      }
      // Start with small number of sub paths to learn about an appropriate batchSize.
      if (listNumSubPath * 2 <= MAX_LIST_NUM_SUB_PATH) {
        listNumSubPath = listNumSubPath * 2;
      } else {
        listNumSubPath = Math.floor(MAX_LIST_NUM_SUB_PATH / batchSize) * batchSize;
      }
    }
  }

  /*
   * Similar to deletePath, but delete multiple subpaths at once.
   * If the combined size of subpaths is big, it will divide and conquer.
   * It fallbacks to deletePath to perform recursive chunked deletes if only one subpath is provided.
   *
   * @return true if the combined size is small (Does not exceed writeSizeLimit of tiny)
   */
  private async deleteSubPath(path: string, subPaths: string[]): Promise<boolean> {
    if (subPaths.length === 0) {
      throw new Error("deleteSubPath is called with empty subPaths list");
    }
    if (subPaths.length === 1) {
      return this.deletePath(pathLib.join(path, subPaths[0]));
    }
    if (await this.deleteJobStack.run(() => this.remote.deleteSubPath(path, subPaths))) {
      return true;
    }
    const mid = Math.floor(subPaths.length / 2);
    await this.deleteSubPath(path, subPaths.slice(0, mid));
    await this.deleteSubPath(path, subPaths.slice(mid));
    return false;
  }
}
