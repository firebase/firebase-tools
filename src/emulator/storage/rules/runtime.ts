import { spawn } from "cross-spawn";
import { ChildProcess } from "child_process";
import { FirebaseError } from "../../../error";
import * as AsyncLock from "async-lock";
import {
  DataLoadStatus,
  RulesetOperationMethod,
  RuntimeActionBundle,
  RuntimeActionFirestoreDataRequest,
  RuntimeActionFirestoreDataResponse,
  RuntimeActionLoadRulesetBundle,
  RuntimeActionLoadRulesetResponse,
  RuntimeActionRequest,
  RuntimeActionResponse,
  RuntimeActionVerifyBundle,
  RuntimeActionVerifyResponse,
  Source,
} from "./types";
import * as jwt from "jsonwebtoken";
import { ExpressionValue } from "./expressionValue";
import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { RulesResourceMetadata, toSerializedDate } from "../metadata";
import * as utils from "../../../utils";
import { Constants } from "../../constants";
import { downloadEmulator } from "../../download";
import * as fs from "fs-extra";
import {
  _getCommand,
  DownloadDetails,
  handleEmulatorProcessError,
} from "../../downloadableEmulators";
import { EmulatorRegistry } from "../../registry";

const lock = new AsyncLock();
const synchonizationKey = "key";

export interface RulesetVerificationOpts {
  file: {
    before?: RulesResourceMetadata;
    after?: RulesResourceMetadata;
  };
  token?: string;
  method: RulesetOperationMethod;
  path: string;
  delimiter?: string;
  projectId: string;
}

export class StorageRulesetInstance {
  constructor(
    private runtime: StorageRulesRuntime,
    private rulesVersion: number,
    private rulesetName: string,
  ) {}

  async verify(
    opts: RulesetVerificationOpts,
    runtimeVariableOverrides: { [s: string]: ExpressionValue } = {},
  ): Promise<{
    permitted?: boolean;
    issues: StorageRulesIssues;
  }> {
    if (opts.method === RulesetOperationMethod.LIST && this.rulesVersion < 2) {
      const issues = new StorageRulesIssues();
      issues.warnings.push(
        "Permission denied. List operations are only allowed for rules_version='2'.",
      );
      return {
        permitted: false,
        issues,
      };
    }

    return this.runtime.verifyWithRuleset(this.rulesetName, opts, runtimeVariableOverrides);
  }

  unload() {
    throw new Error("NOT_IMPLEMENTED");
  }
}

export class StorageRulesIssues {
  constructor(
    public errors: string[] = [],
    public warnings: string[] = [],
  ) {}

  static fromResponse(resp: RuntimeActionResponse) {
    return new StorageRulesIssues(resp.errors || [], resp.warnings || []);
  }

  get all() {
    return [...this.errors, ...this.warnings];
  }

  exist(): boolean {
    return !!(this.errors.length || this.warnings.length);
  }

  extend(other: StorageRulesIssues): void {
    this.errors.push(...other.errors);
    this.warnings.push(...other.warnings);
  }
}

export class StorageRulesRuntime {
  private _rulesetCount = 0;
  private _requestCount = 0;
  private _requests: {
    [s: number]: {
      handler: (rap: any) => void;
      request: RuntimeActionRequest;
    };
  } = {};
  private _childprocess?: ChildProcess;
  private _alive = false;

  get alive() {
    return this._alive;
  }

