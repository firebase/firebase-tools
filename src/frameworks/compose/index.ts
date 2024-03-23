import { AppBundle } from "./interfaces";
import { getDriver, Mode } from "./driver";
import { discover } from "./discover";
import { FrameworkSpec, FileSystem } from "./discover/types";

/**
 * Run composer in the specified execution context.
 */
export async function compose(
  mode: Mode,
  fs: FileSystem,
  allFrameworkSpecs: FrameworkSpec[],
): Promise<AppBundle> {
  let bundle: AppBundle = { version: "v1alpha" };
  const spec = await discover(fs, allFrameworkSpecs);
  const driver = getDriver(mode, spec);

  if (spec.detectedCommands?.run) {
    bundle.server = {
      start: {
        cmd: spec.detectedCommands.run.cmd.split(" "),
      },
    };
  }

  driver.install();
  if (spec.frameworkHooks?.afterInstall) {
    bundle = driver.execHook(bundle, spec.frameworkHooks.afterInstall);
  }

  driver.build();
  if (spec.frameworkHooks?.afterBuild) {
    bundle = driver.execHook(bundle, spec.frameworkHooks?.afterBuild);
  }

  if (bundle.server) {
    // Export container
    driver.export(bundle);
  }

  // TODO: Update stack config
  return bundle;
}
