import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { spawn } from "cross-spawn";
interface AppHostingEmulatorArgs {
  options?: any;
  port?: number;
  host?: string;
}

export class AppHostingEmulator implements EmulatorInstance {
  constructor(private args: AppHostingEmulatorArgs) {}

  async start(): Promise<void> {
    this.args.options.host = this.args.host;
    this.args.options.port = this.args.port;

    // const { ports } = await serveHosting.start(this.args.options);
    // this.args.port = ports[0];
    // if (ports.length > 1) {
    //   this.reservedPorts = ports.slice(1);
    // }

    console.log(`starting apphosting emulatorr!!`);
    const host = await serve(
      this.args.options.host,
      this.args.options.port,
      "/usr/local/google/home/mathusan/github.com/mathu97/domain-name-generator",
    );
    console.log(`serving on ${host}`);
  }
  connect(): Promise<void> {
    console.log(`connecting apphosting emulatorr!!`);
    // throw new Error("Method not implemented.");
    return Promise.resolve();
  }

  stop(): Promise<void> {
    // throw new Error("Method not implemented.");
    console.log("stopping apphosting emulator");
    return Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    // throw new Error("Method not implemented.");
    return {
      name: Emulators.APPHOSTING,
      host: "127.0.0.1",
      port: 5001,
    };
  }

  getName(): Emulators {
    return Emulators.APPHOSTING;
  }
}

export async function serve(hostaddr: string, port: string, cwd: string) {
  console.log(`cwd: ${process.cwd()}`);
  const host = new Promise<string>((resolve, reject) => {
    const serve = spawn("npm", ["run", "dev", "--", `-H`, hostaddr, `-p`, port], {
      cwd: process.cwd(),
    });
    serve.on("error", function (err) {
      console.log("Oh noez, teh errurz: " + JSON.stringify(err));
    });
    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/localhost:\d+)/);
      if (match) resolve(match[1]);
    });
    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });
    serve.on("exit", reject);
  });

  return host;
}
