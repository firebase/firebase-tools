import * as net from "net";

export async function findOpenPort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let server: net.Server | null = null;

    server = net.createServer();
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        // Port is in use, try the next one
        if (server) {
          server.close(() =>
            findOpenPort(startPort + 1)
              .then(resolve)
              .catch(reject),
          );
        } else {
          reject(new Error("Server is null while handling EADDRINUSE"));
        }
      } else {
        reject(err);
      }
    });

    server.listen(startPort, "127.0.0.1", () => {
      const address = server?.address();
      if (address && typeof address === "object" && "port" in address) {
        const port = address.port;
        if (server) {
          server.close(() => resolve(port));
        } else {
          reject(new Error("Server is null after successful listen"));
        }
      } else {
        reject(new Error("Invalid address returned from server"));
      }
    });
  });
}
