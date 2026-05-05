import type { JsonRpcNotification } from "./JsonRpcTransport.js";

export interface CodexProtocolTransport {
  request(method: string, params?: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  onNotification(handler: (notification: JsonRpcNotification) => void): () => void;
}

export interface CodexChatClientOptions {
  cwd: string;
  model?: string | null;
}

export interface CodexAccountStatus {
  account: null | { type: string; email?: string; planType?: string };
  requiresOpenaiAuth: boolean;
}

export type CodexLoginResponse =
  | { type: "apiKey" }
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | { type: "chatgptDeviceCode"; loginId: string; verificationUrl: string; userCode: string }
  | { type: "chatgptAuthTokens" };

export interface CodexChatResponse {
  threadId: string;
  turnId: string;
  text: string;
}

interface ThreadStartResponse {
  thread: { id: string };
}

interface TurnStartResponse {
  turn: { id: string };
}

export class CodexChatClient {
  private initialized = false;
  private threadId: string | null = null;

  constructor(
    private readonly transport: CodexProtocolTransport,
    private readonly options: CodexChatClientOptions
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.transport.request("initialize", {
      clientInfo: {
        name: "cubism-character-desktop",
        title: "Cubism Character Desktop",
        version: "0.1.0"
      },
      capabilities: { experimentalApi: true }
    });
    this.transport.notify("initialized");
    this.initialized = true;
  }

  async readAccount(): Promise<CodexAccountStatus> {
    await this.initialize();
    return (await this.transport.request("account/read", { refreshToken: false })) as CodexAccountStatus;
  }

  async startChatGptLogin(): Promise<CodexLoginResponse> {
    await this.initialize();
    return (await this.transport.request("account/login/start", { type: "chatgpt" })) as CodexLoginResponse;
  }

  async logout(): Promise<void> {
    await this.initialize();
    await this.transport.request("account/logout");
    this.threadId = null;
  }

  async sendMessage(text: string): Promise<CodexChatResponse> {
    await this.initialize();
    const threadId = await this.ensureThread();
    const turnStart = (await this.transport.request("turn/start", {
      threadId,
      input: [{ type: "text", text, text_elements: [] }],
      environments: [],
      approvalPolicy: "never",
      approvalsReviewer: "user",
      model: this.options.model ?? null
    })) as TurnStartResponse;
    const turnId = turnStart.turn.id;
    const output = await this.collectFinalAnswer(threadId, turnId);
    return { threadId, turnId, text: output };
  }

  private async ensureThread(): Promise<string> {
    if (this.threadId) {
      return this.threadId;
    }
    const response = (await this.transport.request("thread/start", {
      approvalPolicy: "never",
      approvalsReviewer: "user",
      baseInstructions: [
        "You are a concise Live2D desktop character chat runtime.",
        "Do not edit files, run shell commands, or perform development tasks in this conversation mode.",
        "Do not inspect local files, local directories, terminal output, developer environment state, or workspace content.",
        "Answer the user's message directly as character dialogue.",
        "Prefix every answer with exactly one emotion marker chosen from [emotion: joy|anger|sorrow|fun|neutral], then continue with the answer text."
      ].join("\n"),
      ephemeral: true,
      environments: [],
      experimentalRawEvents: false,
      persistExtendedHistory: false
    })) as ThreadStartResponse;
    this.threadId = response.thread.id;
    return this.threadId;
  }

  private collectFinalAnswer(threadId: string, turnId: string): Promise<string> {
    let text = "";
    return new Promise((resolve, reject) => {
      const unsubscribe = this.transport.onNotification((notification) => {
        const params = notification.params as Record<string, unknown> | undefined;
        if (!params || params.threadId !== threadId) {
          return;
        }

        if (notification.method === "item/agentMessage/delta" && params.turnId === turnId) {
          text += String(params.delta ?? "");
          return;
        }

        if (notification.method === "error" && params.turnId === turnId) {
          unsubscribe();
          reject(new Error(String((params.error as { message?: string } | undefined)?.message ?? "Codex turn failed.")));
          return;
        }

        if (notification.method === "turn/completed") {
          const turn = params.turn as { id?: string; status?: string; error?: unknown } | undefined;
          if (turn?.id !== turnId) {
            return;
          }
          unsubscribe();
          if (turn.status === "failed") {
            reject(new Error(`Codex turn failed: ${JSON.stringify(turn.error)}`));
          } else {
            resolve(text.trim());
          }
        }
      });
    });
  }
}
