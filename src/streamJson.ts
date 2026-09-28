// stream-chain and stream-json are ESM-only packages. This CLI is compiled to
// CommonJS, so a static `import` of them is emitted as `require()`, which throws
// ERR_REQUIRE_ESM on Node.js versions without require(esm) support (< 20.19 and
// < 22.12), including the Node.js runtime bundled in the standalone binary.
// Load them lazily with a real dynamic `import()` instead.
// See https://github.com/firebase/firebase-tools/issues/11168.
import { pathToFileURL } from "url";

// Built with `new Function` so neither tsc nor ts-node (which transpiles
// src/dynamicImport.js under mocha) can rewrite the import() into a require().
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importModule = new Function("url", "return import(url)") as (url: string) => Promise<unknown>;

// If being compiled with webpack (the VS Code extension), resolve with Node's
// require rather than webpack's.
/* eslint-disable camelcase */
declare const __webpack_require__: unknown;
declare const __non_webpack_require__: NodeRequire;
const nodeRequire: NodeRequire =
  typeof __webpack_require__ === "function" ? __non_webpack_require__ : require;
/* eslint-enable camelcase */

async function load<T>(specifier: string): Promise<T> {
  return importModule(pathToFileURL(nodeRequire.resolve(specifier)).href) as Promise<T>;
}

type StreamChainModule = typeof import("stream-chain");
type StreamJsonModule = typeof import("stream-json");
type PickModule = typeof import("stream-json/filters/pick.js");
type FilterModule = typeof import("stream-json/filters/filter.js");
type StreamArrayModule = typeof import("stream-json/streamers/stream-array.js");
type StreamObjectModule = typeof import("stream-json/streamers/stream-object.js");

export interface StreamJson {
  chain: StreamChainModule["chain"];
  parser: StreamJsonModule["parser"];
  pick: PickModule["pick"];
  filter: FilterModule["filter"];
  streamArray: StreamArrayModule["streamArray"];
  streamObject: StreamObjectModule["streamObject"];
}

let loaded: Promise<StreamJson> | undefined;

/**
 * Lazily loads the stream-chain and stream-json helpers used for streaming JSON parsing.
 */
export function loadStreamJson(): Promise<StreamJson> {
  if (!loaded) {
    loaded = (async (): Promise<StreamJson> => {
      const [streamChain, streamJson, pick, filter, streamArray, streamObject] = await Promise.all([
        load<StreamChainModule>("stream-chain"),
        load<StreamJsonModule>("stream-json"),
        load<PickModule>("stream-json/filters/pick.js"),
        load<FilterModule>("stream-json/filters/filter.js"),
        load<StreamArrayModule>("stream-json/streamers/stream-array.js"),
        load<StreamObjectModule>("stream-json/streamers/stream-object.js"),
      ]);
      return {
        chain: streamChain.chain,
        parser: streamJson.parser,
        pick: pick.pick,
        filter: filter.filter,
        streamArray: streamArray.streamArray,
        streamObject: streamObject.streamObject,
      };
    })();
    // Don't cache failures, so a later call can retry.
    loaded.catch(() => {
      loaded = undefined;
    });
  }
  return loaded;
}
