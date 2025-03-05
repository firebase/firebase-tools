# Firebase Tools Development Guide

## Build & Test Commands

- Build: `npm run build`
- Watch mode: `npm run build:watch`
- Lint: `npm run lint` or `npm run lint:ts`
- Format code: `npm run format`
- Run all tests: `npm run test`
- Run single test: `mocha 'src/**/*name-of-test*.spec.{ts,js}'`
- Run specific test category: `npm run test:emulator` or `npm run mocha:fast`

## Code Style Guidelines

- TypeScript with strict typing
- Follow Google style guide and ESLint rules
- Max line length: 100 characters
- Use camelCase for variables/functions, PascalCase for classes/interfaces
- Include JSDoc for public methods/functions
- Return types must be explicitly defined
- Prefer arrow functions over function expressions
- Promises must be properly handled (no floating promises)
- Use async/await for asynchronous code
- Use strong typing - avoid `any` when possible
- Always handle errors appropriately with try/catch
