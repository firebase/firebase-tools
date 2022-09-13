import { execSync, spawn } from "child_process";
import { readFile, mkdir, copyFile, stat } from 'fs/promises';
import { dirname, extname, join } from 'path';
import type { Header, Rewrite, Redirect } from 'next/dist/lib/load-custom-routes';
import type { NextConfig } from 'next';
import { copy } from 'fs-extra';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { BuildResult, findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";
import { proxyRequestHandler } from "../../hosting/proxy";
import { prompt } from "../../prompt";

const CLI_COMMAND = process.platform === 'win32' ? 'next.cmd' : 'next';

export const name = 'Next.js';
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.MetaFramework;

export const discover = async (dir: string) => {
    if (!existsSync(join(dir, 'package.json'))) return undefined;
    if (!existsSync('next.config.js') && !findDependency('next', { cwd: dir, depth: 0, omitDev: false })) return undefined;
    // TODO don't hardcode public dir
    return { mayWantBackend: true, publicDirectory: join(dir, 'public') };
};


export const build = async (dir: string): Promise<BuildResult> => {

    const { default: nextBuild } = relativeRequire(dir, 'next/dist/build');

    await nextBuild(dir, null, false, false, true).catch(e => {
        console.error(e.message);
        throw e;
    });

    try {
        // Using spawn here, rather than their programatic API because I can't silence it
        // Failures with Next export are expected, we're just trying to do it if we can
        execSync(`${CLI_COMMAND} export`, { cwd: dir, stdio: 'ignore' });
    } catch(e) { }

    let wantsBackend = true;
    const { distDir='.next' } = await getNextConfig(dir);
    const exportDetailJson = await readFile(join(dir, distDir, 'export-detail.json')).then(it => JSON.parse(it.toString()), () => { success: false });
    // SEMVER these defaults are only needed for Next 11
    if (exportDetailJson.success) {
        const prerenderManifestJSON = await readFile(join(dir, distDir, 'prerender-manifest.json')).then(it => JSON.parse(it.toString()));
        const anyDynamicRouteFallbacks = !!Object.values(prerenderManifestJSON.dynamicRoutes || {}).find((it: any) => it.fallback !== false );
        const pagesManifestJSON = await readFile(join(dir, distDir, 'server', 'pages-manifest.json')).then(it => JSON.parse(it.toString()));
        const prerenderedRoutes = Object.keys(prerenderManifestJSON.routes);
        const dynamicRoutes = Object.keys(prerenderManifestJSON.dynamicRoutes);
        const unrenderedPages = Object.keys(pagesManifestJSON).filter(it =>!(
            ['/_app', '/_error', '/_document', '/404'].includes(it) ||
            prerenderedRoutes.includes(it) ||
            dynamicRoutes.includes(it)
        ));
        // TODO log these as a reason why Cloud Functions are needed
        if (!anyDynamicRouteFallbacks && unrenderedPages.length === 0) {
            wantsBackend = false;
        }
    }

    const manifestBuffer = await readFile(join(dir, distDir, 'routes-manifest.json'));
    const manifest: Manifest = JSON.parse(manifestBuffer.toString());
    const {
        headers: nextJsHeaders=[],
        redirects: nextJsRedirects=[],
        rewrites: nextJsRewrites=[],
    } = manifest;
    const headers = nextJsHeaders.map(({ source, headers }) => ({ source, headers }));
    const redirects = nextJsRedirects
        .filter(({ internal }: any) => !internal)
        .map(({ source, destination, statusCode: type }) => ({ source, destination, type }));
    const nextJsRewritesToUse = Array.isArray(nextJsRewrites) ? nextJsRewrites : nextJsRewrites.beforeFiles || [];
    const rewrites = nextJsRewritesToUse.map(({ source, destination, locale, has }) => {
        // Can we change i18n into Firebase settings?
        if (has) return undefined;
        return { source, destination };
    }).filter(it => it);

    // TODO use this better detection for usesFirebaseConfig
    return { wantsBackend, headers, redirects, rewrites };
}

export const init = async (setup: any) => {
    await prompt(setup.hosting, [{
        name: "frameworksLanguage",
        type: "list",
        default: "typescript",
        message: "What language would you like to use?",
        choices: ["javascript", "typescript"],
    }]);
    execSync(`npx --yes create-next-app@latest ${setup.hosting.source} ${setup.hosting.frameworksLanguage === 'tyescript' ? '--ts': ''}`, {stdio: 'inherit'});
};

export const ɵcodegenPublicDirectory = async (sourceDir: string, destDir: string) => {
    // SEMVER these defaults are only needed for Next 11
    // TODO use basePath
    const { distDir='.next', basePath='' } = await getNextConfig(sourceDir);
    const exportDetailJson = await readFile(join(sourceDir, distDir, 'export-detail.json')).then(it => JSON.parse(it.toString()), () => { success: false });
    if (exportDetailJson.success) {
        copy(exportDetailJson.outDirectory, destDir);
    } else {
        await mkdir(join(destDir, '_next', 'static'), { recursive: true });
        await copy(join(sourceDir, 'public'), destDir);
        await copy(join(sourceDir, distDir, 'static'), join(destDir, '_next', 'static'));

        const serverPagesDir = join(sourceDir, distDir, 'server', 'pages');
        await copy(serverPagesDir, destDir, { filter: async filename => {
            const status = await stat(filename);
            if (status.isDirectory()) return true;
            return extname(filename) === '.html'
        }});

        const prerenderManifestBuffer = await readFile(join(sourceDir, distDir, 'prerender-manifest.json'));
        const prerenderManifest = JSON.parse(prerenderManifestBuffer.toString());
        // TODO drop from hosting if revalidate
        for (const route in prerenderManifest.routes) {
            // / => index.json => index.html => index.html
            // /foo => foo.json => foo.html
            const parts = route.split('/').slice(1).filter(it => !!it);
            const partsOrIndex = parts.length > 0 ? parts : ['index'];
            const dataPath = `${join(...partsOrIndex)}.json`;
            const htmlPath = `${join(...partsOrIndex)}.html`;
            await mkdir(join(destDir, dirname(htmlPath)), { recursive: true });
            await copyFile(
                join(sourceDir, distDir, 'server', 'pages', htmlPath),
                join(destDir, htmlPath)
            );
            const dataRoute = prerenderManifest.routes[route].dataRoute;
            await mkdir(join(destDir, dirname(dataRoute)), { recursive: true });
            await copyFile(join(sourceDir, distDir, 'server', 'pages', dataPath), join(destDir, dataRoute));
        }
    }
};

export const ɵcodegenFunctionsDirectory = async (sourceDir: string, destDir: string) => {
    const { distDir='.next', basePath='' } = await getNextConfig(sourceDir);
    await mkdir(destDir, { recursive: true });
    // TODO bundle the next.config so dev-deps are captured
    await copyFile(join(sourceDir, 'next.config.js'), join(destDir, 'next.config.js'));
    await copy(join(sourceDir, 'public'), join(destDir, 'public'));
    await copy(join(sourceDir, distDir), join(destDir, distDir));
    const packageJsonBuffer = await readFile(join(sourceDir, 'package.json'));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    return { packageJson };
};

export const getDevModeHandle = async (dir: string) => {
    let resolvePort: (it:string) => void;
    const portThatWasPromised = new Promise<string>((resolve, reject) => resolvePort = resolve);
    // TODO implement custom server
    const serve = spawn(CLI_COMMAND, ['dev'], { cwd: dir });
    serve.stdout.on("data", (data: any) => {
        process.stdout.write(data);
        const match = data.toString().match(/(http:\/\/localhost:\d+)/);
        if (match) resolvePort(match[1]);
    });
    const host = await portThatWasPromised;
    return proxyRequestHandler(host, 'Next.js Development Server');
};

const getNextConfig = async (dir: string): Promise<NextConfig> => {
    if (existsSync(join(dir, 'next.config.js'))) {
        try {
            const { default: loadConfig } = relativeRequire(dir, 'next/dist/server/config');
            const { PHASE_PRODUCTION_BUILD } = relativeRequire(dir, 'next/constants');
            return await loadConfig(PHASE_PRODUCTION_BUILD, dir, null);
        } catch(e) { }
        // Try just importing it, incase of Next 11
        try {
            return await import(pathToFileURL(join(dir, 'next.config.js')).toString());
        } catch(e) { }
        throw new Error('Unable to load next.config.js.');
    } else {
        return {};
    }
};

type Manifest = {
    distDir?: string,
    basePath?: string,
    headers?: (Header & { regex: string})[],
    redirects?: (Redirect & { regex: string})[],
    rewrites?: (Rewrite & { regex: string})[] | {
        beforeFiles?: (Rewrite & { regex: string})[],
        afterFiles?: (Rewrite & { regex: string})[],
        fallback?: (Rewrite & { regex: string})[],
    },
};
