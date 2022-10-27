import { exit } from 'process';
import { readdir, access } from 'fs/promises';
import { join, relative } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const site = 'nextjs-demo-73e34';
const cwd = join('scripts', 'frameworks-tests', 'angular-project');
const bin = relative(cwd, join(process.cwd(), 'lib', 'bin', 'firebase.js'));
console.log(bin);

const run = async () => {
    execSync(`ng new angular-project --defaults --skip-git`, { cwd: join(cwd, '..')});
    execSync(`node ${bin} emulators:exec "exit 0"`, { cwd });
    if (await access(join(cwd, '.firebase')).then(() => false, () => true)) throw '.firebase does not exist';
    if (await access(join(cwd, '.firebase', site)).then(() => false, () => true)) throw `.firebase/${site} does not exist`;
    if (await access(join(cwd, '.firebase', site, 'hosting')).then(() => false, () => true)) throw `.firebase/${site}/hosting does not exist`;
    if (!(await readdir(join(cwd, '.firebase', site, 'hosting'))).length) throw `no files in .firebase/${site}/hosting`;
    if (await access(join(cwd, '.firebase', site, 'functions')).then(() => true, () => false)) throw `.firebase/${site}/functions should not exist`;
}

run().then(
    () => exit(0),
    err => {
        console.error(err.message || err);
        const logPath = join(cwd, 'firebase-debug.log');
        if (existsSync(logPath)) console.log(readFileSync(logPath).toString());
        exit(1);
    }
);

export {};
