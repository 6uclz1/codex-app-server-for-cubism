import { FormEvent, useEffect, useState } from "react";
import { Angry, Bot, Braces, CheckCircle2, Frown, Laugh, LogIn, LogOut, MessageCircle, Mic, Pause, Send, Smile, Terminal, Upload } from "lucide-react";
import type { CharacterEmotion, CharacterState } from "@cubism/shared-types";
import { buildCharacterDirective } from "@cubism/conversation-core";
import { Live2DStage } from "./live2d/Live2DStage.js";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: CharacterEmotion;
}

const emotionExpression: Record<CharacterEmotion, string> = {
  neutral: "Neutral",
  joy: "Joy",
  anger: "Anger",
  sorrow: "Sorrow",
  fun: "Fun",
  surprised: "Surprised",
  thinking: "Thinking"
};

export function App() {
  const [codexAccount, setCodexAccount] = useState<string>("Not connected");
  const [codexReady, setCodexReady] = useState(false);
  const [codexLoginPending, setCodexLoginPending] = useState(false);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [state, setState] = useState<CharacterState>("idle");
  const [emotion, setEmotion] = useState<CharacterEmotion>("neutral");
  const [lipSync, setLipSync] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [modelStatus, setModelStatus] = useState("No model selected");
  const [codexEvents, setCodexEvents] = useState<string[]>([]);
  const [codexPrompt, setCodexPrompt] = useState("Validate this Live2D model asset configuration.");

  useEffect(() => {
    void refreshCodexAccount();
    return window.cubism.onCodexEvent((event) => {
      setCodexEvents((items) => [JSON.stringify(event), ...items].slice(0, 20));
      if (isCodexAccountEvent(event)) {
        setCodexLoginPending(false);
        void refreshCodexAccount();
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (voiceActive || state === "speaking") {
        setLipSync((Math.sin(Date.now() / 90) + 1) / 2);
      } else {
        setLipSync(0);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [state, voiceActive]);

  async function selectModel() {
    const path = await window.cubism.selectModel3Json();
    if (path) {
      setModelPath(path);
      setState("idle");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((items) => [...items, userMessage]);
    setInput("");
    setState("thinking");

    let text = `Codex App Server is not connected yet. Start ChatGPT via Codex and retry: ${trimmed}`;
    let directive = buildCharacterDirective(text);

    if (codexReady) {
      const response = await window.cubism.sendCodexChatMessage(trimmed);
      if (response.ok && response.text) {
        directive = buildCharacterDirective(response.text);
      } else {
        text = `Codex App Server chat failed: ${response.error ?? "unknown error"}`;
        directive = { text, emotion: "sorrow", speakingStyle: "normal", expression: "sorrow" };
      }
    }

    setEmotion(directive.emotion);
    setState("speaking");
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: directive.text, emotion: directive.emotion }]);
    window.setTimeout(() => setState("idle"), 1600);
  }

  async function refreshCodexAccount() {
    const result = await window.cubism.getCodexAccount();
    if (result.ok) {
      const label = result.account?.type === "chatgpt" ? `${result.account.email ?? "ChatGPT"} (${result.account.planType ?? "account"})` : (result.account?.type ?? "No account");
      setCodexAccount(label);
      setCodexReady(result.account?.type === "chatgpt");
      return;
    }
    setCodexAccount(result.error ?? "Codex unavailable");
    setCodexReady(false);
  }

  async function startCodex() {
    const result = await window.cubism.startCodex();
    setCodexEvents((items) => [result.ok ? "Codex app-server started" : `Codex start failed: ${result.error}`, ...items]);
    await refreshCodexAccount();
  }

  async function loginCodex() {
    setCodexLoginPending(true);
    const result = await window.cubism.loginCodex();
    if (result.ok) {
      setCodexAccount("Waiting for browser sign-in");
      setCodexEvents((items) => [`Codex browser login started: ${result.loginId}`, ...items]);
      return;
    }
    setCodexLoginPending(false);
    setCodexEvents((items) => [`Codex login failed: ${result.error}`, ...items]);
    await refreshCodexAccount();
  }

  async function logoutCodex() {
    const result = await window.cubism.logoutCodex();
    setCodexEvents((items) => [result.ok ? "Codex logged out" : `Codex logout failed: ${result.error}`, ...items]);
    setCodexLoginPending(false);
    await refreshCodexAccount();
  }

  async function submitCodexTask() {
    const result = await window.cubism.submitCodexTask(codexPrompt);
    setCodexEvents((items) => [result.ok ? "Task submitted" : `Task failed: ${result.error}`, ...items]);
  }

  return (
    <main className="appShell">
      <section className="stagePane">
        <div className="stageToolbar">
          <button type="button" onClick={selectModel} title="Select model3.json">
            <Upload size={18} />
            Model
          </button>
          <button type="button" onClick={() => setEmotion("joy")} title="Joy expression">
            <Smile size={18} />
            Joy
          </button>
          <button type="button" onClick={() => setEmotion("anger")} title="Anger expression">
            <Angry size={18} />
            Anger
          </button>
          <button type="button" onClick={() => setEmotion("sorrow")} title="Sorrow expression">
            <Frown size={18} />
            Sorrow
          </button>
          <button type="button" onClick={() => setEmotion("fun")} title="Fun expression">
            <Laugh size={18} />
            Fun
          </button>
          <button type="button" onClick={() => setState("thinking")} title="Thinking motion">
            <Braces size={18} />
            Thinking
          </button>
          <button type="button" onClick={() => setVoiceActive((value) => !value)} title="Voice mode">
            {voiceActive ? <Pause size={18} /> : <Mic size={18} />}
            Voice
          </button>
        </div>
        <Live2DStage modelPath={modelPath} state={state} emotion={emotion} lipSync={lipSync} onLoadStatus={setModelStatus} />
        <div className="modelStrip">
          <Bot size={18} />
          <span>{modelPath ? `${modelStatus}: ${modelPath}` : modelStatus}</span>
          <strong>{emotionExpression[emotion]}</strong>
        </div>
      </section>

      <aside className="sidePane">
        <div className="codexStatusRow">
          {codexReady ? <CheckCircle2 size={18} /> : <MessageCircle size={18} />}
          <span>{codexAccount}</span>
          {codexReady ? (
            <button type="button" onClick={logoutCodex} title="Sign out of Codex">
              <LogOut size={16} />
              Sign out
            </button>
          ) : (
            <button type="button" onClick={loginCodex} title="Sign in with ChatGPT" disabled={codexLoginPending}>
              <LogIn size={16} />
              {codexLoginPending ? "Waiting" : "Sign in"}
            </button>
          )}
        </div>

        <section className="panel chatPanel">
          <div className="panelHeader">
            <h1>Conversation</h1>
            <span>{codexReady ? "ChatGPT via Codex" : state}</span>
          </div>
          <div className="messages">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <p>{message.content}</p>
                {message.emotion ? <small>{message.emotion}</small> : null}
              </article>
            ))}
          </div>
          <form className="composer" onSubmit={sendMessage}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Message" />
            <button type="submit" title="Send">
              <Send size={18} />
            </button>
          </form>
        </section>

        <section className="panel codexPanel">
          <div className="panelHeader">
            <h2>Developer</h2>
            <button type="button" onClick={startCodex} title="Start Codex app-server">
              <Terminal size={18} />
              Start
            </button>
          </div>
          <textarea value={codexPrompt} onChange={(event) => setCodexPrompt(event.target.value)} />
          <button type="button" onClick={submitCodexTask}>
            Submit Task
          </button>
          <div className="eventLog">
            {codexEvents.map((event, index) => (
              <code key={`${event}-${index}`}>{event}</code>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

function isCodexAccountEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") {
    return false;
  }
  const method = (event as { method?: unknown }).method;
  return method === "account/login/completed" || method === "account/updated";
}
