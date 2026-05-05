import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Angry,
  Bot,
  Braces,
  CheckCircle2,
  Frown,
  Laugh,
  Library,
  LogIn,
  LogOut,
  Maximize2,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Save,
  Send,
  Settings2,
  Smile,
  Terminal,
  Trash2,
  Upload
} from "lucide-react";
import type { CharacterDirectiveV2, CharacterEmotion, CharacterState } from "@cubism/shared-types";
import type { Live2DCapabilities, ModelManifest } from "@cubism/live2d-domain";
import { CharacterStateMachine } from "@cubism/character-runtime";
import { LipSyncEnvelope } from "@cubism/media-core";
import { buildCharacterDirectiveV2 } from "@cubism/conversation-core";
import { Live2DStage } from "./live2d/Live2DStage.js";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: CharacterEmotion;
}

interface Live2DModelRecord {
  id: string;
  entryPath: string;
  baseDir: string;
  displayName?: string | null;
  manifestJson: string;
  validationReportJson: string;
}

interface ValidationReport {
  ok: boolean;
  missing?: Array<{ kind: string; file: string; message: string }>;
  unsupported?: Array<{ kind: string; file: string; message: string }>;
  warnings?: Array<{ kind: string; file: string; message: string }>;
}

type MotionMappingDraft = { semantic: string; groupName: string; motionIndex?: number | null; priority: "idle" | "normal" | "force" };
type ExpressionMappingDraft = { emotion: string; expressionName: string };

const emotionExpression: Record<CharacterEmotion, string> = {
  neutral: "Neutral",
  joy: "Joy",
  anger: "Anger",
  sorrow: "Sorrow",
  fun: "Fun",
  surprised: "Surprised",
  thinking: "Thinking"
};

const expressionEmotions: CharacterEmotion[] = ["neutral", "joy", "fun", "anger", "sorrow", "surprised", "thinking"];
const motionSemantics = ["idle", "greet", "tapBody", "thinking", "speaking", "happy", "sad", "angry", "success", "error", "interrupted"];

