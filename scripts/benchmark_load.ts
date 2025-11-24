
import { load } from "../src/commands/index";

const mockClient: any = {
    cli: {
        command: () => ({
            description: () => ({}),
            aliases: () => ({}),
            option: () => ({}),
            on: () => ({}),
            action: () => ({}),
        }),
        commands: [],
    },
    logger: {},
    errorOut: () => {},
    getCommand: () => {},
};

const start = process.hrtime.bigint();
load(mockClient);
const end = process.hrtime.bigint();

console.log(`Load time: ${Number(end - start) / 1e6}ms`);
