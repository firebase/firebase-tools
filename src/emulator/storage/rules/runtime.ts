import { spawn } from "cross-spawn";
import { ChildProcess } from "child_process";
import { FirebaseError } from "../../../error";
import {
  RulesetOperationMethod,
  RuntimeActionBundle,
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

export interface RulesetVerificationOpts {
  file: {
    before?: RulesResourceMetadata;
    after?: RulesResourceMetadata;
  };
  token?: string;
  method: RulesetOperationMethod;
  path: string;
}

export class StorageRulesetInstance {
  constructor(
    private runtime: StorageRulesRuntime,
    private rulesVersion: number,
    private rulesetName: string
  ) {}

  async verify(
    opts: RulesetVerificationOpts,
    runtimeVariableOverrides: { [s: string]: ExpressionValue } = {}
  ): Promise<{
    permitted?: boolean;
    issues: StorageRulesIssues;
  }> {
    if (opts.method === RulesetOperationMethod.LIST && this.rulesVersion < 2) {
      const issues = new StorageRulesIssues();
      issues.warnings.push(
        "Permission denied. List operations are only allowed for rules_version='2'."
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
  constructor(public errors: string[] = [], public warnings: string[] = []) {}

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

  async start(auto_download = true) {
    const downloadDetails = DownloadDetails[Emulators.STORAGE];
    const hasEmulator = fs.existsSync(downloadDetails.downloadPath);

    if (!hasEmulator) {
      if (auto_download) {
        if (process.env.CI) {
          utils.logWarning(
            `It appears you are running in a CI environment. You can avoid downloading the ${Constants.description(
              Emulators.STORAGE
            )} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`
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

    this._childprocess.on("exit", (code) => {
      this._alive = false;
      if (code !== 130 /* SIGINT */) {
        throw new FirebaseError("Storage Emulator Rules runtime exited unexpectedly.");
      }
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
          "There was an issue starting the rules emulator, please run 'firebase setup:emulators:storage` again"
        );
      } else {
        EmulatorLogger.forEmulator(Emulators.STORAGE).log(
          "WARN",
          `Unexpected rules runtime error: ${buf.toString()}`
        );
      }
    });

    this._childprocess.stdout?.on("data", (buf: Buffer) => {
      const serializedRuntimeActionResponse = buf.toString("UTF8").trim();
      if (serializedRuntimeActionResponse !== "") {
        let rap;
        try {
          rap = JSON.parse(serializedRuntimeActionResponse) as RuntimeActionResponse;
        } catch (err: any) {
          EmulatorLogger.forEmulator(Emulators.STORAGE).log(
            "INFO",
            serializedRuntimeActionResponse
          );
          return;
        }
        const request = this._requests[rap.id];

        if (rap.status !== "ok") {
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

  stop() {
    this._childprocess?.kill("SIGINT");
  }

  private async _sendRequest<T>(rab: RuntimeActionBundle) {
    if (!this._childprocess) {
      throw new FirebaseError(
        "Attempted to send Cloud Storage rules request before child was ready"
      );
    }

    const runtimeActionRequest: RuntimeActionRequest = {
      ...rab,
      id: this._requestCount++,
    };

    if (this._requests[runtimeActionRequest.id]) {
      throw new FirebaseError("Attempted to send Cloud Storage rules request with stale id");
    }

    return new Promise<RuntimeActionResponse>((resolve) => {
      this._requests[runtimeActionRequest.id] = {
        request: runtimeActionRequest,
        handler: resolve,
      };

      const serializedRequest = JSON.stringify(runtimeActionRequest);
      this._childprocess?.stdin?.write(serializedRequest + "\n");
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
      runtimeActionRequest
    )) as RuntimeActionLoadRulesetResponse;

    if (response.errors.length || response.warnings.length) {
      return {
        issues: StorageRulesIssues.fromResponse(response),
      };
    } else {
      return {
        issues: StorageRulesIssues.fromResponse(response),
        ruleset: new StorageRulesetInstance(
          this,
          response.result.rulesVersion,
          runtimeActionRequest.context.rulesetName
        ),
      };
    }
  }

  async verifyWithRuleset(
    rulesetName: string,
    opts: RulesetVerificationOpts,
    runtimeVariableOverrides: { [s: string]: ExpressionValue } = {}
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
        variables: runtimeVariables,
      },
    };

    const response = (await this._sendRequest(runtimeActionRequest)) as RuntimeActionVerifyResponse;

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
      null_value: 0,
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
    `Cannot convert "${obj}" of type ${typeof obj} for Firebase Storage rules runtime`
  );
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
          .slice(3)
          .map((simple) => ({
            simple,
          })),
      },
    },
    time: toExpressionValue(new Date()),
    resource: toExpressionValue(opts.file.after ? opts.file.after : null),
    auth: opts.token ? createAuthExpressionValue(opts) : { null_value: 0 },
  };

  return {
    map_value: {
      fields,
    },
  };
}