export function App() {
  const [codexAccount, setCodexAccount] = useState<string>("Not connected");
  const [codexReady, setCodexReady] = useState(false);
  const [codexLoginPending, setCodexLoginPending] = useState(false);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [localApiPort, setLocalApiPort] = useState<number | null>(null);
  const [state, setState] = useState<CharacterState>("idle");
  const [emotion, setEmotion] = useState<CharacterEmotion>("neutral");
  const [lipSync, setLipSync] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [modelStatus, setModelStatus] = useState("No model selected");
  const [codexEvents, setCodexEvents] = useState<string[]>([]);
  const [codexPrompt, setCodexPrompt] = useState("Validate this Live2D model asset configuration.");
  const [models, setModels] = useState<Live2DModelRecord[]>([]);
  const [activeModel, setActiveModel] = useState<Live2DModelRecord | null>(null);
  const [activeManifest, setActiveManifest] = useState<ModelManifest | null>(null);
  const [activeCapabilities, setActiveCapabilities] = useState<Live2DCapabilities | null>(null);
  const [activeValidation, setActiveValidation] = useState<ValidationReport | null>(null);
  const [motionMappings, setMotionMappings] = useState<MotionMappingDraft[]>([]);
  const [expressionMappings, setExpressionMappings] = useState<ExpressionMappingDraft[]>([]);
  const [scale, setScale] = useState(0.9);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [compactMode, setCompactMode] = useState(false);
  const stateMachine = useMemo(() => new CharacterStateMachine(), []);

  useEffect(() => {
    void refreshCodexAccount();
    void refreshModels();
    void window.cubism.getLocalApiPort().then(setLocalApiPort);
    return window.cubism.onCodexEvent((event) => {
      setCodexEvents((items) => [JSON.stringify(event), ...items].slice(0, 20));
      if (isCodexAccountEvent(event)) {
        setCodexLoginPending(false);
        void refreshCodexAccount();
      }
    });
  }, []);

  useEffect(() => {
    const envelope = new LipSyncEnvelope({ gain: 1.15, attack: 0.7, release: 0.18, silenceThreshold: 0.03 });
    const timer = window.setInterval(() => {
      const syntheticLevel = voiceActive || state === "speaking" ? (Math.sin(Date.now() / 85) + 1) / 2 : 0;
      setLipSync(envelope.next({ rms: syntheticLevel, peak: syntheticLevel }));
    }, 60);
    return () => window.clearInterval(timer);
  }, [state, voiceActive]);

  async function refreshModels() {
    const result = await window.cubism.listLive2DModels();
    if (result.ok && Array.isArray(result.models)) {
      const records = result.models as Live2DModelRecord[];
      setModels(records);
      if (!activeModel && records[0]) {
        activateModel(records[0]);
      }
    }
  }

  async function selectModel() {
    const path = await window.cubism.selectModel3Json();
    if (!path) return;
    const result = await window.cubism.importLive2DModel(path);
    if (!result.ok) {
      setModelStatus(result.error ?? "Model import failed");
      setState("error");
      return;
    }
    const model = result.model as Live2DModelRecord;
    setActiveModel(model);
    setActiveManifest(result.manifest as ModelManifest);
    setActiveCapabilities(result.capabilities as Live2DCapabilities);
    setActiveValidation(result.validation as ValidationReport);
    setModelPath(model.entryPath);
    buildMappingDrafts(result.manifest as ModelManifest);
    setModelStatus("Model imported");
    setState("idle");
    void refreshModels();
  }

  function activateModel(model: Live2DModelRecord) {
    setActiveModel(model);
    setModelPath(model.entryPath);
    setActiveManifest(safeJson<ModelManifest>(model.manifestJson));
    setActiveValidation(safeJson<ValidationReport>(model.validationReportJson));
    const manifest = safeJson<ModelManifest>(model.manifestJson);
    setActiveCapabilities(manifest ? capabilityFromManifest(manifest) : null);
    if (manifest) buildMappingDrafts(manifest);
    setModelStatus("Model selected");
  }

  function buildMappingDrafts(manifest: ModelManifest) {
    const fallbackMotion = manifest.motions[0];
    setMotionMappings(
      motionSemantics.map((semantic) => {
        const match = manifest.motions.find((motion) => motion.group.toLowerCase().includes(semantic.toLowerCase())) ?? fallbackMotion;
        return { semantic, groupName: match?.group ?? "", motionIndex: match?.index ?? 0, priority: semantic === "idle" ? "idle" : semantic === "interrupted" ? "force" : "normal" };
      })
    );
    const fallbackExpression = manifest.expressions[0];
    setExpressionMappings(
      expressionEmotions.map((emotionName) => {
        const match = manifest.expressions.find((expression) => expression.name.toLowerCase().includes(emotionName)) ?? fallbackExpression;
        return { emotion: emotionName, expressionName: match?.name ?? "" };
      })
    );
  }

  async function saveMappings() {
    if (!activeModel) return;
    await window.cubism.saveLive2DMotionMappings(activeModel.id, motionMappings.filter((mapping) => mapping.groupName));
    await window.cubism.saveLive2DExpressionMappings(activeModel.id, expressionMappings.filter((mapping) => mapping.expressionName));
    setModelStatus("Mappings saved");
  }

  async function deleteActiveModel() {
    if (!activeModel) return;
    await window.cubism.deleteLive2DModel(activeModel.id);
    setActiveModel(null);
    setModelPath(null);
    setActiveManifest(null);
    setActiveCapabilities(null);
    setActiveValidation(null);
    setModelStatus("Model deleted");
    await refreshModels();
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setInput("");
    runDirectiveCommands(stateMachine.dispatch({ type: "user.message.started" }));

    let text = `Codex App Server is not connected yet. Start ChatGPT via Codex and retry: ${trimmed}`;
    let directive = buildCharacterDirectiveV2(text);

    if (codexReady) {
      const response = await window.cubism.sendCodexChatMessage(trimmed);
      if (response.ok && response.text) {
        directive = buildCharacterDirectiveV2(response.text);
      } else {
        text = `Codex App Server chat failed: ${response.error ?? "unknown error"}`;
        directive = { text, emotion: "sorrow", intensity: 1, speakingStyle: "normal", expression: { semantic: "sorrow" }, motion: { semantic: "error", priority: "force" } };
      }
    }

    applyDirective(directive);
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: directive.text, emotion: directive.emotion }]);
    window.setTimeout(() => setState("idle"), directive.timing?.estimatedSpeechMs ?? 1800);
  }

  function applyDirective(directive: CharacterDirectiveV2) {
    runDirectiveCommands(stateMachine.dispatch({ type: "assistant.completed", directive }));
  }

  function runDirectiveCommands(commands: ReturnType<CharacterStateMachine["dispatch"]>) {
    for (const command of commands) {
      if (command.type === "expression.set" && isCharacterEmotion(command.semantic)) {
        setEmotion(command.semantic);
      }
      if (command.type === "motion.play") {
        const semantic = command.request.semantic;
        setState(semantic === "thinking" ? "thinking" : semantic === "interrupted" ? "interrupted" : semantic === "error" ? "error" : "speaking");
      }
      if (command.type === "lipSync.set") {
        setLipSync(command.value);
      }
    }
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

  async function toggleCompanionMode() {
    const next = !compactMode;
    setCompactMode(next);
    await window.cubism.setCompanionWindowMode(next);
  }

  const motionGroups = activeManifest ? [...new Set(activeManifest.motions.map((motion) => motion.group))] : [];
  const expressionNames = activeManifest?.expressions.map((expression) => expression.name) ?? [];

  return (
    <main className={`appShell ${compactMode ? "compact" : ""}`}>
      <section className="stagePane">
        <div className="stageToolbar">
          <button type="button" onClick={selectModel} title="Select and import model3.json">
            <Upload size={18} />
            Model
          </button>
          <button type="button" onClick={toggleCompanionMode} title="Toggle desktop companion window">
            <Maximize2 size={18} />
            Companion
          </button>
          {expressionEmotions.slice(1, 5).map((item) => (
            <button key={item} type="button" onClick={() => setEmotion(item)} title={`${emotionExpression[item]} expression`}>
              {item === "anger" ? <Angry size={18} /> : item === "sorrow" ? <Frown size={18} /> : item === "fun" ? <Laugh size={18} /> : <Smile size={18} />}
              {emotionExpression[item]}
            </button>
          ))}
          <button type="button" onClick={() => setState("thinking")} title="Thinking motion">
            <Braces size={18} />
            Thinking
          </button>
          <button type="button" onClick={() => setVoiceActive((value) => !value)} title="Voice mode">
            {voiceActive ? <Pause size={18} /> : <Mic size={18} />}
            Voice
          </button>
        </div>
        <Live2DStage
          modelPath={modelPath}
          modelId={activeModel?.id}
          modelRuntimeUrl={activeModel && localApiPort ? live2DAssetUrl(localApiPort, activeModel.id, activeModel.entryPath) : null}
          manifest={activeManifest}
          state={state}
          emotion={emotion}
          lipSync={lipSync}
          scale={scale}
          offsetX={offsetX}
          offsetY={offsetY}
          onScaleChange={setScale}
          onOffsetChange={({ x, y }) => {
            setOffsetX(x);
            setOffsetY(y);
          }}
          onLoadStatus={setModelStatus}
        />
        <div className="modelStrip">
          <Bot size={18} />
          <span>{modelPath ? `${modelStatus}: ${modelPath}` : modelStatus}</span>
          <strong>{emotionExpression[emotion]}</strong>
        </div>
      </section>

      {!compactMode ? (
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

          <section className="panel modelPanel">
            <div className="panelHeader">
              <h2>Models</h2>
              <button type="button" onClick={deleteActiveModel} disabled={!activeModel} title="Delete selected model">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="modelList">
              {models.map((model) => (
                <button key={model.id} type="button" className={model.id === activeModel?.id ? "selectedRow" : ""} onClick={() => activateModel(model)} title={model.entryPath}>
                  <Library size={16} />
                  {model.displayName ?? model.id}
                </button>
              ))}
            </div>
            <Diagnostics manifest={activeManifest} capabilities={activeCapabilities} validation={activeValidation} />
          </section>

          <section className="panel mappingPanel">
            <div className="panelHeader">
              <h2>Mappings</h2>
              <button type="button" onClick={saveMappings} disabled={!activeModel} title="Save mappings">
                <Save size={16} />
                Save
              </button>
            </div>
            <div className="mappingGrid">
              {expressionMappings.map((mapping, index) => (
                <label key={mapping.emotion}>
                  <span>{mapping.emotion}</span>
                  <select
                    value={mapping.expressionName}
                    onChange={(event) => setExpressionMappings((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, expressionName: event.target.value } : item)))}
                  >
                    <option value="">None</option>
                    {expressionNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setEmotion(mapping.emotion as CharacterEmotion)} title="Test expression">
                    <Play size={14} />
                  </button>
                </label>
              ))}
              {motionMappings.map((mapping, index) => (
                <label key={mapping.semantic}>
                  <span>{mapping.semantic}</span>
                  <select value={mapping.groupName} onChange={(event) => setMotionMappings((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, groupName: event.target.value } : item)))}>
                    <option value="">None</option>
                    {motionGroups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setState(mapping.semantic === "thinking" ? "thinking" : "speaking")} title="Test motion">
                    <Play size={14} />
                  </button>
                </label>
              ))}
            </div>
          </section>

          <section className="panel runtimePanel">
            <div className="panelHeader">
              <h2>Runtime</h2>
              <Settings2 size={18} />
            </div>
            <label>
              <span>Scale</span>
              <input type="range" min="0.4" max="9.9" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
            </label>
            <label>
              <span>Offset X</span>
              <input type="range" min="-12000" max="12000" step="4" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
            </label>
            <label>
              <span>Offset Y</span>
              <input type="range" min="-12000" max="12000" step="4" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
            </label>
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
      ) : null}
    </main>
  );
}

