import type { Readable, Writable } from "node:stream";

export interface JsonRpcTransportStreams {
  stdin: Writable;
  stdout: Readable;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export interface JsonRpcServerRequest {
  id: number;
  method: string;
  params?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class StdioJsonRpcTransport {
  private nextId = 1;
  private buffered = "";
  private readonly pending = new Map<number, PendingRequest>();
  private readonly notificationHandlers = new Set<(notification: JsonRpcNotification) => void>();
  private serverRequestHandler: ((request: JsonRpcServerRequest) => Promise<unknown> | unknown) | null = null;

  constructor(private readonly streams: JsonRpcTransportStreams) {
    streams.stdout.on("data", (chunk) => this.consume(chunk.toString()));
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.streams.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  notify(method: string, params?: unknown): void {
    this.streams.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  onServerRequest(handler: (request: JsonRpcServerRequest) => Promise<unknown> | unknown): () => void {
    this.serverRequestHandler = handler;
    return () => {
      if (this.serverRequestHandler === handler) {
        this.serverRequestHandler = null;
      }
    };
  }

  private consume(text: string): void {
    this.buffered += text;
    let newlineIndex = this.buffered.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffered.slice(0, newlineIndex).trim();
      this.buffered = this.buffered.slice(newlineIndex + 1);
      if (line) {
        this.handleLine(line);
      }
      newlineIndex = this.buffered.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    const message = JSON.parse(line) as {
      id?: number;
      result?: unknown;
      error?: unknown;
      method?: string;
      params?: unknown;
    };

    if (typeof message.id === "number" && message.method && !this.pending.has(message.id)) {
      void this.handleServerRequest({ id: message.id, method: message.method, params: message.params });
      return;
    }

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(message.error);
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const notification = { method: message.method, params: message.params };
      for (const handler of this.notificationHandlers) {
        handler(notification);
      }
    }
  }

  private async handleServerRequest(request: JsonRpcServerRequest): Promise<void> {
    try {
      const result = this.serverRequestHandler ? await this.serverRequestHandler(request) : { decision: "denied" };
      this.streams.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
    } catch (error) {
      this.streams.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error)
          }
        })}\n`
      );
    }
  }
}
