import "dotenv/config";

export interface Trace {
  id: string;
  span: (name: string, input?: unknown) => Span;
  score: (name: string, value: number, comment?: string) => void;
  end: (output?: unknown) => void;
}

export interface Span {
  id: string;
  end: (output?: unknown) => void;
}

// ── Structured logger
function emit(
  level: "trace" | "span" | "score" | "metric",
  event: string,
  data: Record<string, unknown>,
) {
  if (process.env.TRACING_ENABLED === "false") return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  if (process.env.LOG_FORMAT === "json") {
    // Production — one JSON line per event
    // Pipe to Grafana, Datadog, ELK, etc.
    console.log(JSON.stringify(payload));
  } else {
    // Dev — human readable
    const icons: Record<string, string> = {
      trace: "🔷",
      span: "  ⬜",
      score: "  📈",
      metric: "  📊",
    };
    const icon = icons[level] ?? "  •";
    const preview = Object.entries(data)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ")
      .slice(0, 120);
    console.log(`${icon} [${event}] ${preview}`);
  }
}

// createTrace — one per user request

export function createTrace(params: {
  sessionId: string;
  input: string;
  mode: string;
}): Trace {
  const traceId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const started = Date.now();
  const scores: Record<string, number> = {};

  emit("trace", "trace.start", {
    traceId,
    sessionId: params.sessionId,
    input: params.input,
    mode: params.mode,
  });

  return {
    id: traceId,

    // ── span — wraps one node
    span: (name, input) => {
      const spanId = `${traceId}:${name}`;
      const started = Date.now();

      emit("span", "span.start", {
        traceId,
        spanId,
        node: name,
        input: input ?? {},
      });

      return {
        id: spanId,
        end: (output) => {
          emit("span", "span.end", {
            traceId,
            spanId,
            node: name,
            output: output ?? {},
            durationMs: Date.now() - started,
          });
        },
      };
    },

    // ── score — quality metric ─────────────────────────────
    score: (name, value, comment) => {
      scores[name] = value;
      const filled = "█".repeat(Math.round(value * 10));
      const empty = "░".repeat(10 - Math.round(value * 10));
      emit("score", "score", {
        traceId,
        metric: name,
        value: parseFloat(value.toFixed(3)),
        bar: `${filled}${empty} ${(value * 100).toFixed(0)}%`,
        comment: comment ?? "",
      });
    },

    // ── end — close the trace ──────────────────────────────
    end: (output) => {
      emit("trace", "trace.end", {
        traceId,
        output: output ?? {},
        scores,
        durationMs: Date.now() - started,
      });
    },
  };
}

// flush is a no-op here — logs are synchronous
// if you add an async backend (Langfuse, OTLP) flush it here
export async function flush() {
  // no-op
}
