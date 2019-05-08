import * as logger from "../logger";
import * as pathLib from "path";

import { ListRemote, RTDBListRemote } from "./listRemote";
import { RTDBSizeRemote, SizeRemote } from "./sizeRemote";
import { Queue } from "../throttler/queue";

/*
 * For flat objects, performance suffers due to "slow-start"
 * shallow gets. We set a generous initial list batch size
 * to mitigate this.
 */
const LIST_BATCH_SIZE = 2000;
const TIMEOUT = 100;

export default class DatabaseSize {
  path: string;
  sizeEstimate: number;

  listRemote: ListRemote;
  sizeRemote: SizeRemote;

  private listQueue: Queue<() => Promise<string[]>, string[]>;

  constructor(instance: string, path: string) {
    this.path = path;
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
    let sizeEstimate = 0;
    try {
      sizeEstimate = await this.sizeRemote.sizeNode(path, TIMEOUT);
    } catch (e) {
      if (e.status !== 400) {
        logger.debug(`Unexpected error: '${e.message}' when sizing node ${path}. Ignoring.`);
      }
      let subPaths: string[] = [];
      let offset: string;

      /*
       * Alot a single byte for the open and close braces
       * in the root JSON object.
       */
      do {
        subPaths = await this.listQueue.run(() =>
          this.listRemote.listPath(path, LIST_BATCH_SIZE, offset, TIMEOUT)
        );
        if (subPaths.length === 0) {
          break;
        }
        offset = subPaths[subPaths.length - 1];
        const promises: { [index: string]: Promise<number> } = {};

        /*
         * Kick off asynchronous recursive calls.
         */
        for (const subPath of subPaths) {
          promises[subPath] = this.getSubtreeSize(pathLib.join(path, subPath));
        }

        /*
         * Join recursive sizing calls and count the number
         * we were able to do with a simple get (no listing).
         */
        for (const subPath of subPaths) {
          const size = await promises[subPath];
          sizeEstimate += size;
        }
      } while (subPaths.length > 0);
    }
    return Promise.resolve(sizeEstimate);
  }
}
