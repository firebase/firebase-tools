import { execSync } from "child_process";

export const init = async (setup: any) => {
    execSync(`npx --yes nuxi@latest init ${setup.hosting.source}`, {stdio: 'inherit'});
    execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
}