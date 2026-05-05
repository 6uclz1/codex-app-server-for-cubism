import { describe, expect, it } from "vitest";
import { CodexChatClient, type CodexProtocolTransport } from "./CodexChatClient.js";
import type { JsonRpcNotification } from "./JsonRpcTransport.js";

class FakeTransport implements CodexProtocolTransport {
  readonly calls: Array<{ method: string; params?: unknown }> = [];
  private notificationHandler: ((notification: JsonRpcNotification) => void) | null = null;

  async request(method: string, params?: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === "initialize") {
      return { userAgent: "fake", codexHome: "/tmp/codex", platformFamily: "unix", platformOs: "macos" };
    }
    if (method === "account/read") {
      return { account: { type: "chatgpt", email: "test@example.com", planType: "plus" }, requiresOpenaiAuth: false };
    }
    if (method === "account/login/start") {
      return { type: "chatgpt", loginId: "login_1", authUrl: "https://chatgpt.com/auth" };
    }
    if (method === "account/logout") {
      return {};
    }
    if (method === "thread/start") {
      return { thread: { id: "thread_1" } };
    }
    if (method === "turn/start") {
      setTimeout(() => {
        this.notificationHandler?.({
          method: "item/agentMessage/delta",
          params: { threadId: "thread_1", turnId: "turn_1", itemId: "item_1", delta: "Hello" }
        });
        this.notificationHandler?.({
          method: "turn/completed",
          params: { threadId: "thread_1", turn: { id: "turn_1", status: "completed", error: null } }
        });
      }, 0);
      return { turn: { id: "turn_1" } };
    }
    return {};
  }

  notify(method: string, params?: unknown): void {
    this.calls.push({ method, params });
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): () => void {
    this.notificationHandler = handler;
    return () => {
      this.notificationHandler = null;
    };
  }
}

describe("CodexChatClient", () => {
  it("initializes Codex App Server and sends chat turns through thread/start and turn/start", async () => {
    const transport = new FakeTransport();
    const client = new CodexChatClient(transport, { cwd: "/tmp/app" });

    await client.initialize();
    await expect(client.readAccount()).resolves.toMatchObject({
      account: { type: "chatgpt", email: "test@example.com" }
    });
    await expect(client.sendMessage("Hi")).resolves.toEqual({
      threadId: "thread_1",
      turnId: "turn_1",
      text: "Hello"
    });

    expect(transport.calls.map((call) => call.method)).toEqual([
      "initialize",
      "initialized",
      "account/read",
      "thread/start",
      "turn/start"
    ]);
    expect(transport.calls.find((call) => call.method === "turn/start")?.params).toMatchObject({
      threadId: "thread_1",
      input: [{ type: "text", text: "Hi", text_elements: [] }],
      approvalPolicy: "never"
    });
    expect(transport.calls.find((call) => call.method === "thread/start")?.params).toMatchObject({
      baseInstructions: expect.stringContaining("[emotion: joy|anger|sorrow|fun|neutral]")
    });
  });

  it("starts character chat without workspace or local environment access", async () => {
    const transport = new FakeTransport();
    const client = new CodexChatClient(transport, { cwd: "/tmp/app" });

    await client.sendMessage("Hi");

    const threadStart = transport.calls.find((call) => call.method === "thread/start")?.params as Record<string, unknown>;
    expect(threadStart).toMatchObject({
      approvalPolicy: "never",
      environments: []
    });
    expect(threadStart).not.toHaveProperty("cwd");
    expect(threadStart).not.toHaveProperty("sandbox");

    const turnStart = transport.calls.find((call) => call.method === "turn/start")?.params as Record<string, unknown>;
    expect(turnStart).toMatchObject({
      approvalPolicy: "never",
      environments: []
    });
    expect(turnStart).not.toHaveProperty("cwd");
  });

  it("starts managed ChatGPT browser login through Codex App Server", async () => {
    const transport = new FakeTransport();
    const client = new CodexChatClient(transport, { cwd: "/tmp/app" });

    await expect(client.startChatGptLogin()).resolves.toEqual({
      type: "chatgpt",
      loginId: "login_1",
      authUrl: "https://chatgpt.com/auth"
    });

    expect(transport.calls.map((call) => call.method)).toEqual(["initialize", "initialized", "account/login/start"]);
    expect(transport.calls.find((call) => call.method === "account/login/start")?.params).toEqual({ type: "chatgpt" });
  });

  it("logs out through Codex App Server and clears the chat thread", async () => {
    const transport = new FakeTransport();
    const client = new CodexChatClient(transport, { cwd: "/tmp/app" });

    await client.sendMessage("Hi");
    await client.logout();
    await client.sendMessage("Hi again");

    expect(transport.calls.map((call) => call.method)).toEqual([
      "initialize",
      "initialized",
      "thread/start",
      "turn/start",
      "account/logout",
      "thread/start",
      "turn/start"
    ]);
  });
});
