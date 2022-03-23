import * as fs from "fs";
import * as path from "path";

import { Config } from "../../../config";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/python");
const MAIN_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "main.py"), "utf8");
const REQUIREMENTS_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "requirements.txt"), "utf8");
const GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");

// TODO: temporary for testing purposes, this should actually be generated
const TMP_ADMIN_EXAMPLE_PY = fs.readFileSync(
  path.join(TEMPLATE_ROOT, "functions_admin_http_example.py"),
  "utf8"
);
const TMP_FUNCTIONS_YAML = fs.readFileSync(path.join(TEMPLATE_ROOT, "functions.yaml"), "utf8");

/**
 * Create a Python Firebase Functions project.
 */
async function init(_setup: unknown, config: Config): Promise<void> {
  await config.askWriteProjectFile("functions/requirements.txt", REQUIREMENTS_TEMPLATE);
  // TODO pip install, potentially looks something like this:
  //   py -m pip install -r requirements.txt        (Windows)
  //   python3 -m pip install -r requirements.txt   (Unix/macOS)
  //   pip install -r requirements.txt              (Unix/macOS fallback if python3 not in path)
  await config.askWriteProjectFile("functions/.gitignore", GITIGNORE_TEMPLATE);
  await config.askWriteProjectFile("functions/main.py", MAIN_TEMPLATE);

  // TODO tmp
  await config.askWriteProjectFile(
    "functions/functions_admin_http_example.py",
    TMP_ADMIN_EXAMPLE_PY
  );
  await config.askWriteProjectFile("functions/functions.yaml", TMP_FUNCTIONS_YAML);
}

module.exports = init;
