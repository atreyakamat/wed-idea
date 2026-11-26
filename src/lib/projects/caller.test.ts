import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bearerCredential, callerKind, canOperate, looksLikeJwt, resolveUserCaller, uuidOrNull, type UserCallerStore } from "./caller";
import type { WorkerStudio } from "./worker-api";
import { makeWorkerToken } from "./worker-token";

const USER = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_USER = "aaaaaaaa-0000-4000-8000-000000000002";
const STUDIO_A = "11111111-1111-4111-8111-111111111111";
const STUDIO_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.c2lnbmF0dXJl";

const STUDIO: WorkerStudio = { id: STUDIO_A, name: "Saltwater", status: "active", trialEndsAt: "2026-12-01", paidUntil: null, planId: "pro" };

type Fixture = {
  /** Which user each access token belongs to. A token missing here is rejected by Supabase. */
  tokens?: Record<string, string>;
  /** Membership rows: user -> studio -> role. */
  members?: { user: string; studio: string; role: string }[];
  /** Projects and the studio each belongs to. */
  projects?: Record<string, string>;
  /** Studios that exist. */
  studios?: string[];
  /** Whether the user is over the request budget. */
  limited?: boolean;
  /** The user the database client acts as (RLS uses this). Defaults to USER. */
  as?: string;
};

/**
 * Stands in for Supabase. Like RLS, projectStudio only shows a project to a
 * member of its studio, and role only shows the caller's own membership.
 */
function fakeStore(f: Fixture, calls: string[] = []): UserCallerStore {
  const tokens = f.tokens ?? { [JWT]: USER };
  const members = f.members ?? [{ user: USER, studio: STUDIO_A, role: "operator" }];
  const projects = f.projects ?? { [PROJECT_A]: STUDIO_A, [PROJECT_B]: STUDIO_B };
  const studios = f.studios ?? [STUDIO_A, STUDIO_B];
  const actingAs = f.as ?? USER;
  return {
    async verify(token) {
      calls.push("verify");
      const id = tokens[token];
      return id ? { id } : null;
    },
    async allow() {
      calls.push("allow");
      return !f.limited;
    },
    async projectStudio(projectId) {
      calls.push("projectStudio");
      const studio = projects[projectId];
      const member = members.some((m) => m.studio === studio && m.user === actingAs);
      return studio && member ? studio : null;
    },
    async role(userId, studioId) {
      calls.push("role");
      return members.find((m) => m.user === userId && m.studio === studioId)?.role ?? null;
    },
    async studio(studioId) {
      calls.push("studio");
      return studios.includes(studioId) ? { ...STUDIO, id: studioId } : null;
    },
  };
}

describe("telling the callers apart", () => {
  it("treats a worker token as the PC app", () => {
    const { token } = makeWorkerToken();
    expect(callerKind(token)).toBe("worker");
  });

  it("treats any other bearer value as a user token", () => {
    expect(callerKind(JWT)).toBe("user");
    expect(callerKind("cwp_wk_short")).toBe("user");
    expect(callerKind(`cwp_wk_${"A".repeat(48)}`)).toBe("user");
  });

  it("reads any Bearer value, not only worker tokens", () => {
    expect(bearerCredential(`Bearer ${JWT}`)).toBe(JWT);
    expect(bearerCredential(`bearer  ${JWT} `)).toBe(JWT);
    expect(bearerCredential(JWT)).toBeNull();
    expect(bearerCredential("Bearer")).toBeNull();
    expect(bearerCredential(null)).toBeNull();
  });

  it("checks a JWT's shape without trusting its payload", () => {
    expect(looksLikeJwt(JWT)).toBe(true);
    expect(looksLikeJwt("not-a-jwt")).toBe(false);
    expect(looksLikeJwt(`${"a".repeat(9000)}.b.c`)).toBe(false);
  });
});

