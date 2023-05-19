import { AppBundle } from "./interfaces";
import { getDriver, Mode } from "./driver";
import { discover } from "./discover";

/**
 * Run composer in the specified execution context.
 */
export function compose(mode: Mode): AppBundle {
  let bundle: AppBundle = { version: "v1alpha" };
  const spec = discover();
  const driver = getDriver(mode, spec);

  if (spec.startCommand) {
    bundle.server = {
      start: {
        cmd: spec.startCommand.split(" "),
      },
    };
  }

  driver.install();
  if (spec.afterInstall) {
    bundle = driver.execHook(bundle, spec.afterInstall);
  }
  console.log("bundle after install");
  console.log(JSON.stringify(bundle, null, 2));

  driver.build();
  if (spec.afterBuild) {
    bundle = driver.execHook(bundle, spec.afterBuild);
  }
  console.log("bundle after build");
  console.log(JSON.stringify(bundle, null, 2));

  // TODO: Export assets
  //   TODO: Create container image if necessary
  // . TODO: Push static content to Firestack Files

  // TODO: Update stack config
  return bundle;
}
