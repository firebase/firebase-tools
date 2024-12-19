import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// This gets run from root, not cwd
register('./src/test/helpers/mockAuthLoader.js', pathToFileURL('./'));