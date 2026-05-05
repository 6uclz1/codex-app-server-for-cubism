import { describe, expect, it } from "vitest";
import { ApprovalManager } from "./ApprovalManager.js";

describe("ApprovalManager", () => {
  it("keeps file and shell approvals pending until the UI resolves them", async () => {
    const manager = new ApprovalManager();
    const pending = manager.requestApproval({
      kind: "shell",
      command: "npm test",
      cwd: "/tmp/project"
    });

    const [item] = manager.listPending();
    expect(item?.status).toBe("pending");
    manager.resolve(item!.id, "approved");

    await expect(pending).resolves.toMatchObject({ status: "approved" });
    expect(manager.listPending()).toHaveLength(0);
  });
});
