/**
 * HTTP Transport for Firebase MCP Server
 *
 * This module provides Streamable HTTP transport support for the Firebase MCP server,
 * enabling remote connections via HTTP POST/GET with Server-Sent Events (SSE) for streaming.
 */

import * as express from "express";
import { randomUUID } from "crypto";
import { Server as HttpServer } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface HttpTransportOptions {
  /** HTTP server port (default: 8000) */
  port: number;
  /** HTTP server host (default: 127.0.0.1) */
  host: string;
  /** Enable stateless mode for horizontal scaling (default: false) */
  stateless: boolean;
  /** Optional list of allowed origins for CORS (default: allows all) */
  allowedOrigins?: string[];
}

export interface HttpTransportResult {
  /** Express application instance */
  app: express.Express;
  /** Streamable HTTP transport instance */
  transport: StreamableHTTPServerTransport;
  /** HTTP server instance */
  server: HttpServer;
  /** Function to close the server */
  close: () => Promise<void>;
}

/**
 * Creates security middleware for the HTTP transport.
 * Adds security headers to prevent common attacks.
 */
function createSecurityMiddleware() {
  return (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");
    // Enable XSS filter
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Disable caching for MCP responses
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    next();
  };
}

/**
 * Creates CORS middleware for the HTTP transport.
 * Validates Origin headers to prevent DNS rebinding attacks.
 */
function createCorsMiddleware(allowedOrigins?: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.headers.origin;

    // If no allowed origins specified, allow all (for development)
    if (!allowedOrigins || allowedOrigins.length === 0) {
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
    } else if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID",
    );
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    res.setHeader("Access-Control-Max-Age", "86400");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Creates an HTTP transport for the Firebase MCP server.
 *
 * @param options - Configuration options for the HTTP transport
 * @returns Promise resolving to the HTTP transport result
 */
export async function createHttpTransport(
  options: HttpTransportOptions,
): Promise<HttpTransportResult> {
  const { port, host, stateless, allowedOrigins } = options;

  const app = express();

  // Apply security middleware
  app.use(createSecurityMiddleware());

  // Apply CORS middleware
  app.use(createCorsMiddleware(allowedOrigins));

  // Parse JSON bodies
  app.use(express.json());

  // Create the StreamableHTTPServerTransport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: stateless ? undefined : () => randomUUID(),
  });

  // Health check endpoint
  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({
      status: "healthy",
      service: "firebase-mcp",
      transport: "streamable-http",
      stateless,
    });
  });

  // MCP endpoint - handles both POST and GET requests
  app.all("/mcp", async (req: express.Request, res: express.Response) => {
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      // Log error but don't crash the server
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  // 404 handler for unknown routes
  app.use((_req: express.Request, res: express.Response) => {
    res.status(404).json({
      error: "Not found",
      message: "The MCP endpoint is available at /mcp",
    });
  });

  // Start the HTTP server
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const close = async () => {
        // Close the transport first
        await transport.close().catch(() => {
          // Ignore transport close errors
        });

        // Then close the HTTP server
        return new Promise<void>((resolveClose, rejectClose) => {
          server.close((err) => {
            if (err) {
              rejectClose(err);
            } else {
              resolveClose();
            }
          });
        });
      };

      resolve({ app, transport, server, close });
    });

    server.on("error", (error) => {
      reject(error);
    });
  });
}
