import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyCategory,
  skeletalRateOf,
  semenGrades,
  iqMetrics,
  normalizeProfile,
  estimatedSkeletalMass,
  ageAt,
} from "../src/lib/shared";

test("WHO参考下限は厳密な超過、秀は5項目の以上、欠測は適合しない", () => {
  const who = {
    volume: 1.4,
    concentration: 16,
    total: 39,
    motility: 42,
    progressive: 30,
    morphology: 4,
  };
  assert.equal(semenGrades(who).good, false);
  const good = Object.fromEntries(
    Object.entries(who).map(([k, v]) => [k, v + 0.1]),
  );
  assert.equal(semenGrades(good).good, true);
  for (const k of Object.keys(who))
    assert.equal(semenGrades({ ...good, [k]: null }).good, false);
  const excellent = {
    volume: 2,
    concentration: 50,
    total: 100,
    motility: 55,
    morphology: 10,
    progressive: null,
  };
  assert.deepEqual(semenGrades(excellent), { good: false, excellent: true });
  for (const k of [
    "volume",
    "concentration",
    "total",
    "motility",
    "morphology",
  ]) {
    assert.equal(semenGrades({ ...excellent, [k]: null }).excellent, false);
    assert.equal(
      semenGrades({
        ...excellent,
        [k]: excellent[k as keyof typeof excellent]! - 0.01,
      }).excellent,
      false,
    );
  }
});
test("4段階分類の境界と、体重変更による骨格筋率の再計算", () => {
  for (const [kind, values] of [
    ["fat", [9.9, 10, 19.9, 20, 24.9, 25]],
    ["skeletal", [32.8, 32.9, 35.7, 35.8, 37.3, 37.4]],
  ] as const)
    assert.deepEqual(
      values.map((n) => bodyCategory(n, kind)),
      ["低い", "標準", "標準", "やや高い", "やや高い", "高い"],
    );
  assert.equal(bodyCategory(null, "skeletal"), null);
  assert.equal(bodyCategory(9.94, "fat"), "低い");
  assert.equal(bodyCategory(9.96, "fat"), "標準");
  assert.equal(
    skeletalRateOf({ skeletalMass: 24, skeletalRate: null, weight: 80 }),
    30,
  );
  assert.equal(
    skeletalRateOf({ skeletalMass: 24, skeletalRate: null, weight: 60 }),
    40,
  );
  assert.equal(
    skeletalRateOf({ skeletalMass: null, skeletalRate: null, weight: 60 }),
    null,
  );
});
test("IQ平均100・標準偏差18から上位割合を計算し、学歴の換算式を逆算", () => {
  assert.ok(Math.abs(iqMetrics(100)!.upperPercent - 50) < 0.00001);
  assert.ok(Math.abs(iqMetrics(118)!.upperPercent - 15.865525) < 0.0001);
  assert.ok(Math.abs(iqMetrics(82)!.upperPercent - 84.134475) < 0.0001);
  assert.equal(iqMetrics(115)!.deviation, 60);
  assert.equal(iqMetrics(null), null);
  assert.ok(iqMetrics(200)!.upperPercent > 0);
});
test("旧筋肉量や条件不明のSMIをそのまま骨格筋率に転用せず、旧血圧は除く", () => {
  const p = normalizeProfile({
    height: 170,
    weight: 65,
    muscle: 30,
    systolic: 120,
    diastolic: 80,
    healthDate: "2026-01-01",
  });
  assert.equal(skeletalRateOf(p), null);
  assert.equal("muscle" in p, false);
  assert.equal("systolic" in p, false);
  const smiOnly = { ...p, smi: 8 };
  assert.equal(skeletalRateOf(smiOnly), null);
});

test("SMIの概算は研究式と測定時年齢を用い、入力・適用条件の欠測を扱う", () => {
  const p = {
    ...normalizeProfile({ height: 180, weight: 80 }),
    smi: 8,
    bodyAge: 30,
  };
  assert.ok(Math.abs(estimatedSkeletalMass(p)! - 30.2696) < 0.000001);
  assert.equal(skeletalRateOf(p), 37.8);
  assert.equal(skeletalRateOf({ ...p, bodyAge: 50 }), 37.3);
  assert.equal(estimatedSkeletalMass({ ...p, bodyAge: null }), null);
  assert.equal(estimatedSkeletalMass({ ...p, bodyAge: 17 }), null);
  assert.equal(estimatedSkeletalMass({ ...p, weight: 114 }), null);
  assert.equal(estimatedSkeletalMass({ ...p, smi: 100 }), null);
  assert.equal(ageAt("1990-10-03", "2026-10-02"), 35);
  assert.equal(ageAt("1990-10-03", "2026-10-03"), 36);
});
