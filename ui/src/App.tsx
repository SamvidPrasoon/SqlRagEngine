import { useState, useEffect, useRef } from "react";
import {
  Send,
  Database,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Clock,
  Layers,
  Table,
  Activity,
  X,
} from "lucide-react";

type AppMode = "business" | "dev";
type RiskLevel = "safe" | "moderate" | "dangerous" | "blocked";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  riskLevel?: RiskLevel;
  hitlRequired?: boolean;
  hitlId?: string;
  retryCount?: number;
  timestamp: number;
}

interface HITLRequest {
  id: string;
  sessionId: string;
  sql: string;
  riskLevel: string;
  userMessage: string;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
}

interface SchemaTable {
  tableName: string;
  columns: { name: string; type: string; pk: number }[];
  sampleRows: Record<string, unknown>[];
}

const API = "http://localhost:3001";
const SESSION_ID = `session-${Date.now()}`;

function RiskBadge({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, string> = {
    safe: "bg-emerald-50 text-emerald-700 border-emerald-200",
    moderate: "bg-amber-50 text-amber-700 border-amber-200",
    dangerous: "bg-red-50 text-red-700 border-red-200",
    blocked: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${styles[level]}`}
    >
      {level}
    </span>
  );
}

function SQLBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          SQL
        </span>
        <button
          onClick={copy}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-xs font-mono text-gray-700 bg-white overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {sql}
      </pre>
    </div>
  );
}

function ChatPanel({
  mode,
  onHITL,
  messages,
  setMessages,
}: {
  mode: AppMode;
  onHITL: (req: HITLRequest) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: SESSION_ID, mode }),
      });
      const data = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        sql: data.sql,
        riskLevel: data.riskLevel,
        hitlRequired: data.hitlRequired,
        hitlId: data.hitlId,
        retryCount: data.retryCount,
        timestamp: Date.now(),
      };

      setMessages((m) => [...m, assistantMsg]);

      if (data.hitlRequired && data.hitlId) {
        onHITL({
          id: data.hitlId,
          sessionId: SESSION_ID,
          sql: data.sql ?? "",
          riskLevel: data.riskLevel,
          userMessage: text,
          createdAt: Date.now(),
          status: "pending",
        });
      }
    } catch {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "⚠️ Could not reach the API. Is the server running?",
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Database size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                Ask anything about your data
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Connected to SQLMind API
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                "Top 5 customers by value",
                "Revenue this year",
                "Low stock products",
                "Orders this month",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold mt-0.5
              ${msg.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}
            >
              {msg.role === "user" ? "U" : "AI"}
            </div>
            <div
              className={`max-w-[80%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                ${
                  msg.role === "user"
                    ? "bg-gray-900 text-white rounded-tr-sm"
                    : "bg-gray-50 border border-gray-200 text-gray-800 rounded-tl-sm"
                }`}
              >
                {msg.content}
              </div>
              {msg.sql && <SQLBlock sql={msg.sql} />}
              <div className="flex items-center gap-2 px-1">
                {msg.riskLevel && <RiskBadge level={msg.riskLevel} />}
                {msg.hitlRequired && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <Clock size={10} /> Awaiting approval
                  </span>
                )}
                {(msg.retryCount ?? 0) > 0 && (
                  <span className="text-xs text-gray-400">
                    {msg.retryCount} retry
                  </span>
                )}
                <span className="text-xs text-gray-300">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
              AI
            </div>
            <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-gray-50 border border-gray-200">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-100 p-3">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask a question about your data..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm
              focus:outline-none focus:border-gray-400 transition-colors placeholder:text-gray-300
              text-gray-800 leading-relaxed"
            style={{ minHeight: "42px", maxHeight: "120px" }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center
              hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function HITLPanel({
  requests,
  onDecision,
}: {
  requests: HITLRequest[];
  onDecision: (id: string, approved: boolean) => void;
}) {
  const pending = requests.filter((r) => r.status === "pending");
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-800">Approvals</span>
        </div>
        {pending.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-medium">
            {pending.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {requests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <CheckCircle size={24} className="text-gray-200" />
            <p className="text-xs text-gray-400">No pending approvals</p>
          </div>
        )}
        {requests.map((req) => (
          <div
            key={req.id}
            className={`rounded-xl border p-3 space-y-2.5 transition-all
            ${
              req.status === "pending"
                ? "border-amber-200 bg-amber-50/50"
                : req.status === "approved"
                  ? "border-emerald-200 bg-emerald-50/30 opacity-60"
                  : "border-gray-200 bg-gray-50/50 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-gray-600 leading-relaxed flex-1">
                {req.userMessage}
              </p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0
                ${
                  req.status === "pending"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : req.status === "approved"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                }`}
              >
                {req.status}
              </span>
            </div>
            <pre className="text-xs font-mono bg-white border border-gray-200 rounded-lg px-2.5 py-2 overflow-x-auto whitespace-pre-wrap text-gray-700 leading-relaxed">
              {req.sql}
            </pre>
            <div className="flex items-center gap-1.5">
              <RiskBadge level={req.riskLevel as RiskLevel} />
              <span className="text-xs text-gray-400">
                {new Date(req.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {req.status === "pending" && (
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={() => onDecision(req.id, true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                    bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                >
                  <CheckCircle size={12} /> Approve
                </button>
                <button
                  onClick={() => onDecision(req.id, false)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                    bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium
                    border border-gray-200 transition-colors"
                >
                  <XCircle size={12} /> Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SchemaBrowser() {
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/schema`)
      .then((r) => r.json())
      .then((d) => {
        setSchema(d.schema ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Layers size={14} className="text-gray-400" />
        <span className="text-sm font-semibold text-gray-800">Schema</span>
        <span className="text-xs text-gray-400 ml-auto">
          {schema.length} tables
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {schema.map((table) => (
          <div key={table.tableName} className="mb-1">
            <button
              onClick={() => toggle(table.tableName)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              {expanded.has(table.tableName) ? (
                <ChevronDown
                  size={13}
                  className="text-gray-400 flex-shrink-0"
                />
              ) : (
                <ChevronRight
                  size={13}
                  className="text-gray-400 flex-shrink-0"
                />
              )}
              <Table size={13} className="text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                {table.tableName}
              </span>
              <span className="text-xs text-gray-300 ml-auto">
                {table.columns.length} cols
              </span>
            </button>
            {expanded.has(table.tableName) && (
              <div className="ml-7 mb-1 rounded-lg border border-gray-100 overflow-hidden">
                {table.columns.map((col, i) => (
                  <div
                    key={col.name}
                    className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                  >
                    {col.pk === 1 && (
                      <span className="text-amber-500 text-xs font-bold flex-shrink-0">
                        PK
                      </span>
                    )}
                    <span className="font-medium text-gray-700 flex-1">
                      {col.name}
                    </span>
                    <span className="text-gray-300 font-mono">{col.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SQLPreviewPanel({ messages }: { messages: Message[] }) {
  const sqlMessages = messages.filter((m) => m.sql);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected
    ? sqlMessages.find((m) => m.id === selected)
    : sqlMessages[sqlMessages.length - 1];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Activity size={14} className="text-gray-400" />
        <span className="text-sm font-semibold text-gray-800">SQL History</span>
        <span className="text-xs text-gray-400 ml-auto">
          {sqlMessages.length} queries
        </span>
      </div>
      {sqlMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <Activity size={24} className="text-gray-200" />
          <p className="text-xs text-gray-400">No queries yet</p>
        </div>
      ) : (
        <div className="flex flex-col h-full overflow-hidden">
          <div
            className="border-b border-gray-100 overflow-y-auto"
            style={{ maxHeight: "160px" }}
          >
            {sqlMessages.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={`w-full text-left px-3 py-2 text-xs border-b border-gray-50 hover:bg-gray-50 transition-colors
                  ${current?.id === m.id ? "bg-gray-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {m.riskLevel && <RiskBadge level={m.riskLevel} />}
                  <span className="text-gray-400 flex-shrink-0">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="font-mono text-gray-600 truncate mt-0.5">
                  {m.sql?.slice(0, 55)}...
                </p>
              </button>
            ))}
          </div>
          {current?.sql && (
            <div className="flex-1 overflow-auto p-3">
              <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap leading-relaxed">
                {current.sql}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<AppMode>("business");
  const [hitlRequests, setHITL] = useState<HITLRequest[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRight, setActiveRight] = useState<"hitl" | "schema" | "sql">(
    "schema",
  );
  const [notification, setNotify] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const pendingCount = hitlRequests.filter(
    (r) => r.status === "pending",
  ).length;

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
  }, []);

  const notify = (msg: string) => {
    setNotify(msg);
    setTimeout(() => setNotify(null), 3000);
  };

  const handleHITL = (req: HITLRequest) => {
    setHITL((prev) => [req, ...prev]);
    setActiveRight("hitl");
    notify("⏳ Query requires your approval");
  };

  const handleDecision = async (id: string, approved: boolean) => {
    const endpoint = approved ? "approve" : "reject";
    try {
      const res = await fetch(`${API}/api/hitl/${id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      setHITL((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: approved ? "approved" : "rejected" }
            : r,
        ),
      );

      if (data.response) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: data.response,
            sql: data.sql,
            riskLevel: data.riskLevel,
            timestamp: Date.now(),
          },
        ]);
      }

      notify(approved ? "✅ Query approved and executed" : "❌ Query rejected");
    } catch {
      notify("⚠️ Failed to process decision");
    }
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        * { font-family: 'DM Sans', system-ui, sans-serif; }
        pre, code, .font-mono { font-family: 'DM Mono', monospace !important; }
        @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.2s ease; }
      `}</style>

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
            <Database size={13} className="text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">
            SQLMind
          </span>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(["business", "dev"] as AppMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize
                ${mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
          />
          <span className="text-xs text-gray-400">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat */}
        <div
          className="flex flex-col border-r border-gray-100"
          style={{ width: "55%" }}
        >
          <ChatPanel
            mode={mode}
            onHITL={handleHITL}
            messages={messages}
            setMessages={setMessages}
          />
        </div>

        {/* Right panels */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex border-b border-gray-100 flex-shrink-0">
            {(
              [
                { key: "schema", label: "Schema", icon: <Layers size={12} /> },
                { key: "sql", label: "SQL", icon: <Activity size={12} /> },
                {
                  key: "hitl",
                  label: "Approvals",
                  icon: <AlertTriangle size={12} />,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveRight(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all
                  ${
                    activeRight === tab.key
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
              >
                {tab.icon}
                {tab.label}
                {tab.key === "hitl" && pendingCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center ml-0.5">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {activeRight === "schema" && <SchemaBrowser />}
            {activeRight === "sql" && <SQLPreviewPanel messages={messages} />}
            {activeRight === "hitl" && (
              <HITLPanel requests={hitlRequests} onDecision={handleDecision} />
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {notification && (
        <div
          className="fixed bottom-4 right-4 flex items-center gap-2 bg-gray-900 text-white
          text-xs px-4 py-2.5 rounded-xl shadow-lg animate-fade-in z-50"
        >
          {notification}
          <button onClick={() => setNotify(null)}>
            <X size={12} className="opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}
    </div>
  );
}
