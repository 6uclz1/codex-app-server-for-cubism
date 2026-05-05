export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalRequest =
  | { kind: "shell"; command: string; cwd: string }
  | { kind: "file-edit"; path: string; diff?: string };

export interface PendingApproval {
  id: string;
  request: ApprovalRequest;
  status: ApprovalStatus;
}

export interface ApprovalResolution {
  id: string;
  status: Exclude<ApprovalStatus, "pending">;
}

interface PendingEntry extends PendingApproval {
  resolve: (resolution: ApprovalResolution) => void;
}

export class ApprovalManager {
  private nextId = 1;
  private readonly pending = new Map<string, PendingEntry>();

  requestApproval(request: ApprovalRequest): Promise<ApprovalResolution> {
    const id = `approval_${this.nextId++}`;
    return new Promise((resolve) => {
      this.pending.set(id, { id, request, status: "pending", resolve });
    });
  }

  listPending(): PendingApproval[] {
    return [...this.pending.values()].map(({ resolve: _resolve, ...entry }) => entry);
  }

  resolve(id: string, status: Exclude<ApprovalStatus, "pending">): void {
    const entry = this.pending.get(id);
    if (!entry) {
      throw new Error(`Unknown approval request: ${id}`);
    }
    this.pending.delete(id);
    entry.resolve({ id, status });
  }
}
