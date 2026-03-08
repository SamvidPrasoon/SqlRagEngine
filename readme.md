## Our complete graph visualized
```
START
  │
  ▼
┌─────────────────────┐
│   retrieve_context  │ ← RAG + long-term memory (parallel)
└─────────────────────┘
  │
  ▼
┌─────────────────────┐
│     plan_query      │ ← chain of thought — think before SQL
└─────────────────────┘
  │
  ▼
┌─────────────────────┐
│    generate_sql     │ ◄──────────────────────┐
│    (with tools)     │                        │
│    (with Zod)       │                        │ retry loop
└─────────────────────┘                        │ (max 3x)
  │                                            │
  ▼                                            │
┌─────────────────────┐                        │
│  check_guardrails   │                        │
└─────────────────────┘                        │
  │                                            │
  ├── blocked ──► handle_blocked               │
  │                    │                       │
  ├── hitl ────► handle_hitl                   │
  │                    │                       │
  └── safe ────► execute_query ─── failed ─────┘
                       │
                       │ success
                       ▼
              ┌─────────────────────┐
              │  summarize_results  │ ← Langfuse + RAGAS
              └─────────────────────┘
                       │
                       ▼
              ┌─────────────────────┐
              │    update_memory    │ ← short-term + summarize
              └─────────────────────┘
                       │
                       ▼
                      END