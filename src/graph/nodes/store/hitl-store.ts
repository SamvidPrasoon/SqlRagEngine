import { HITLStatus } from "../../../types/agentState.js";

export interface HITLRequest {
  id: string;
  sessionId: string;
  sql: string;
  queryPlan: string;
  riskLevel: string;
  userMessage: string;
  createdAt: number;
  status: HITLStatus;
  reviewNote?: string;
}


class HITLStore {
  private store = new Map<string, HITLRequest>();
  private resolvers = new Map<string, (approved: boolean) => void>();

  create(request: HITLRequest) {
    this.store.set(request.id, request);
  }

  get(id: string) {
    return this.store.get(id);
  }

  getAll() {
    return Array.from(this.store.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  getPending() {
    return this.getAll().filter((r) => r.status === "pending");
  }

  approve(id: string, note?: string): HITLRequest | null {
    const req = this.store.get(id);
    if (!req) return null;
    req.status = "approved";
    req.reviewNote = note;
    this.store.set(id, req);

    // Resolve the waiting promise
    this.resolvers.get(id)?.(true);
    this.resolvers.delete(id);
    return req;
  }

  reject(id: string, note?: string): HITLRequest | null {
    const req = this.store.get(id);
    if (!req) return null;
    req.status = "rejected";
    req.reviewNote = note;
    this.store.set(id, req);

    this.resolvers.get(id)?.(false);
    this.resolvers.delete(id);
    return req;
  }

  // The graph calls this to PAUSE and WAIT
  // Returns true if approved, false if rejected
  waitForDecision(id: string, timeoutMs = 300_000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Already decided?
      const existing = this.store.get(id);
      if (existing?.status === "approved") return resolve(true);
      if (existing?.status === "rejected") return resolve(false);

      // Store resolver — will be called when approve/reject hits
      this.resolvers.set(id, resolve);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.resolvers.has(id)) {
          this.resolvers.delete(id);
          reject(new Error(`HITL timeout for ${id}`));
        }
      }, timeoutMs);
    });
  }
}

export const hitlStore = new HITLStore();
