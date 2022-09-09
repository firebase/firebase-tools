import { execSync } from "child_process";

export const init = async (setup: any) => {
    execSync(`npx --yes create-next-app@latest ${setup.hosting.source}`, {stdio: 'inherit'});
}