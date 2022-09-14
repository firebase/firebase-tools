import type { Target } from '@angular-devkit/architect';
import { join } from 'path';
import { existsSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { copy } from 'fs-extra';
import { mkdir } from 'fs/promises';

import { BuildResult, Discovery, findDependency, FrameworkType, relativeRequire, SupportLevel } from '..';
import { prompt } from '../../prompt';
import { proxyRequestHandler } from '../../hosting/proxy';

class MyError extends Error {
    constructor(reason: string) {
        console.error(reason);
        super();
    }
}

export const name = 'Angular';
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Framework;

const CLI_COMMAND = process.platform === 'win32' ? 'ng.cmd' : 'ng';

export const discover = async (dir: string): Promise<Discovery|undefined> => {
    if (!existsSync(join(dir, 'package.json'))) return undefined;
    if (!existsSync(join(dir, 'angular.json'))) return undefined;
    const { serverTarget } = await getContext(dir);
    // TODO don't hardcode assets dir
    return { mayWantBackend: !!serverTarget, publicDirectory: join(dir, 'src', 'assets') };
}

export const init = async (setup: any) => {
    execSync(`npx --yes -p @angular/cli@latest ng new ${setup.hosting.source} --skip-git`, {stdio: 'inherit'})
    await prompt(setup.hosting, [
      {
        name: "useAngularUniversal",
        type: "confirm",
        default: false,
        message: `Would you like to setup Angular Universal?`,
      },
    ]);
    if (setup.hosting.useAngularUniversal) {
      execSync('ng add @nguniversal/express-engine --skip-confirmation', {stdio: 'inherit', cwd: setup.hosting.source });
    }
}

export const build = async (dir: string): Promise<BuildResult> => {

    const { logging } = relativeRequire(dir, '@angular-devkit/core');
    const { targetStringFromTarget } = relativeRequire(dir, '@angular-devkit/architect');
    const { architect, browserTarget, prerenderTarget, serverTarget } = await getContext(dir);

    // TODO log to firebase-tools
    const logger = new logging.Logger('firebase-tools');
    logger.subscribe(it => console.log(it.message));

    const scheduleTarget = async (target: Target) => {
        const run = await architect.scheduleTarget(target, undefined, { logger });
        const { success, error } = await run.output.toPromise();
        if (!success) throw new Error(error);
    }

    if (!browserTarget) throw new MyError('No build target...');

    if (prerenderTarget) {
        // TODO there is a bug here. Spawn for now.
        // await scheduleTarget(prerenderTarget);
        execSync(
            `${CLI_COMMAND} run ${targetStringFromTarget(prerenderTarget)}`,
            { cwd: dir, stdio: 'inherit' }
        );
    } else {
        await scheduleTarget(browserTarget);
        if (serverTarget) await scheduleTarget(serverTarget);
    }

    const wantsBackend = !!serverTarget;

    return { wantsBackend };
};

export const getDevModeHandle = async (dir: string) => {
    
    const { targetStringFromTarget } = relativeRequire(dir, '@angular-devkit/architect');

    let resolvePort: (it:string) => void;
    const portThatWasPromised = new Promise<string>((resolve, reject) => resolvePort = resolve);
    const { serveTarget, architect } = await getContext(dir);
    if (!serveTarget) {
        console.warn('Something something serve target not found.');
        return undefined;
    }

    // Can't use scheduleTarget since that—like prerender—is failing on an ESM bug
    // TODO handle error
    const serve = spawn(CLI_COMMAND, ['run', targetStringFromTarget(serveTarget), '--host', 'localhost'], { cwd: dir });
    serve.stdout.on("data", (data: any) => {
        process.stdout.write(data);
        const match = data.toString().match(/(http:\/\/localhost:\d+)/);
        if (match) resolvePort(match[1]);
    });

    serve.stderr.on("data", (data: any) => {
        process.stderr.write(data);
    });
    
    const host = await portThatWasPromised;
    return proxyRequestHandler(host, 'Angular Live Development Server');
};

export const ɵcodegenPublicDirectory = async (sourceDir: string, destDir: string) => {
    const { architectHost, browserTarget } = await getContext(sourceDir);
    if (!browserTarget) throw 'No browser target';
    const browserTargetOptions = await architectHost.getOptionsForTarget(browserTarget);
    if (typeof browserTargetOptions?.outputPath !== 'string') throw new MyError('browserTarget output path is not a string');
    const browserOutputPath = browserTargetOptions.outputPath;
    await mkdir(destDir, { recursive: true });
    await copy(join(sourceDir, browserOutputPath), destDir);
};

export const ɵcodegenFunctionsDirectory = async (sourceDir: string, destDir: string) => {
    const { architectHost, host, serverTarget, browserTarget } = await getContext(sourceDir);
    if (!serverTarget) throw 'No server target';
    if (!browserTarget) throw 'No browser target';
    const packageJson = JSON.parse(await host.readFile(join(sourceDir, 'package.json')));
    const serverTargetOptions = await architectHost.getOptionsForTarget(serverTarget);
    if (typeof serverTargetOptions?.outputPath !== 'string') throw new MyError('serverTarget output path is not a string');
    const browserTargetOptions = await architectHost.getOptionsForTarget(browserTarget);
    if (typeof browserTargetOptions?.outputPath !== 'string') throw new MyError('browserTarget output path is not a string');
    const browserOutputPath = browserTargetOptions.outputPath;
    const serverOutputPath = serverTargetOptions.outputPath;
    await mkdir(join(destDir, serverOutputPath), { recursive: true });
    await mkdir(join(destDir, browserOutputPath), { recursive: true });
    await copy(join(sourceDir, serverOutputPath), join(destDir, serverOutputPath));
    await copy(join(sourceDir, browserOutputPath), join(destDir, browserOutputPath));
    const bootstrapScript = `exports.handle = require('./${serverOutputPath}/main.js').app();\n`;
    const bundleDependencies = serverTargetOptions.bundleDependencies ?? true;
    if (bundleDependencies) {
        const dependencies: Record<string, string> = {};
        const externalDependencies: string[] = serverTargetOptions.externalDependencies as any || [];
        externalDependencies.forEach(externalDependency => {
            const packageVersion = findDependency(externalDependency)?.version;
            if (packageVersion) { dependencies[externalDependency] = packageVersion; }
        });
        packageJson.dependencies = dependencies;
    }
    return { bootstrapScript, packageJson };
};

// TODO memoize, dry up
const getContext = async (dir:string) => {
    const { NodeJsAsyncHost } = relativeRequire(dir, '@angular-devkit/core/node');
    const { workspaces } = relativeRequire(dir, '@angular-devkit/core');
    const { WorkspaceNodeModulesArchitectHost } = relativeRequire(dir, '@angular-devkit/architect/node');
    const { Architect, targetFromTargetString, targetStringFromTarget } = relativeRequire(dir, '@angular-devkit/architect');
    const { parse } = relativeRequire(dir, 'jsonc-parser');

    const host = workspaces.createWorkspaceHost(new NodeJsAsyncHost());
    const { workspace } = await workspaces.readWorkspace(dir, host);
    const architectHost = new WorkspaceNodeModulesArchitectHost(workspace, dir);
    const architect = new Architect(architectHost);

    let project: string|undefined = (globalThis as any).NG_DEPLOY_PROJECT;
    let browserTarget: Target|undefined;
    let serverTarget: Target|undefined;;
    let prerenderTarget: Target|undefined;
    let serveTarget: Target|undefined;

    if (!project) {
        const angularJson = parse(await host.readFile(join(dir, 'angular.json')));
        project = angularJson.defaultProject;
    }

    if (!project) {
        const apps: string[] = [];
        workspace.projects.forEach((value, key) => {
            if (value.extensions.projectType === 'application') apps.push(key);
        });
        if (apps.length === 1) project = apps[0];
    }

    if (!project) throw new MyError('Unable to detirmine the application to deploy, you should use `ng deploy` via @angular/fire.');

    const workspaceProject = workspace.projects.get(project);
    if (!workspaceProject) throw new MyError(`No project ${project} found.`);
    const deployTargetDefinition = workspaceProject.targets.get('deploy');

    if (deployTargetDefinition?.builder === '@angular/fire:deploy') {
        const options = deployTargetDefinition.options;
        if (typeof options?.prerenderTarget === 'string')
            prerenderTarget = targetFromTargetString(options.prerenderTarget);
        if (typeof options?.browserTarget === 'string')
            browserTarget = targetFromTargetString(options.browserTarget);
        if (typeof options?.serverTarget === 'string')
            serverTarget = targetFromTargetString(options.serverTarget);
        if (!browserTarget) throw new MyError('ng-deploy is missing a browser target. Plase check your angular.json.');
        if (prerenderTarget) {
            const prerenderOptions = await architectHost.getOptionsForTarget(prerenderTarget);
            if (targetStringFromTarget(browserTarget) !== prerenderOptions?.browserTarget)
                throw new MyError('ng-deploy\'s browserTarget and prerender\'s browserTarget do not match. Please check your angular.json');
            if (serverTarget && targetStringFromTarget(serverTarget) !== prerenderOptions?.serverTarget)
                throw new MyError('ng-deploy\'s serverTarget and prerender\'s serverTarget do not match. Please check your angular.json');
            if (!serverTarget) console.warn('Treating the application as fully rendered. Add a serverTarget to your deploy target in angular.json to utilize server-side rendering.');
        }
    } else if (workspaceProject.targets.has('prerender')) {
        const target = workspaceProject.targets.get('prerender')!;
        const configurations = Object.keys(target.configurations!);
        const configuration = configurations.includes('production') ? 'production' : target.defaultConfiguration;
        if (!configuration) throw new MyError('No production or default configutation found for prerender.');
        if (configuration !== 'production') console.warn(`Using ${configuration} configuration for the prerender, we suggest adding a production target.`);
        prerenderTarget = { project, target: 'prerender', configuration };
        const production = await architectHost.getOptionsForTarget(prerenderTarget);
        if (typeof production?.browserTarget !== 'string')
            throw new MyError('Prerender browserTarget expected to be string, check your angular.json.');
        browserTarget = targetFromTargetString(production.browserTarget);
        if (typeof production?.serverTarget !== 'string')
            throw new MyError('Prerender serverTarget expected to be string, check your angular.json.');
        serverTarget = targetFromTargetString(production.serverTarget);
    } else {
        if (workspaceProject.targets.has('build')) {
            const target = workspaceProject.targets.get('build')!;
            const configurations = Object.keys(target.configurations!);
            const configuration = configurations.includes('production') ? 'production' : target.defaultConfiguration;
            if (!configuration) throw new MyError('No production or default configutation found for build.');
            if (configuration !== 'production') console.warn(`Using ${configuration} configuration for the browser deploy, we suggest adding a production target.`);
            browserTarget = { project, target: 'build', configuration };
        }
        if (workspaceProject.targets.has('server')) {
            const target = workspaceProject.targets.get('server')!;
            const configurations = Object.keys(target.configurations!);
            const configuration = configurations.includes('production') ? 'production' : target.defaultConfiguration;
            if (!configuration) throw new MyError('No production or default configutation found for server.');
            if (configuration !== 'production') console.warn(`Using ${configuration} configuration for the server deploy, we suggest adding a production target.`);
            serverTarget = { project, target: 'server', configuration };
        }
    }

    if (serverTarget && workspaceProject.targets.has('serve-ssr')) {
        const target = workspaceProject.targets.get('serve-ssr')!;
        const configurations = Object.keys(target.configurations!);
        const configuration = configurations.includes('development') ? 'development' : target.defaultConfiguration;
        if (!configuration) throw new MyError('No development or default configutation found for serve-ssr.');
        if (configuration !== 'development') console.warn(`Using ${configuration} configuration for the local server, we suggest adding a development target.`);
        serveTarget = { project, target: 'serve-ssr', configuration };
    } else if (workspaceProject.targets.has('serve')) {
        if (serverTarget) console.warn(`No server-ssr target found.`);
        const target = workspaceProject.targets.get('serve')!;
        const configurations = Object.keys(target.configurations!);
        const configuration = configurations.includes('development') ? 'development' : target.defaultConfiguration;
        if (!configuration) throw new MyError('No development or default configutation found for serve.');
        if (configuration !== 'development') console.warn(`Using ${configuration} configuration for the local server, we suggest adding a development target.`);
        serveTarget = { project, target: 'serve', configuration };
    }

    return { architect, architectHost, host, browserTarget, prerenderTarget, serverTarget, serveTarget };
}
