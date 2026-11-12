import { describe, expect, it } from "vitest";
import { inviteMessage, inviteUrl, isInviteRole } from "./team";

const TOKEN = "a".repeat(48);

describe("invites", () => {
  it("build the link from the site address", () => {
    expect(inviteUrl("https://example.in/", TOKEN)).toBe(`https://example.in/invite/${TOKEN}`);
    expect(() => inviteUrl("https://example.in", "../x")).toThrow();
  });

  it("say who's inviting and for what", () => {
    const msg = inviteMessage("Saltwater", "admin", `https://example.in/invite/${TOKEN}`);
    expect(msg).toContain("join Saltwater as an admin");
    expect(msg).toContain("7 days");
    expect(msg.endsWith(TOKEN)).toBe(true);
  });

  it("only offer admin and team member roles", () => {
    expect(isInviteRole("operator")).toBe(true);
    expect(isInviteRole("admin")).toBe(true);
    expect(isInviteRole("owner")).toBe(false);
  });
});
