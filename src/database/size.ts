import * as pathLib from "path";

import { ListRemote, RTDBListRemote } from "./listRemote";
import { RTDBSizeRemote, SizeRemote } from "./sizeRemote";
import { Queue } from "../throttler/queue";

/*
 * For flat objects, performance suffers due to "slow-start"
 * shallow gets. We set a generous initial list batch size
 * to mitigate this.
 */
const INITIAL_LIST_BATCH_SIZE = 32000;
const MAX_LIST_BATCH_SIZE = 204800;

const DEFAULT_TIMEOUT = 1000;

export default class DatabaseSize {
  path: string;
  timeout: number;
  sizeEstimate: number;

  listRemote: ListRemote;
  sizeRemote: SizeRemote;

  private listQueue: Queue<() => Promise<string[]>, string[]>;

  constructor(instance: string, path: string, timeout?: number) {
    this.path = path;
    this.timeout = timeout || DEFAULT_TIMEOUT;
    this.sizeEstimate = 0;
    this.sizeRemote = new RTDBSizeRemote(instance);
    this.listRemote = new RTDBListRemote(instance);
    this.listQueue = new Queue({
      name: "list stack",
      concurrency: 1,
      retries: 3,
    });
  }

  async execute(): Promise<number> {
    return this.getSubtreeSize(this.path);
  }

  private async getSubtreeSize(path: string): Promise<number> {
    await this.getSubtreeSizeHelper(path, true);
    return Promise.resolve(this.sizeEstimate);
  }

  private async getSubtreeSizeHelper(path: string, attempt: boolean): Promise<boolean> {
    let quick: boolean = false;

    let listBatchSize = INITIAL_LIST_BATCH_SIZE;
    let listBatchSizeLow = 1;
    let listBatchSizeHigh = MAX_LIST_BATCH_SIZE + 1;

    const timeout = this.timeout;

    try {
      if (!attempt) {
        throw new Error("Skip direct size operation.");
      }
      const size = await this.sizeRemote.sizeNode(path, timeout);
      this.sizeEstimate += size;
      quick = true;
    } catch (e) {
      let subPaths = [];
      let offset: string;
      let tryChildren: boolean = true;

      /*
       * Alot a single byte for the open and close braces
       * in the root JSON object.
       */
      this.sizeEstimate += 2;
      do {
        subPaths = await this.listQueue.run(() =>
          this.listRemote.listPath(path, listBatchSize, offset)
        );
        if (subPaths.length === 0) {
          break;
        }
        offset = subPaths[subPaths.length - 1];

        const promises: { [index: string]: Promise<boolean> } = {};
        let numQuickChildren = 0;

        /*
         * Kick off asynchronous recursive calls.
         */
        for (const subPath of subPaths) {
          promises[subPath] = this.getSubtreeSizeHelper(pathLib.join(path, subPath), tryChildren);
        }

        /*
         * Join recursive sizing calls and count the number
         * we were able to do with a simple get (no listing).
         */
        for (const subPath of subPaths) {
          const fast = await promises[subPath];
          this.sizeEstimate += Buffer.byteLength(subPath);
          numQuickChildren += fast ? 1 : 0;
        }

        /*
         * Update the batch size and attempt switch based on whether
         * we were able to size the majority of direct children without
         * recursive listing.
         */
        if (numQuickChildren > subPaths.length / 2) {
          tryChildren = true;
          listBatchSizeLow = listBatchSize;
          listBatchSize = Math.floor(
            Math.min(listBatchSize * 2, (listBatchSizeHigh + listBatchSize) / 2)
          );
        } else {
          tryChildren = false;
          listBatchSizeHigh = listBatchSize;
          listBatchSize = Math.floor((listBatchSizeLow + listBatchSize) / 2);
        }
      } while (subPaths.length > 0);
    }
    return Promise.resolve(quick);
  }
}
