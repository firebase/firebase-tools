import { expect } from "chai";
import * as sinon from "sinon";
import * as http from "http";
import { createHttpTransport, HttpTransportOptions } from "./http-transport";

describe("http-transport", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("createHttpTransport", () => {
    it("should create an HTTP transport with default options", async () => {
      const options: HttpTransportOptions = {
        port: 0, // Use port 0 to let OS assign an available port
        host: "127.0.0.1",
        stateless: false,
      };

      const result = await createHttpTransport(options);

      try {
        expect(result.app).to.exist;
        expect(result.transport).to.exist;
        expect(result.server).to.exist;
        expect(result.close).to.be.a("function");
        expect(result.server).to.be.instanceof(http.Server);
      } finally {
        await result.close();
      }
    });

    it("should create an HTTP transport in stateless mode", async () => {
      const options: HttpTransportOptions = {
        port: 0,
        host: "127.0.0.1",
        stateless: true,
      };

      const result = await createHttpTransport(options);

      try {
        expect(result.app).to.exist;
        expect(result.transport).to.exist;
        // In stateless mode, sessionIdGenerator should be undefined
        expect(result.transport.sessionId).to.be.undefined;
      } finally {
        await result.close();
      }
    });

    it("should respond to health check endpoint", async function () {
      this.timeout(10000); // Increase timeout for network operations

      const options: HttpTransportOptions = {
        port: 0,
        host: "127.0.0.1",
        stateless: false,
      };

      const result = await createHttpTransport(options);

      try {
        const address = result.server.address();
        if (!address || typeof address === "string") {
          throw new Error("Server address not available");
        }
        const port = address.port;

        // Make a request to the health endpoint using http module
        const body = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/health",
              method: "GET",
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(e);
                }
              });
            },
          );
          req.on("error", reject);
          req.end();
        });

        expect(body.status).to.equal("healthy");
        expect(body.service).to.equal("firebase-mcp");
        expect(body.transport).to.equal("streamable-http");
        expect(body.stateless).to.equal(false);
      } finally {
        await result.close();
      }
    });

    it("should return 404 for unknown routes", async function () {
      this.timeout(10000);

      const options: HttpTransportOptions = {
        port: 0,
        host: "127.0.0.1",
        stateless: false,
      };

      const result = await createHttpTransport(options);

      try {
        const address = result.server.address();
        if (!address || typeof address === "string") {
          throw new Error("Server address not available");
        }
        const port = address.port;

        const { statusCode, body } = await new Promise<{
          statusCode: number;
          body: Record<string, unknown>;
        }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/unknown-route",
              method: "GET",
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  resolve({ statusCode: res.statusCode || 0, body: JSON.parse(data) });
                } catch (e) {
                  reject(e);
                }
              });
            },
          );
          req.on("error", reject);
          req.end();
        });

        expect(statusCode).to.equal(404);
        expect(body.error).to.equal("Not found");
      } finally {
        await result.close();
      }
    });

    it("should include security headers in responses", async function () {
      this.timeout(10000);

      const options: HttpTransportOptions = {
        port: 0,
        host: "127.0.0.1",
        stateless: false,
      };

      const result = await createHttpTransport(options);

      try {
        const address = result.server.address();
        if (!address || typeof address === "string") {
          throw new Error("Server address not available");
        }
        const port = address.port;

        const headers = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/health",
              method: "GET",
            },
            (res) => {
              res.on("data", () => {}); // Consume data
              res.on("end", () => resolve(res.headers));
            },
          );
          req.on("error", reject);
          req.end();
        });

        expect(headers["x-content-type-options"]).to.equal("nosniff");
        expect(headers["x-frame-options"]).to.equal("DENY");
        expect(headers["x-xss-protection"]).to.equal("1; mode=block");
        expect(headers["cache-control"]).to.include("no-store");
      } finally {
        await result.close();
      }
    });

    it("should handle CORS preflight requests", async function () {
      this.timeout(10000);

      const options: HttpTransportOptions = {
        port: 0,
        host: "127.0.0.1",
        stateless: false,
      };

      const result = await createHttpTransport(options);

      try {
        const address = result.server.address();
        if (!address || typeof address === "string") {
          throw new Error("Server address not available");
        }
        const port = address.port;

        const { statusCode, headers } = await new Promise<{
          statusCode: number;
          headers: http.IncomingHttpHeaders;
        }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/mcp",
              method: "OPTIONS",
              headers: {
                Origin: "http://example.com",
                "Access-Control-Request-Method": "POST",
              },
            },
            (res) => {
              res.on("data", () => {});
              res.on("end", () => resolve({ statusCode: res.statusCode || 0, headers: res.headers }));
            },
          );
          req.on("error", reject);
          req.end();
        });

        expect(statusCode).to.equal(204);
        expect(headers["access-control-allow-methods"]).to.include("POST");
        expect(headers["access-control-allow-headers"]).to.include("Content-Type");
        expect(headers["access-control-allow-headers"]).to.include("Mcp-Session-Id");
      } finally {
        await result.close();
      }
    });

    it("should close the server gracefully", async () => {
      const options: HttpTransportOptions = {
        port: 0,
        host: "127.0.0.1",
        stateless: false,
      };

      const result = await createHttpTransport(options);

      // Server should be listening
      expect(result.server.listening).to.be.true;

      // Close the server
      await result.close();

      // Server should no longer be listening
      expect(result.server.listening).to.be.false;
    });

    it("should validate allowed origins when specified", async function () {
      this.timeout(10000);

      const options: HttpTransportOptions = {
        port: 0,
        host: "127.0.0.1",
        stateless: false,
        allowedOrigins: ["http://allowed-origin.com"],
      };

      const result = await createHttpTransport(options);

      try {
        const address = result.server.address();
        if (!address || typeof address === "string") {
          throw new Error("Server address not available");
        }
        const port = address.port;

        // Request with allowed origin
        const allowedHeaders = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/health",
              method: "GET",
              headers: {
                Origin: "http://allowed-origin.com",
              },
            },
            (res) => {
              res.on("data", () => {});
              res.on("end", () => resolve(res.headers));
            },
          );
          req.on("error", reject);
          req.end();
        });
        expect(allowedHeaders["access-control-allow-origin"]).to.equal("http://allowed-origin.com");

        // Request with disallowed origin
        const disallowedHeaders = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/health",
              method: "GET",
              headers: {
                Origin: "http://disallowed-origin.com",
              },
            },
            (res) => {
              res.on("data", () => {});
              res.on("end", () => resolve(res.headers));
            },
          );
          req.on("error", reject);
          req.end();
        });
        expect(disallowedHeaders["access-control-allow-origin"]).to.be.undefined;
      } finally {
        await result.close();
      }
    });
  });
});
