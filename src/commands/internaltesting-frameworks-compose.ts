import { Command } from "../command";
import { Options } from "../options";
import { logger } from "../logger";
import { Mode, SUPPORTED_MODES } from "../frameworks/compose/driver";
import { compose } from "../frameworks/compose";
import { FirebaseError } from "../error";
import { LocalFileSystem } from "../frameworks/compose/discover/filesystem";
import { frameworkSpecs } from "../frameworks/compose/discover/frameworkSpec";

export const command = new Command("internaltesting:frameworks:compose")
  .option("-m, --mode <mode>", "Composer mode (local or docker)", "local")
  .description("compose framework in current directory")
  .action(async (options: Options) => {
    const mode = options.mode as string;
    if (!(SUPPORTED_MODES as unknown as string[]).includes(mode)) {
      throw new FirebaseError(
        `Unsupported mode ${mode}. Supported modes are [${SUPPORTED_MODES.join(", ")}]`,
      );
    }
    const bundle = await compose(mode as Mode, new LocalFileSystem("."), frameworkSpecs);
    logger.info(JSON.stringify(bundle, null, 2));
    return {};
  });
