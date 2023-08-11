import { join, resolve } from "path";
import { promptOnce } from "../../../prompt";
import { readFileSync } from "fs";
import { Config } from "../../../config";
import { Setup } from "../..";

const TEMPLATE_ROOT = resolve(__dirname, "../../../../templates/init/firemat/");

const YAML_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "firemat.yaml"), "utf8");
const SCHEMA_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "schema.gql"), "utf8");
const QUERIES_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "queries.gql"), "utf8");
const MUTATIONS_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "mutations.gql"), "utf8");

export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const dir: string =
    config.get("firemat.source") ||
    (await promptOnce({
      message: "What directory should be used for FireMAT config and schema?",
      type: "input",
      default: "firemat",
    }));
  if (!config.has("firemat")) {
    config.set("firemat.source", dir);
  }

  await config.askWriteProjectFile(join(dir, "firemat.yaml"), YAML_TEMPLATE);
  await config.askWriteProjectFile(join(dir, "schema", "schema.gql"), SCHEMA_TEMPLATE);
  await config.askWriteProjectFile(join(dir, "operations", "queries.gql"), QUERIES_TEMPLATE);
  await config.askWriteProjectFile(join(dir, "operations", "mutations.gql"), MUTATIONS_TEMPLATE);
}
