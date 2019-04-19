import * as _ from "lodash";
import * as logger from "../logger";
import * as fft from "firebase-functions-test";
import * as parseTriggers from "../parseTriggers";
import * as utils from "../utils";
import { WrappedFunction } from "firebase-functions-test/lib/main";
import { CloudFunction } from "firebase-functions";

interface EmulatedTriggerDefinition {
  entryPoint: string;
  name: string;
  httpsTrigger?: any;
  eventTrigger?: any;
}

export class EmulatedTrigger {
  static fromDirectory(definition: EmulatedTriggerDefinition, directory: string): EmulatedTrigger {
    const emulatedTrigger = new EmulatedTrigger(definition);
    emulatedTrigger.directory = directory;
    emulatedTrigger.definition = definition;
    return emulatedTrigger;
  }

  static fromModule(definition: EmulatedTriggerDefinition, module: any): EmulatedTrigger {
    const emulatedTrigger = new EmulatedTrigger(definition);
    emulatedTrigger.module = module;
    emulatedTrigger.definition = definition;
    return emulatedTrigger;
  }

  private directory: string | void = undefined;
  private module: string | void = undefined;
  constructor(public definition: EmulatedTriggerDefinition) {}

  // TODO: Optimize this, it reloads the cache for every function
  getRawFunction(): CloudFunction<any> {
    if (this.directory) {
      const oldFunction = _.get(require(this.directory), this.definition.entryPoint);
      delete require.cache[require.resolve(this.directory)];
      const module = require(this.directory);
      const newFunction = _.get(module, this.definition.entryPoint);

      if (newFunction.run && oldFunction.run) {
        const oldStr = oldFunction.run.toString();
        const newStr = newFunction.run.toString();

        if (oldStr !== newStr) {
          logger.debug(`[functions] Function "${this.definition.name}" has been updated.`);
          // const diff = jsdiff.diffChars(oldStr, newStr);
          //
          // diff.forEach((part: any) => {
          //   const color = part.added ? "green" : part.removed ? "red" : "blackBright";
          //   process.stderr.write((clc as any)[color](part.value));
          // });
          // process.stderr.write("\n");
        }
      }
      logger.debug(`[functions] Function "${this.definition.name}" will be invoked. Logs:`);
      return newFunction;
    } else if (this.module) {
      return _.get(this.module, this.definition.entryPoint);
    } else {
      throw new Error(
        "EmulatedTrigger has not been provided with a directory or a triggers object"
      );
    }
  }

  getWrappedFunction(): WrappedFunction {
    return fft().wrap(this.getRawFunction());
  }
}

export async function getTriggersFromDirectory(
  projectId: string,
  functionsDir: string,
  firebaseConfig: any
): Promise<{ [name: string]: EmulatedTrigger }> {
  let triggers;

  try {
    triggers = await parseTriggers(projectId, functionsDir, {}, JSON.stringify(firebaseConfig));
  } catch (e) {
    utils.logWarning(`Failed to load functions source code.`);
    logger.info(e.message);
    return {};
  }

  return triggers.reduce((obj: { [triggerName: string]: any }, trigger: any) => {
    obj[trigger.name] = EmulatedTrigger.fromDirectory(trigger, functionsDir);
    return obj;
  }, {});
}

// This bundle gets passed from hub -> runtime as a CLI arg
export interface FunctionsRuntimeBundle {
  projectId: string;
  proto?: any;
  triggerId: any;
  ports: {
    firestore: number;
  };
  cwd: string;
}
