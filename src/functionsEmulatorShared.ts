import * as _ from "lodash";
import * as logger from "./logger";
import * as fft from "firebase-functions-test";
import * as parseTriggers from "./parseTriggers";
import * as utils from "./utils";
import { WrappedFunction } from "firebase-functions-test/lib/main";
import { CloudFunction } from "firebase-functions";

export class EmulatedTrigger {
  constructor(
    public raw: { entryPoint: string; name: string; httpsTrigger: any; eventTrigger: any },
    private functionsDir: string
  ) {}
  getRawFunction(): CloudFunction<any> {
    const oldFunction = _.get(require(this.functionsDir), this.raw.entryPoint);
    delete require.cache[require.resolve(this.functionsDir)];
    const module = require(this.functionsDir);
    const newFunction = _.get(module, this.raw.entryPoint);

    if (newFunction.run && oldFunction.run) {
      const oldStr = oldFunction.run.toString();
      const newStr = newFunction.run.toString();

      if (oldStr !== newStr) {
        logger.debug(`[functions] Function "${this.raw.name}" has been updated.`);
        // const diff = jsdiff.diffChars(oldStr, newStr);
        //
        // diff.forEach((part: any) => {
        //   const color = part.added ? "green" : part.removed ? "red" : "blackBright";
        //   process.stderr.write((clc as any)[color](part.value));
        // });
        // process.stderr.write("\n");
      }
    }
    logger.debug(`[functions] Function "${this.raw.name}" will be invoked. Logs:`);
    return newFunction;
  }

  getWrappedFunction(): WrappedFunction {
    return fft().wrap(this.getRawFunction());
  }
}

export async function getTriggers(
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
    obj[trigger.name] = new EmulatedTrigger(trigger, functionsDir);
    return obj;
  }, {});
}

// This bundle gets passed from hub -> runtime as a CLI arg
export interface FunctionsRuntimeBundle {
  projectId: string;
  proto: any;
  triggerId: any;
  ports: {
    firestore: number;
  };
  cwd: string;
}
