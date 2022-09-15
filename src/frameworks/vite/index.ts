import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { copy } from "fs-extra";
import { join } from "path";
import { BuildResult, findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";
import { proxyRequestHandler } from "../../hosting/proxy";
import { promptOnce } from "../../prompt";

export const name = 'Vite';
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Toolchain;

const CLI_COMMAND = process.platform === 'win32' ? 'vite.cmd' : 'vite';

export const initViteTemplate = (template: string) => async (setup: any) => await init(setup, template);

export const init = async (setup: any, baseTemplate: string='vanilla') => {
    const template = await promptOnce({
        type: "list",
        default: "JavaScript",
        message: "What language would you like to use?",
        choices: [{ name: "JavaScript", value: baseTemplate }, { name: "TypeScript", value: `${baseTemplate}-ts` }],
    });
    execSync(`npm create vite@latest ${setup.hosting.source} --yes -- --template ${template}`, {stdio: 'inherit'});
    execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
};


export const viteDiscoverWithNpmDependency = (dep: string) => async (dir: string) => await discover(dir, undefined, dep);

export const vitePluginDiscover = (plugin: string) => async (dir: string) => await discover(dir, plugin);

export const discover = async (dir: string, plugin?: string, npmDependency?: string) => {
    if (!existsSync(join(dir, 'package.json'))) return undefined;
    // If we're not searching for a vite plugin, depth has to be zero
    const depth = plugin ? undefined : 0;
    if (
        !existsSync(join(dir, 'vite.config.js')) &&
        !existsSync(join(dir, 'vite.config.ts')) &&
        !findDependency('vite', { cwd: dir, depth, omitDev: false }) &&
        (!npmDependency || !findDependency(npmDependency, { cwd: dir, depth: 0, omitDev: true })) 
    ) return undefined;
    const { appType, publicDir: publicDirectory, plugins } = await getConfig(dir);
    if (plugin && !plugins.find(({ name }) => name === plugin)) return undefined;
    return { mayWantBackend: appType !== 'spa', publicDirectory };
};

export const build = async (root: string): Promise<BuildResult> => {
    const { appType } = await getConfig(root);
    const { build } = relativeRequire(root, 'vite');
    await build({ root });
    // TODO figure this out 
    // return { wantsBackend: appType !== 'spa' };
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
