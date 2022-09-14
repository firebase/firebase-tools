import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { copy } from "fs-extra";
import { join } from "path";
import { BuildResult, findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";
import { proxyRequestHandler } from "../../hosting/proxy";

export const name = 'Vite';
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Toolchain;

const CLI_COMMAND = process.platform === 'win32' ? 'vite.cmd' : 'vite';

export const init = async (setup: any) => {
    execSync(`npx --yes create-vite ${setup.hosting.source}`, {stdio: 'inherit'});
    execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
};

export const discover = async (dir: string) => {
    if (!existsSync(join(dir, 'package.json'))) return undefined;
    if (
        !existsSync(join(dir, 'vite.config.js')) &&
        !existsSync(join(dir, 'vite.config.ts')) &&
        !findDependency('vite', { cwd: dir, depth: 0, omitDev: false })
    ) return undefined;
    const config = await getConfig(dir);
    const publicDirectory = join(dir, config.publicDir);
    return { mayWantBackend: true, publicDirectory };
};

export const build = async (root: string): Promise<BuildResult> => {
    const { build } = relativeRequire(root, 'vite');
    await build({ root });
};

export const ɵcodegenPublicDirectory = async (root: string, dest: string) => {
    const viteConfig = await getConfig(root);
    const viteDistPath = join(root, viteConfig.build.outDir);
    await copy(viteDistPath, dest);
};

export const getDevModeHandle = async (dir: string) => {
    let resolvePort: (it:string) => void;
    const portThatWasPromised = new Promise<string>((resolve, reject) => resolvePort = resolve);
    // TODO implement custom server
    const serve = spawn(CLI_COMMAND, [], { cwd: dir });
    serve.stdout.on("data", (data: any) => {
        process.stdout.write(data);
        const match = data.toString().match(/(http:\/\/.+:\d+)/);
        if (match) resolvePort(match[1]);
    });
    const host = await portThatWasPromised;
    return proxyRequestHandler(host, 'Vite Development Server');
};

export const getConfig = async (root: string) => {
    const { resolveConfig } = relativeRequire(root, 'vite');
    return await resolveConfig({ root }, 'build', 'production');
};
