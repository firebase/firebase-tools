import { execSync } from "child_process";
import { FrameworkType, SupportLevel } from "..";

export const name = 'Angular';
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Toolchain;

export const init = (setup: any) => {
    execSync(`npx create-vite ${setup.hosting.source}`, {stdio: 'inherit'});
    execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
};
