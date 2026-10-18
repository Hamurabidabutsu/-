import assert from "node:assert/strict";
import { emptyProfile, ageAt } from "../../src/lib/shared";
export async function runWorkflow({
  call,
  signup,
  upload,
  fileStatus,
  assertEmpty,
}: {
  call: (...args: any[]) => Promise<any>;
  signup: (...args: any[]) => Promise<any>;
  upload: (...args: any[]) => Promise<string>;
  fileStatus: (...args: any[]) => Promise<number>;
  assertEmpty: () => Promise<void>;
}) {
  const d = await signup("synthetic-donor@example.test", "donor"),
    r = await signup("synthetic-recipient@example.test", "recipient"),
    outsider = await signup("outsider@example.test", "recipient");
  const admin = await call("auth/demo", "POST", { role: "admin" });
  const profile = emptyProfile();
  profile.skeletalRate = 35;
  Object.assign(profile, {
    bodyDate: "2026-10-01",
    hair: "黒（自然色）",
    hairTexture: "ややくせ毛・硬毛",
    eyelid: "奥二重",
    visionLeft: 0.7,
    visionRight: 1.2,
    history: "本人の既往歴\nなし",
    familyHistory: "父：喘息",
    allergy: "花粉",
    exercise: "週7日",
    drinking: "月3回",
    smoking: "月1回",
    drinkingAmount: 20,
    smokingAmount: 2,
    alcoholTolerance: "弱い",
    weekdays: ["土", "祝"],
    normalRegions: [{ prefecture: "東京都", area: "全域" }],
    travelRegions: [{ prefecture: "東京都", area: "全域" }],
    academics: [
      {
        kind: "highschool",
        catalogId: "",
        school: "テスト高校",
        faculty: "",
        department: "普通科",
        iq: null,
        submittedDeviation: 62.5,
      },
    ],
    semenDate: "2026-10-01",
    semen: { volume: 3, motility: 65 },
  });
  await call("applications", "POST", { profile, fileIds: [] }, d.cookie, 400);
  await call(
    "profile",
    "PATCH",
    {
      profile: {
        ...profile,
        academics: [{ ...profile.academics[0], submittedDeviation: 100 }],
      },
    },
    d.cookie,
    400,
  );
  await call("profile", "PATCH", { profile }, d.cookie);
  const academicDraft = (await call("profile", "GET", undefined, d.cookie))
    .profile.academics[0];
  assert.equal(academicDraft.submittedDeviation, 62.5);
  assert.equal(
    academicDraft.deviation,
    undefined,
    "self-reported values are not confirmed values",
  );
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, academics: [] } },
    d.cookie,
    400,
  );
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, skeletalMass: 20 } },
    d.cookie,
    400,
  );
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, smokingAmount: 1.5 } },
    d.cookie,
    400,
  );
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, smi: 8 } },
    d.cookie,
    400,
  );
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, skeletalRate: null, smi: 8, weight: 120 } },
    d.cookie,
    400,
  );
  await call(
    "profile",
    "PATCH",
    {
      profile: {
        ...profile,
        skeletalRate: null,
        smi: 8,
        bodyDate: "2000-01-01",
      },
    },
    d.cookie,
    400,
  );
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, skeletalRate: null, smi: 8, bodyAge: 500 } },
    d.cookie,
  );
  const estimateDraft = (await call("profile", "GET", undefined, d.cookie))
    .profile;
  assert.equal(estimateDraft.smi, 8);
  assert.equal(
    estimateDraft.bodyAge,
    ageAt(d.user.birthDate, profile.bodyDate),
  );
  const docs = [];
  for (const kind of ["identity", "body", "highschool", "semen"])
    docs.push(await upload(kind, d.cookie));
  const photo = await upload("photo", d.cookie);
  assert.equal(await fileStatus(photo), 401);
  assert.equal(await fileStatus(photo, r.cookie), 404);
  const cancelled = await call(
    "applications",
    "POST",
    { profile, fileIds: docs },
    d.cookie,
    201,
  );
  await call(
    "applications/" + cancelled.applicationId,
    "DELETE",
    undefined,
    d.cookie,
  );
  const app = await call(
    "applications",
    "POST",
    { profile, fileIds: docs },
    d.cookie,
    201,
  );
  await call(
    "admin/applications/" + app.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
    409,
  );
  await call("payments/" + app.applicationId + "/demo", "POST", {}, d.cookie);
  await call(
    "admin/applications/" + app.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
  );
  await call(
    "admin/applications/" + app.applicationId,
    "PATCH",
    {
      action: "approve",
      confirmed: true,
      academicDeviations: { highschool: 70 },
    },
    admin.cookie,
  );
  for (const doc of docs)
    assert.equal(await fileStatus(doc, admin.cookie), 404);
  let published = (await call("donors/" + d.user.id)).donor;
  assert.equal(published.iq, 130);
  const confirmedProfile = (await call("profile", "GET", undefined, d.cookie))
    .profile;
  await call(
    "profile",
    "PATCH",
    { profile: confirmedProfile, publish: true },
    d.cookie,
  );
  await call(
    "profile",
    "PATCH",
    {
      profile: {
        ...confirmedProfile,
        academics: [
          { ...confirmedProfile.academics[0], submittedDeviation: 89 },
        ],
      },
      publish: true,
    },
    d.cookie,
    409,
  );
  assert.equal((await call("donors/" + d.user.id)).donor.iq, 130);
  assert.equal(published.privateInfo, undefined);
  assert.equal(published.birthDate, undefined);
  assert.equal(published.email, undefined);
  assert.equal(published.academics, undefined);
  assert.equal(published.hair, "黒（自然色）");
  assert.equal(published.familyHistory, "父：喘息");
  assert.equal(published.visionLeft, 0.7);
  assert.equal(published.skeletalRate, 35);
  assert.equal(published.drinkingAmount, 20);
  assert.equal(published.smokingAmount, 2);
  assert.equal("systolic" in published, false);
  assert.equal("hereditary" in published, false);
  assert.equal("muscle" in published, false);
  assert.ok(
    (
      await call(
        "donors?skeletalCategory=" +
          encodeURIComponent("標準") +
          "&bodyFatCategory=" +
          encodeURIComponent("標準"),
      )
    ).donors.some((x: any) => x.id === d.user.id),
  );
  assert.ok(
    !(await call("donors?semenGrade=" + encodeURIComponent("良"))).donors.some(
      (x: any) => x.id === d.user.id,
    ),
  );
  const sorted = (await call("donors?sort=iq")).donors.map(
    (x: any) => x.iq ?? -Infinity,
  );
  assert.deepEqual(
    sorted,
    [...sorted].sort((a, b) => b - a),
  );
  // Unchanged manually verified academic reference must survive free availability edits.
  await call(
    "profile",
    "PATCH",
    { profile: { ...profile, frequency: 2 }, publish: true },
    d.cookie,
  );
  assert.equal((await call("donors/" + d.user.id)).donor.iq, 130);
  const updated = {
    ...profile,
    frequency: 2,
    bodyDate: "2026-10-02",
    weight: 66,
    skeletalRate: null,
    smi: 8,
    bodyAge: 999,
  };
  const bodyDoc = await upload("body", d.cookie);
  const update = await call(
    "applications",
    "POST",
    { profile: updated, fileIds: [bodyDoc] },
    d.cookie,
    201,
  );
  assert.equal(update.amount, 5000);
  await call(
    "payments/" + update.applicationId + "/demo",
    "POST",
    {},
    d.cookie,
  );
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
  );
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "revise", reason: "書類が不鮮明" },
    admin.cookie,
  );
  const revised = await call(
    "applications/" + update.applicationId + "/revise",
    "POST",
    { profile: updated, fileIds: [] },
    d.cookie,
  );
  assert.equal(revised.additionalCharge, 0);
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "start" },
    admin.cookie,
  );
  await call(
    "admin/applications/" + update.applicationId,
    "PATCH",
    { action: "approve", confirmed: true },
    admin.cookie,
  );
  const estimated = (await call("donors/" + d.user.id)).donor;
  assert.equal(estimated.skeletalEstimated, true);
  assert.equal(estimated.skeletalRate, 40.9);
  assert.equal("bodyAge" in estimated, false);
  assert.equal("smi" in estimated, false);
  assert.ok(
    (
      await call("donors?skeletalCategory=" + encodeURIComponent("高い"))
    ).donors.some((x: any) => x.id === d.user.id),
  );
  await call(
    "admin/donors/" + d.user.id,
    "PATCH",
    { paused: true },
    admin.cookie,
  );
  await call("profile/availability", "POST", { paused: false }, d.cookie, 409);
  await call("donors/" + d.user.id, "GET", undefined, "", 404);
  await call(
    "admin/donors/" + d.user.id,
    "PATCH",
    { paused: false },
    admin.cookie,
  );
  const chat = await call(
      "conversations",
      "POST",
      { donorId: d.user.id },
      r.cookie,
      201,
    ),
    cid = chat.conversationId;
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "承認前" },
    r.cookie,
    403,
  );
  await call("conversations/" + cid, "GET", undefined, outsider.cookie, 404);
  await call("conversations/" + cid, "PATCH", { action: "accept" }, d.cookie);
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "合成データでチャットを確認" },
    r.cookie,
    201,
  );
  const image = await upload("chat", r.cookie, cid);
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "", fileId: image },
    r.cookie,
    201,
  );
  assert.equal(await fileStatus(image, outsider.cookie), 404);
  await call(
    "conversations/" + cid,
    "PATCH",
    { action: "disclose", enabled: true },
    d.cookie,
  );
  assert.equal(
    (await call("donors/" + d.user.id, "GET", undefined, r.cookie)).donor
      .privateInfo.academics[0].school,
    "テスト高校",
  );
  assert.equal(await fileStatus(photo, r.cookie), 200);
  await call(
    "conversations/" + cid,
    "PATCH",
    { action: "disclose", enabled: false },
    d.cookie,
  );
  assert.equal(
    (await call("donors/" + d.user.id, "GET", undefined, r.cookie)).donor
      .privateInfo,
    undefined,
  );
  assert.equal(await fileStatus(photo, r.cookie), 404);
  await call(
    "conversations/" + cid + "/events",
    "POST",
    { kind: "donation", date: "2026-10-01" },
    d.cookie,
    201,
  );
  let events = (await call("conversations/" + cid, "GET", undefined, r.cookie))
    .events;
  assert.equal((await call("donors/" + d.user.id)).donor.donationCount, 0);
  await call("events/" + events[0].id, "PATCH", { confirmed: true }, r.cookie);
  assert.equal((await call("donors/" + d.user.id)).donor.donationCount, 1);
  assert.equal(
    (await call("conversations/" + cid, "GET", undefined, admin.cookie))
      .messages.length,
    2,
  );
  await call(
    "conversations/" + cid + "/messages",
    "POST",
    { body: "管理者から送信" },
    admin.cookie,
    403,
  );
  const deleted = await call("account", "DELETE", { confirm: true }, d.cookie);
  assert.equal(deleted.pendingFileCleanup, 0);
  assert.equal(await fileStatus(image, r.cookie), 404);
  assert.equal(await fileStatus(photo, r.cookie), 404);
  await call("conversations/" + cid, "GET", undefined, r.cookie, 404);
  await call("donors/" + d.user.id, "GET", undefined, "", 404);
  const remaining = (await call("conversations", "GET", undefined, r.cookie))
    .conversations;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].status, "deleted");
  assert.equal(remaining[0].donor_id, undefined);
  await assertEmpty();
}

