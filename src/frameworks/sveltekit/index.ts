import { execSync } from 'child_process';
import { FrameworkType } from '..';
import { vitePluginDiscover } from '../vite';

export * from '../vite';

export const name = 'SvelteKit';
export const type = FrameworkType.MetaFramework;

export const init = async (setup: any) => {
    execSync(`npm create svelte@latest ${setup.hosting.source} --yes`, {stdio: 'inherit'});
    execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
};

export const discover = vitePluginDiscover('vite-plugin-svelte-kit');
