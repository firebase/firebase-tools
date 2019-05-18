import * as logger from "../logger";
import * as pathLib from "path";

import { ListRemote, RTDBListRemote } from "./listRemote";
import { RTDBSizeRemote, SizeRemote } from "./sizeRemote";
import { SizeResult } from "./sizeResult";
import { Stack } from "../throttler/stack";

/*
 * For flat objects, performance suffers due to "slow-start"
 * shallow gets. We set a generous initial list batch size
 * to mitigate this.
 */
const LIST_BATCH_SIZE = 4000;

/*
 * This constant controls how deeply to expand nodes in the
 * tree (with shallow GETs) before attempting larger subtree
 * GETs.
 */
const SKIP_DEPTH = 1;
const TIMEOUT = 50;
const TIMEOUT_STATUS_CODE = 400;

/*
 * Control how many outstanding full GETs and shallow
 * GETs are allowed at a time. Wide trees will have
 * substantially more "size" operations, whereas deep
 * trees will have substantially more outstanding list
 * operations.
 *
 * TODO(wyszynski): run benchmarks to understand the
 * performance of the API for various concurrency values.
 */
const SIZE_STACK_CONCURRENCY = 1000;
const LIST_STACK_CONCURRENCY = 1000;

export class DatabaseSize {
  path: string;
  skipDepth: number;
  sizeEstimate: number;

  listRemote: ListRemote;
  sizeRemote: SizeRemote;

  private listStack: Stack<() => Promise<string[]>, string[]>;
  private sizeStack: Stack<() => Promise<SizeResult>, SizeResult>;

  constructor(instance: string, path: string, depth?: number) {
    this.path = path;
    this.skipDepth = depth || SKIP_DEPTH;
    this.sizeEstimate = 0;
    this.sizeRemote = new RTDBSizeRemote(instance);
    this.listRemote = new RTDBListRemote(instance);
    this.listStack = new Stack({
      name: "list stack",
      concurrency: LIST_STACK_CONCURRENCY,
      retries: 3,
    });
    this.sizeStack = new Stack({
      name: "size stack",
      concurrency: SIZE_STACK_CONCURRENCY,
      retries: 3,
    });
  }

  async execute(): Promise<number> {
    return this.getSubtreeSize(this.path, 0);
  }

  private async getSubtreeSize(path: string, depth: number): Promise<number> {
    let sizeEstimate = 0;

    /*
     * If we are sufficiently deep in the JSON subtree, try sizing the
     * entire subtree in a single GET.
     */
    if (depth >= this.skipDepth) {
      const result: SizeResult = await this.sizeStack.run(() =>
        this.sizeRemote.sizeNode(path, TIMEOUT)
      );
      if (result !== null && result.success) {
        sizeEstimate = result.bytes;
        return sizeEstimate;
      }
      /*
       * Ignore timeout errors so we can try sizing children of this node.
       */
      if (!result.success && result.err.status !== TIMEOUT_STATUS_CODE) {
        logger.debug(
          `Unexpected error: '${result.err.message}' when sizing node ${path}. Ignoring.`
        );
        throw result.err;
      }
    }

    let subPaths: string[] = [];
    let offset: string;

    do {
      subPaths = await this.listStack.run(() =>
        this.listRemote.listPath(path, LIST_BATCH_SIZE, offset, TIMEOUT)
      );
      if (subPaths.length === 0) {
        break;
      }
      offset = subPaths[subPaths.length - 1];
      const sizes: number[] = await Promise.all(
        subPaths.map((subPath) => this.getSubtreeSize(pathLib.join(path, subPath), depth + 1))
      );
      sizeEstimate += sizes.reduce((a, b) => a + b);
    } while (subPaths.length > 0);

    return sizeEstimate;
  }
}
