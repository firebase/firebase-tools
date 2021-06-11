import * as fs from "fs";
import * as path from "path";
import * as spawn from "cross-spawn";
import * as utils from "../../../utils";

import {Config} from "../../../config";
import {promptOnce} from "../../../prompt";
import * as python from "../../../deploy/functions/runtimes/python";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/python");
const GITIGNORE_TEMPLATE = fs.readFileSync(path.resolve(TEMPLATE_ROOT, "_gitignore"), "utf8");
const MAIN_TEMPLATE = fs.readFileSync(path.resolve(TEMPLATE_ROOT, "main.py"), "utf8");
const REQUIREMENTS_TEMPLATE = fs.readFileSync(path.resolve(TEMPLATE_ROOT, "requirements.txt"), "utf8");

async function init(setup: Record<string, unknown> & { config: Record<string, unknown> }, config: Config) {
	setup.config.functions = {
		runtime: python.LATEST_VERSION,
	};

  await config.askWriteProjectFile("functions/.gitignore", GITIGNORE_TEMPLATE);
  await config.askWriteProjectFile("functions/requirements.txt", REQUIREMENTS_TEMPLATE);
  await config.askWriteProjectFile("functions/main.py", MAIN_TEMPLATE);

	const install = await promptOnce({
		type: "confirm",
		message: "Would you like to install recommended dependencies?",
		default: true,
	});
	if (install) {
		utils.logBullet("Creating virtualenv py3");
		spawn.sync("virtualenv", ["-p", "python", python.PYENV], {
			cwd: path.join(config.projectDir, "functions"),
			stdio: "inherit",
		})
		const child = python.run("pip install -r requirements.txt", path.join(config.projectDir, "functions"))
		await child.exit();
	}
}

module.exports = init;