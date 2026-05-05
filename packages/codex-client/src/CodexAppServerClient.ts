import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { CodexChatClient, type CodexAccountStatus, type CodexChatResponse, type CodexLoginResponse } from "./CodexChatClient.js";
import { StdioJsonRpcTransport, type JsonRpcNotification } from "./JsonRpcTransport.js";

export interface CodexAppServerClientOptions {
  command?: string;
  args?: string[];
  cwd?: string;
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private transport: StdioJsonRpcTransport | null = null;
  private chatClient: CodexChatClient | null = null;

  start(options: CodexAppServerClientOptions = {}): void {
    if (this.child) {
      return;
    }
    this.child = spawn(options.command ?? "codex", options.args ?? ["app-server", "--listen", "stdio://"], {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.transport = new StdioJsonRpcTransport({
      stdin: this.child.stdin,
      stdout: this.child.stdout
    });
    this.transport.onServerRequest(async (request) => {
      if (request.method.includes("requestApproval") || request.method.includes("Approval")) {
        return { decision: "denied" };
      }
      return { error: "unsupported_server_request" };
    });
    this.chatClient = new CodexChatClient(this.transport, { cwd: options.cwd ?? process.cwd() });
  }

  onEvent(handler: (notification: JsonRpcNotification) => void): () => void {
    if (!this.transport) {
      throw new Error("Codex app-server has not been started.");
    }
    return this.transport.onNotification(handler);
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (!this.transport) {
      throw new Error("Codex app-server has not been started.");
    }
    return this.transport.request(method, params);
  }

  readAccount(): Promise<CodexAccountStatus> {
    if (!this.chatClient) {
      throw new Error("Codex app-server has not been started.");
    }
    return this.chatClient.readAccount();
  }

  startChatGptLogin(): Promise<CodexLoginResponse> {
    if (!this.chatClient) {
      throw new Error("Codex app-server has not been started.");
    }
    return this.chatClient.startChatGptLogin();
  }

  logout(): Promise<void> {
    if (!this.chatClient) {
      throw new Error("Codex app-server has not been started.");
    }
    return this.chatClient.logout();
  }

  sendChatMessage(text: string): Promise<CodexChatResponse> {
    if (!this.chatClient) {
      throw new Error("Codex app-server has not been started.");
    }
    return this.chatClient.sendMessage(text);
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.transport = null;
    this.chatClient = null;
  }
}