  async start(autoDownload = true) {
    if (this.alive) {
      return;
    }
    const downloadDetails = DownloadDetails[Emulators.STORAGE];
    const hasEmulator = fs.existsSync(downloadDetails.downloadPath);

    if (!hasEmulator) {
      if (autoDownload) {
        if (process.env.CI) {
          utils.logWarning(
            `It appears you are running in a CI environment. You can avoid downloading the ${Constants.description(
              Emulators.STORAGE,
            )} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`,
          );
        }

        await downloadEmulator(Emulators.STORAGE);
      } else {
        utils.logWarning("Setup required, please run: firebase setup:emulators:storage");
        throw new FirebaseError("emulator not found");
      }
    }

    this._alive = true;
    const command = _getCommand(Emulators.STORAGE, {});
    this._childprocess = spawn(command.binary, command.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this._childprocess.on("exit", () => {
      this._alive = false;
      this._childprocess?.removeAllListeners();
      this._childprocess = undefined;
    });

    const startPromise = new Promise((resolve) => {
      this._requests[-1] = {
        handler: resolve,
        request: {
          action: "",
          id: -1,
        },
      };
    });

    // This catches error when spawning the java process
    this._childprocess.on("error", (err) => {
      handleEmulatorProcessError(Emulators.STORAGE, err);
    });

    // This catches errors from the java process (i.e. missing jar file)
    this._childprocess.stderr?.on("data", (buf: Buffer) => {
      const error = buf.toString();
      if (error.includes("jarfile")) {
        EmulatorLogger.forEmulator(Emulators.STORAGE).log("ERROR", error);
        throw new FirebaseError(
          "There was an issue starting the rules emulator, please run 'firebase setup:emulators:storage` again",
        );
      } else {
        EmulatorLogger.forEmulator(Emulators.STORAGE).log(
          "WARN",
          `Unexpected rules runtime error: ${buf.toString()}`,
        );
      }
    });

    this._childprocess.stdout?.on("data", (buf: Buffer) => {
      const serializedRuntimeActionResponse = buf.toString("utf-8").trim();
      if (serializedRuntimeActionResponse !== "") {
        let rap;
        try {
          rap = JSON.parse(serializedRuntimeActionResponse) as RuntimeActionResponse;
        } catch (err: any) {
          EmulatorLogger.forEmulator(Emulators.STORAGE).log(
            "INFO",
            serializedRuntimeActionResponse,
          );
          return;
        }

        const id = rap.id ?? rap.server_request_id;
        if (id === undefined) {
          console.log(`Received no ID from server response ${serializedRuntimeActionResponse}`);
          return;
        }

        const request = this._requests[id];

        if (rap.status !== "ok" && !("action" in rap)) {
          console.warn(`[RULES] ${rap.status}: ${rap.message}`);
          rap.errors.forEach(console.warn.bind(console));
          return;
        }

        if (request) {
          request.handler(rap);
        } else {
          console.log(`No handler for event ${serializedRuntimeActionResponse}`);
        }
      }
    });

    return startPromise;
  }

  stop(): Promise<void> {
    EmulatorLogger.forEmulator(Emulators.STORAGE).log("DEBUG", "Stopping rules runtime.");
    return new Promise<void>((resolve) => {
      if (this.alive) {
        this._childprocess!.on("exit", () => {
          resolve();
        });
        this._childprocess?.kill("SIGINT");
      } else {
        resolve();
      }
    });
  }

  private async _sendRequest(rab: RuntimeActionBundle, overrideId?: number) {
    if (!this._childprocess) {
      throw new FirebaseError(
        "Failed to send Cloud Storage rules request due to rules runtime not available.",
      );
    }

    const runtimeActionRequest: RuntimeActionRequest = {
      ...rab,
      id: overrideId ?? this._requestCount++,
    };

    // If `overrideId` is set, we are to use this ID to send to Rules.
    // This happens when there is a back-and-forth interaction with Rules,
    // meaning we also need to delete the old request and await the new
    // response with the same ID.
    if (overrideId !== undefined) {
      delete this._requests[overrideId];
    } else if (this._requests[runtimeActionRequest.id]) {
      throw new FirebaseError("Attempted to send Cloud Storage rules request with stale id");
    }

    return new Promise<RuntimeActionResponse>((resolve) => {
      this._requests[runtimeActionRequest.id] = {
        request: runtimeActionRequest,
        handler: resolve,
      };

      const serializedRequest = JSON.stringify(runtimeActionRequest);

      // Added due to https://github.com/firebase/firebase-tools/issues/3915
      // Without waiting to acquire the lock and allowing the child process enough time
      // (~15ms) to pipe the output back, the emulator will run into issues with
      // capturing the output and resolving corresponding promises en masse.
      lock.acquire(synchonizationKey, (done) => {
        this._childprocess?.stdin?.write(serializedRequest + "\n");
        setTimeout(() => {
          done();
        }, 15);
      });
    });
  }

  async loadRuleset(source: Source): Promise<{
    ruleset?: StorageRulesetInstance;
    issues: StorageRulesIssues;
  }> {
    // Load ruleset into runtime w/ id
    const runtimeActionRequest: RuntimeActionLoadRulesetBundle = {
      action: "load_ruleset",
      context: {
        rulesetName: (this._rulesetCount++).toString(),
        source,
      },
    };

    const response = (await this._sendRequest(
      runtimeActionRequest,
    )) as RuntimeActionLoadRulesetResponse;

    if (response.errors.length) {
      return {
        issues: StorageRulesIssues.fromResponse(response),
      };
    } else {
      return {
        issues: StorageRulesIssues.fromResponse(response),
        ruleset: new StorageRulesetInstance(
          this,
          response.result.rulesVersion,
          runtimeActionRequest.context.rulesetName,
        ),
      };
    }
  }

  async verifyWithRuleset(
    rulesetName: string,
    opts: RulesetVerificationOpts,
    runtimeVariableOverrides: { [s: string]: ExpressionValue } = {},
  ): Promise<
    Promise<{
      permitted?: boolean;
      issues: StorageRulesIssues;
    }>
  > {
    if (!opts.path.startsWith("/")) {
      opts.path = `/${opts.path}`;
    }

    if (opts.path.endsWith("/")) {
      opts.path = opts.path.slice(0, -1);
    }

    const runtimeVariables: { [variableName: string]: ExpressionValue } = {
      resource: toExpressionValue(opts.file.before || null),
      request: createRequestExpressionValue(opts),
      ...runtimeVariableOverrides,
    };

    const runtimeActionRequest: RuntimeActionVerifyBundle = {
      action: "verify",
      context: {
        rulesetName: rulesetName,
        service: "firebase.storage",
        path: opts.path,
        method: opts.method,
        delimiter: opts.delimiter,
        variables: runtimeVariables,
      },
    };

    return this._completeVerifyWithRuleset(opts.projectId, runtimeActionRequest);
  }

  private async _completeVerifyWithRuleset(
    projectId: string,
    runtimeActionRequest: RuntimeActionBundle,
    overrideId?: number,
  ): Promise<{
    permitted?: boolean;
    issues: StorageRulesIssues;
  }> {
    const response = (await this._sendRequest(
      runtimeActionRequest,
      overrideId,
    )) as RuntimeActionVerifyResponse;

    if ("context" in response) {
      const dataResponse = await fetchFirestoreDocument(projectId, response);
      return this._completeVerifyWithRuleset(projectId, dataResponse, response.server_request_id);
    }

    if (!response.errors) response.errors = [];
    if (!response.warnings) response.warnings = [];

    if (response.errors.length) {
      return {
        issues: StorageRulesIssues.fromResponse(response),
      };
    } else {
      return {
        issues: StorageRulesIssues.fromResponse(response),
        permitted: response.result.permit,
      };
    }
  }
}

function toExpressionValue(obj: any): ExpressionValue {
  if (typeof obj === "string") {
    return { string_value: obj };
  }

  if (typeof obj === "boolean") {
    return { bool_value: obj };
  }

  if (typeof obj === "number") {
    if (Math.floor(obj) === obj) {
      return { int_value: obj };
    } else {
      return { float_value: obj };
    }
  }

  if (obj instanceof Date) {
    return {
      timestamp_value: toSerializedDate(obj),
    };
  }

  if (Array.isArray(obj)) {
    return {
      list_value: {
        values: obj.map(toExpressionValue),
      },
    };
  }

  if (obj instanceof Set) {
    return {
      set_value: {
        values: [...obj].map(toExpressionValue),
      },
    };
  }

  if (obj == null) {
    return {
      null_value: null,
    };
  }

  if (typeof obj === "object") {
    const fields: { [s: string]: ExpressionValue } = {};
    Object.keys(obj).forEach((key: string) => {
      fields[key] = toExpressionValue(obj[key]);
    });

    return {
      map_value: {
        fields,
      },
    };
  }

  throw new FirebaseError(
    `Cannot convert "${obj}" of type ${typeof obj} for Firebase Storage rules runtime`,
  );
}

async function fetchFirestoreDocument(
  projectId: string,
  request: RuntimeActionFirestoreDataRequest,
): Promise<RuntimeActionFirestoreDataResponse> {
  const pathname = `projects/${projectId}${request.context.path}`;

  const client = EmulatorRegistry.client(Emulators.FIRESTORE, { apiVersion: "v1", auth: true });
  try {
    const doc = await client.get(pathname);
    const { name, fields } = doc.body as { name: string; fields: string };
    const result = { name, fields };
    return { result, status: DataLoadStatus.OK, warnings: [], errors: [] };
  } catch (e) {
    // Don't care what the error is, just return not_found
    return { status: DataLoadStatus.NOT_FOUND, warnings: [], errors: [] };
  }
}

function createAuthExpressionValue(opts: RulesetVerificationOpts): ExpressionValue {
  if (!opts.token) {
    return toExpressionValue(null);
  } else {
    const tokenPayload = jwt.decode(opts.token) as any;

    const jsonValue = {
      uid: tokenPayload.user_id,
      token: tokenPayload,
    };

    return toExpressionValue(jsonValue);
  }
}

function createRequestExpressionValue(opts: RulesetVerificationOpts): ExpressionValue {
  const fields: { [s: string]: ExpressionValue } = {
    path: {
      path_value: {
        segments: opts.path
          .split("/")
          .filter((s) => s)
          .map((simple) => ({
            simple,
          })),
      },
    },
    time: toExpressionValue(new Date()),
    resource: toExpressionValue(opts.file.after ? opts.file.after : null),
    auth: opts.token ? createAuthExpressionValue(opts) : { null_value: null },
  };

  return {
    map_value: {
      fields,
    },
  };
}
