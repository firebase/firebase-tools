import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { copy } from "fs-extra";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { BuildResult, FrameworkType, SupportLevel } from "..";

export const name = 'Express.js';
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Framework;

const getConfig = async (root:string) => {
    const packageJsonBuffer = await readFile(join(root, 'package.json'));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    const serve: string|undefined = packageJson.directories?.serve;
    const serveDir = serve && join(root, packageJson.directories?.serve);
    return { serveDir, packageJson };
}

export const discover = async (dir: string) => {
    if (!existsSync(join(dir, 'package.json'))) return undefined;
    const { serveDir } = await getConfig(dir);
    if (!serveDir) return undefined;
    return { mayWantBackend: true };
};

export const build = async (cwd: string): Promise<BuildResult> => {
    execSync(`npm run build`, { stdio: 'inherit', cwd });
    const wantsBackend = !!await findServerRenderMethod(cwd);
    return { wantsBackend };
};

export const ɵcodegenPublicDirectory = async (root: string, dest: string) => {
    const { serveDir } = await getConfig(root);
    await copy(serveDir!, dest);
};

const findServerRenderMethod = async (root: string, method: string[]=[], entry?: any): Promise<string[]|undefined> => {
    const allowRecursion = !entry;
    entry ||= await (async () => {
        try {
            const requiredProject = require(root);
            if (requiredProject) method = ['require'];
            return requiredProject;
        } catch(e) {
            const importedProject = await import(root).catch(() => undefined);
            if (importedProject) method = ['import'];
            return importedProject;
        }
    })();
    if (!entry) return undefined;
    const { default: defaultExport, app, handle } = entry;
    if (typeof handle === 'function') return [...method, 'handle'];
    if (typeof app === 'function') {
        try {
            const express = app();
            if (typeof express.render === 'function') return [...method, 'app'];
        } catch(e) { }
    }
    if (!allowRecursion) return undefined;
    if (typeof defaultExport === 'object') {
        if (typeof defaultExport.then === 'function') {
            const awaitedDefaultExport = await defaultExport;
            return findServerRenderMethod(root, [...method, 'default'], awaitedDefaultExport);
        } else {
            return findServerRenderMethod(root, [...method, 'default'], defaultExport);
        }
    }
    return undefined;
};

export const ɵcodegenFunctionsDirectory = async (root: string, dest: string) => {
    const serverRenderMethod = await findServerRenderMethod(root);
    if (!serverRenderMethod) return;
    await mkdir(dest, { recursive: true });

    const { packageJson } = await getConfig(root);
    let bootstrapScript = '';
    let stack = serverRenderMethod.slice();
    const entry = packageJson.name;
    if (stack.shift() === 'require') {
        bootstrapScript += `const bootstrap = Promise.resolve(require('${entry}'))`;
    } else {
        bootstrapScript += `const bootstrap = import('${entry}')`;
    }
    if (stack[0] === 'default') {
        stack.shift();
        bootstrapScript += '.then(({ default }) => default)';
    }
    if (stack[0] === 'app') {
        stack.shift();
        bootstrapScript += '.then(({ app }) => app())';
    }
    bootstrapScript += ';\n';
    const method = stack.shift();
    bootstrapScript += `exports.handle = async (req, res) => (await bootstrap)${method ? `.${method}` : ''}(req, res);`;

    const packResults = execSync(`npm pack ${root} --json`, { cwd: dest });
    const npmPackResults = JSON.parse(packResults.toString());
    const matchingPackResult = npmPackResults.find((it: any) => it.name === packageJson.name);
    const { filename } = matchingPackResult;
    packageJson.dependencies ||= {};
    packageJson.dependencies[packageJson.name] = `file:${filename}`;
    return { bootstrapScript, packageJson };
};
