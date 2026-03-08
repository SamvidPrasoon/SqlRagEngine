import type { HITLStatus } from "../../../types/agentState.js";

export interface HITLRequest {
  id:          string;
  sessionId:   string;
  sql:         string;
  queryPlan:   string;
  riskLevel:   string;
  userMessage: string;
  createdAt:   number;
  status:      HITLStatus;
  reviewNote?: string;
}

class HITLStore {
  private store = new Map<string, HITLRequest>();

  create(request: HITLRequest) {
    this.store.set(request.id, request);
  }

  get(id: string) {
    return this.store.get(id) ?? null;
  }

  getAll() {
    return Array.from(this.store.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getPending() {
    return this.getAll().filter((r) => r.status === "pending");
  }

  approve(id: string, note?: string): HITLRequest | null {
    const req = this.store.get(id);
    if (!req) return null;
    req.status     = "approved";
    req.reviewNote = note;
    this.store.set(id, req);
    return req;
  }

  reject(id: string, note?: string): HITLRequest | null {
    const req = this.store.get(id);
    if (!req) return null;
    req.status     = "rejected";
    req.reviewNote = note;
    this.store.set(id, req);
    return req;
  }
}

export const hitlStore = new HITLStore();