function Diagnostics({ manifest, capabilities, validation }: { manifest: ModelManifest | null; capabilities: Live2DCapabilities | null; validation: ValidationReport | null }) {
  if (!manifest) {
    return <div className="diagnostics">No imported model.</div>;
  }
  const issues = [...(validation?.unsupported ?? []), ...(validation?.missing ?? []), ...(validation?.warnings ?? [])].slice(0, 8);
  return (
    <div className="diagnostics">
      <div className="diagGrid">
        <span>Moc</span>
        <strong>{manifest.moc.file}</strong>
        <span>Textures</span>
        <strong>{manifest.textures.length}</strong>
        <span>Motions</span>
        <strong>{manifest.motions.length}</strong>
        <span>Expressions</span>
        <strong>{manifest.expressions.length}</strong>
        <span>LipSync</span>
        <strong>{capabilities?.lipSyncParameters.join(", ") || "fallback"}</strong>
        <span>EyeBlink</span>
        <strong>{capabilities?.eyeBlinkParameters.join(", ") || "fallback"}</strong>
      </div>
      {issues.length ? (
        <div className="issueList">
          {issues.map((issue) => (
            <code key={`${issue.kind}-${issue.file}`}>
              {issue.kind}: {issue.file}
            </code>
          ))}
        </div>
      ) : (
        <small>Validation passed</small>
      )}
    </div>
  );
}

function safeJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function capabilityFromManifest(manifest: ModelManifest): Live2DCapabilities {
  return {
    hasPhysics: Boolean(manifest.physics),
    hasPose: Boolean(manifest.pose),
    hasUserData: Boolean(manifest.userData),
    hasExpressions: manifest.expressions.length > 0,
    hasMotions: manifest.motions.length > 0,
    motionGroups: [...new Set(manifest.motions.map((motion) => motion.group))],
    expressionNames: manifest.expressions.map((expression) => expression.name),
    lipSyncParameters: manifest.groups.filter((group) => group.name.toLowerCase() === "lipsync").flatMap((group) => group.ids),
    eyeBlinkParameters: manifest.groups.filter((group) => group.name.toLowerCase() === "eyeblink").flatMap((group) => group.ids),
    hitAreas: manifest.hitAreas
  };
}

function isCharacterEmotion(value: string): value is CharacterEmotion {
  return ["neutral", "joy", "anger", "sorrow", "fun", "surprised", "thinking"].includes(value);
}

function isCodexAccountEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") {
    return false;
  }
  const method = (event as { method?: unknown }).method;
  return method === "account/login/completed" || method === "account/updated";
}

function live2DAssetUrl(port: number, modelId: string, entryPath: string): string {
  const fileName = entryPath.split(/[\\/]/).pop() ?? "model.model3.json";
  return `http://127.0.0.1:${port}/live2d-assets/${encodeURIComponent(modelId)}/${encodeURIComponent(fileName)}`;
}
