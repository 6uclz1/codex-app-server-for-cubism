import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { StdioJsonRpcTransport } from "./JsonRpcTransport.js";

describe("StdioJsonRpcTransport", () => {
  it("writes JSON-RPC requests and resolves matching responses from stdout", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const written: string[] = [];
    stdin.on("data", (chunk) => written.push(chunk.toString()));

    const transport = new StdioJsonRpcTransport({ stdin, stdout });
    const response = transport.request("initialize", { client: "test" });

    expect(JSON.parse(written.join(""))).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { client: "test" }
    });

    stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }) + "\n");
    await expect(response).resolves.toEqual({ ok: true });
  });

  it("emits notifications as streamed events", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new StdioJsonRpcTransport({ stdin, stdout });
    const events: unknown[] = [];
    transport.onNotification((event) => events.push(event));

    stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "agent/event", params: { type: "delta" } }) + "\n");

    expect(events).toEqual([{ method: "agent/event", params: { type: "delta" } }]);
  });

  it("routes server requests and writes JSON-RPC responses", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const written: string[] = [];
    stdin.on("data", (chunk) => written.push(chunk.toString()));

    const transport = new StdioJsonRpcTransport({ stdin, stdout });
    transport.onServerRequest(async (request) => {
      expect(request.method).toBe("item/commandExecution/requestApproval");
      return { decision: "denied" };
    });

    stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 10, method: "item/commandExecution/requestApproval", params: { command: "rm -rf ." } }) + "\n");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(written.join(""))).toEqual({
      jsonrpc: "2.0",
      id: 10,
      result: { decision: "denied" }
    });
  });
});