describe("who may operate", () => {
  it("allows owners, admins and operators", () => {
    expect(canOperate("owner")).toBe(true);
    expect(canOperate("admin")).toBe(true);
    expect(canOperate("operator")).toBe(true);
  });

  it("refuses any other role, and no role at all", () => {
    expect(canOperate("viewer")).toBe(false);
    expect(canOperate("Owner")).toBe(false);
    expect(canOperate("")).toBe(false);
    expect(canOperate(null)).toBe(false);
    expect(canOperate(undefined)).toBe(false);
  });

  it("accepts only UUID strings as ids", () => {
    expect(uuidOrNull(STUDIO_A)).toBe(STUDIO_A);
    expect(uuidOrNull("studio-a")).toBeNull();
    expect(uuidOrNull(42)).toBeNull();
    expect(uuidOrNull(undefined)).toBeNull();
  });
});

describe("a user token on a studio route", () => {
  it("succeeds for a member with operator role", async () => {
    const result = await resolveUserCaller(fakeStore({}), JWT, { organizationId: STUDIO_A });
    expect(result).toEqual({ ok: true, userId: USER, role: "operator", studio: { ...STUDIO, id: STUDIO_A } });
  });

  it("succeeds for an admin and an owner too", async () => {
    for (const role of ["admin", "owner"]) {
      const result = await resolveUserCaller(fakeStore({ members: [{ user: USER, studio: STUDIO_A, role }] }), JWT, { organizationId: STUDIO_A });
      expect(result.ok && result.role).toBe(role);
    }
  });

  it("rejects a member whose role can't operate (there is no viewer role; this uses one)", async () => {
    const result = await resolveUserCaller(fakeStore({ members: [{ user: USER, studio: STUDIO_A, role: "viewer" }] }), JWT, { organizationId: STUDIO_A });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects a non-member with 403", async () => {
    const result = await resolveUserCaller(fakeStore({ members: [{ user: OTHER_USER, studio: STUDIO_A, role: "owner" }] }), JWT, { organizationId: STUDIO_A });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("needs organizationId when no project is named", async () => {
    const store = fakeStore({});
    expect(await resolveUserCaller(store, JWT, {})).toMatchObject({ ok: false, status: 400 });
    expect(await resolveUserCaller(store, JWT, { organizationId: "studio-a" })).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a token Supabase doesn't accept", async () => {
    const result = await resolveUserCaller(fakeStore({ tokens: {} }), JWT, { organizationId: STUDIO_A });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("stops over the request budget", async () => {
    const result = await resolveUserCaller(fakeStore({ limited: true }), JWT, { organizationId: STUDIO_A });
    expect(result).toMatchObject({ ok: false, status: 429 });
  });

  it("rejects a studio that doesn't exist", async () => {
    const result = await resolveUserCaller(fakeStore({ studios: [] }), JWT, { organizationId: STUDIO_A });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe("a user token on a project route", () => {
  it("resolves the project's studio and succeeds for its member", async () => {
    const result = await resolveUserCaller(fakeStore({}), JWT, { projectId: PROJECT_A });
    expect(result).toMatchObject({ ok: true, userId: USER, studio: { id: STUDIO_A } });
  });

  it("rejects a project in another studio with 404, as if it did not exist", async () => {
    const result = await resolveUserCaller(fakeStore({}), JWT, { projectId: PROJECT_B });
    expect(result).toEqual({ ok: false, status: 404, error: "Project not found." });
  });

  it("rejects a project in a studio the user is not a member of, even when it exists", async () => {
    const store = fakeStore({ members: [{ user: OTHER_USER, studio: STUDIO_B, role: "owner" }], as: USER });
    const result = await resolveUserCaller(store, JWT, { projectId: PROJECT_B });
    expect(result).toEqual({ ok: false, status: 404, error: "Project not found." });
  });

  it("answers an unknown project the same way", async () => {
    const result = await resolveUserCaller(fakeStore({}), JWT, { projectId: "55555555-5555-4555-8555-555555555555" });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("doesn't look up a project id that isn't a UUID", async () => {
    const calls: string[] = [];
    const result = await resolveUserCaller(fakeStore({}, calls), JWT, { projectId: "not-a-uuid" });
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(calls).not.toContain("projectStudio");
  });

  it("rejects a viewer-like role on a project with 403", async () => {
    const result = await resolveUserCaller(fakeStore({ members: [{ user: USER, studio: STUDIO_A, role: "viewer" }] }), JWT, { projectId: PROJECT_A });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});
