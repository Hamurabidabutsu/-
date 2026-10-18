import assert from "node:assert/strict";
import { emptyProfile } from "../../src/lib/shared";

export async function runAdminEntry(call: (...args: any[]) => Promise<any>) {
  const admin = await call("auth/demo", "POST", { role: "admin" });
  const recipient = await call("auth/demo", "POST", { role: "recipient" });
  const donor = await call("auth/demo", "POST", { role: "donor" });
  const account = {
    email: "manual-donor@example.test",
    password: "Manual-test-password123!",
    birthDate: "1990-01-01",
    agreed: true,
  };
  await call("admin/donors", "POST", account, "", 401);
  await call("admin/donors", "POST", account, donor.cookie, 403);
  await call("admin/donors", "POST", account, recipient.cookie, 403);
  await call(
    "admin/donors",
    "POST",
    { ...account, agreed: false },
    admin.cookie,
    400,
  );
  await call(
    "admin/donors",
    "POST",
    { ...account, birthDate: "2020-01-01" },
    admin.cookie,
    400,
  );
  const created = await call(
    "admin/donors",
    "POST",
    account,
    admin.cookie,
    201,
  );
  assert.equal(created.user.role, "donor");
  assert.equal(created.cookie, admin.cookie);
  assert.equal(
    (await call("me", "GET", undefined, admin.cookie)).user.role,
    "admin",
  );
  await call("admin/donors", "POST", account, admin.cookie, 409);
  const second = await call(
    "admin/donors",
    "POST",
    { ...account, email: "manual-second@example.test" },
    admin.cookie,
    201,
  );
  assert.notEqual(created.user.id, second.user.id);
  const route = `admin/donors/${created.user.id}/profile`;
  await call(route, "GET", undefined, recipient.cookie, 403);
  await call(
    `admin/donors/${admin.user.id}/profile`,
    "GET",
    undefined,
    admin.cookie,
    404,
  );
  const profile = emptyProfile();
  Object.assign(profile, {
    weekdays: ["土"],
    normalRegions: [{ prefecture: "東京都", area: "全域" }],
    travelRegions: [{ prefecture: "東京都", area: "全域" }],
    bodyDate: "2026-10-01",
    skeletalRate: 35,
    semenDate: "2026-10-01",
    semen: { volume: 3, motility: 65 },
    academics: [
      {
        kind: "highschool",
        catalogId: "",
        school: "手入力テスト高校",
        faculty: "",
        department: "普通科",
        iq: null,
        deviation: 60,
      },
    ],
  });
  const entry = {
    profile,
    publish: true,
    confirmed: true,
    fileIds: [],
    birthDate: "1991-02-03",
    note: "合成データによる検証",
  };
  await call(route, "PATCH", entry, donor.cookie, 403);
  await call(route, "PATCH", { ...entry, confirmed: false }, admin.cookie, 400);
  await call(
    route,
    "PATCH",
    { ...entry, profile: { ...profile, academics: [] } },
    admin.cookie,
    400,
  );
  await call(route, "PATCH", { ...entry, publish: false }, admin.cookie);
  const draft = await call(route, "GET", undefined, admin.cookie);
  assert.equal(draft.approved, null);
  assert.equal(
    draft.user.birthDate,
    "1990-01-01",
    "draft must not change publicly calculated age",
  );
  assert.equal(draft.applications.length, 0);
  await call(route, "PATCH", entry, admin.cookie);
  const first = await call(route, "GET", undefined, admin.cookie);
  assert.equal(first.status, "approved");
  assert.equal(first.user.birthDate, "1991-02-03");
  assert.equal(first.approved.academics[0].deviation, 60);
  assert.equal(first.applications.length, 1);
  assert.equal(first.applications[0].paid, 0);
  assert.equal(first.applications[0].approval_method, "admin_entry");
  const changed = { ...profile, hair: "手入力で修正" };
  await call(
    route,
    "PATCH",
    { ...entry, profile: changed, publish: false },
    admin.cookie,
  );
  assert.equal(
    (await call(route, "GET", undefined, admin.cookie)).approved.hair,
    profile.hair,
  );
  await call(route, "PATCH", { ...entry, profile: changed }, admin.cookie);
  const updated = await call(route, "GET", undefined, admin.cookie);
  assert.equal(updated.approved.hair, changed.hair);
  assert.equal(
    updated.applications.length,
    2,
    "free admin updates are reusable",
  );
  assert.ok(
    updated.applications.every(
      (a: any) => a.paid === 0 && a.approval_method === "admin_entry",
    ),
  );
  const login = await call("auth/login", "POST", {
    email: account.email,
    password: account.password,
  });
  const own = await call("profile", "GET", undefined, login.cookie);
  assert.equal(own.status, "approved");
  assert.equal(own.applications.length, 2);
  await call(
    "profile",
    "PATCH",
    {
      profile: { ...changed, height: changed.height + 1 },
      publish: true,
      feeWaived: true,
    },
    login.cookie,
    409,
  );
  await call("admin/donors", "GET", undefined, login.cookie, 403);
  return { admin, created, second, route, entry, login };
}

