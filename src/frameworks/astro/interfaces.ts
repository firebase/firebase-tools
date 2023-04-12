export interface AstroConfig {
    output: "server" | "static";
    outDir: string;
    publicDir: string;
    adapter?: {
        name: string
    };
};
