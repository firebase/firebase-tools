import type { Target } from '@angular-devkit/architect';
import { join } from 'path';
import { parse } from 'jsonc-parser';
import { existsSync } from 'fs';

import { BuildResult, Discovery, FrameworkType, relativeRequire, SupportLevel } from '..';
import { execSync } from 'child_process';
import { prompt } from '../../prompt';
import { IncomingMessage, ServerResponse } from 'http';

class MyError extends Error {
    constructor(reason: string) {
        console.error(reason);
        super();
    }
}

export const name = 'Angular';
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Framework;

export const discover = async (dir: string): Promise<Discovery> => {
    if (!existsSync(join(dir, 'angular.json'))) return undefined;
    const { serverTarget } = await getContext(dir);
    // TODO don't hardcode assets dir
    return { headers: [], redirects: [], rewrites: [], mayWantBackend: !!serverTarget, publicDirectory: join(dir, 'src', 'assets') };
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
            `${process.platform === 'win32' ? 'ng.cmd' : 'ng'} run ${targetStringFromTarget(prerenderTarget)}`,
            { cwd: dir, stdio: 'inherit' }
        );
    } else {
        await scheduleTarget(browserTarget);
        if (serverTarget) await scheduleTarget(serverTarget);
    }

    const wantsBackend = !!serverTarget;

    return { wantsBackend, rewrites: [], redirects: [], headers: [] };
};

export const getDevModeHandle = async (dir: string) => {
    const { serverTarget, architect } = await getContext(dir);
    if (!serverTarget) {
        console.warn('Something something server target not found.');
        return undefined;
    }
    const run = await architect.scheduleTarget(serverTarget);
    return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // intercept 404 => return undefined;
        // cloud function
        res.write('hello world.');
        res.end();
        //next();
    };
};

export const ɵcodegenPublicDirectory = async (sourceDir: string, destDir: string) => {
    // find the dist directory
};

export const ɵcodegenFunctionsDirectory = async () => {
};

const getContext = async (dir:string) => {

    const { NodeJsAsyncHost } = relativeRequire(dir, '@angular-devkit/core/node');
    const { workspaces } = relativeRequire(dir, '@angular-devkit/core');
    const { WorkspaceNodeModulesArchitectHost } = relativeRequire(dir, '@angular-devkit/architect/node');
    const { Architect, targetFromTargetString, targetStringFromTarget } = relativeRequire(dir, '@angular-devkit/architect');

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

    return { architect, browserTarget, prerenderTarget, serverTarget, serveTarget };
}