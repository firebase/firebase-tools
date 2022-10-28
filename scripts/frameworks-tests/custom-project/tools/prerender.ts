import { mkdirSync, writeFileSync } from 'fs';
import { exit } from 'process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

const prerender = async () => {

    console.log('Starting express server...');
    await sleep(1_200);

    console.log('Prerendering /...');
    writeFileSync('./lib/index.html', '...');
    await sleep(200);

    console.log('Prerendering /posts...');
    writeFileSync('./lib/posts.html', '...');
    await sleep(200);

    console.log('Prerendering /authors...');
    writeFileSync('./lib/authors.html', '...');
    await sleep(200);

    const words = ['drown',
    'wacky',
    'shop',
    'clip',
    'earth',
    'astonishing',
    'observation',
    'range',
    'craven',
    'sort',
    'absorbing',
    'classy',
    'grateful',
    'unequal',
    'rude',
    'ruddy',
    'bait',
    'refuse',
    'amazing',
    'merciful',
    'education',
    'basket',
    'icy'];

    const randomWord = () => words[words.length * Math.random() | 0];
    const randomPostName = () => [randomWord(), randomWord(), randomWord()].join('-');

    try { mkdirSync('./lib/posts') } catch(e) { };

    const postCount = 56;
    const posts = [];
    for (let i = 0; i < postCount; i++) {
        posts.push(randomPostName());
    }

    let i = 0;
    for (const post of posts) {
        console.log(`Prerendering /posts/${post}... (${i++}/${postCount})`);
        try { writeFileSync(`./lib/posts/${post}.html`, '...') } catch(e) {};
        await sleep(60);
    }

    console.log('Prerender complete, terminating express server...');

};

prerender().then(() => exit(0), e => {
    console.error(e.message);
    exit(1)
});