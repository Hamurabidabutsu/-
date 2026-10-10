export const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];
export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日", "祝"];
export const HAIR = ["黒", "濃い茶", "薄い茶", "金", "赤", "白・灰", "その他"];
export const FREQUENCIES = [
  "未回答",
  "ほぼなし",
  "月1回",
  "月2回",
  "月3回",
  ...Array.from({ length: 7 }, (_, i) => `週${i + 1}日`),
];
export const HAIR_TEXTURES = [
  "未回答",
  ...["くせ毛", "ややくせ毛", "直毛"].flatMap((x) =>
    ["柔毛", "硬毛"].map((y) => `${x}・${y}`),
  ),
];
export const EYELIDS = ["未回答", "二重", "奥二重", "一重"];
export const TOLERANCES = ["不明", "弱い", "普通", "強い"];
export const BODY_CATEGORIES = ["低い", "標準", "やや高い", "高い"];
export const HELP = {
  iq: "IQは知能検査の指標です。このサイトでは公的なIQ検査結果または学歴の偏差値×1.5＋25の参考値を表示します。偏差値は（IQ−25）÷1.5。上位N％はIQの平均100・標準偏差18の正規分布を仮定した参考値で、実際の学歴集団の順位や子どもの能力を示すものではありません。",
  bodyFat:
    "体脂肪率は体重に占める脂肪の割合です。低い：9.9％以下、標準：10.0〜19.9％、やや高い：20.0〜24.9％、高い：25.0％以上。小数第1位に丸めて分類します。測定器や測定条件によって値は変わります。",
  skeletal:
    "骨格筋は骨を動かす筋肉です。骨格筋率は全身の骨格筋量÷体重×100。低い：32.8％以下、標準：32.9〜35.7％、やや高い：35.8〜37.3％、高い：37.4％以上。小数第1位に丸めて分類します。一般的な筋肉量には心筋・平滑筋等も含まれるため、その値は換算に使えません。SMIは四肢筋肉量÷身長(m)²です。SMIから復元した四肢量をDXA研究のALSTに近似し、成人男性用の研究式（推定全身骨格筋kg＝1.13×四肢量−0.02×測定時年齢＋1.58）で概算する場合があります。機器の公式換算機能ではなく、このサイトの換算精度は日本人・家庭用機器で未検証です。直接の骨格筋測定値と同じ精度ではありません。",
  semen:
    "良：6項目すべてがWHO第6版の参考下限値（精液量1.4mL、濃度16百万/mL、総数39百万、総運動率42％、前進運動率30％、正常形態率4％）を厳密に上回る。秀：精液量2mL以上、濃度50百万/mL以上、総数100百万以上、総運動率55％以上、正常形態率10％以上（前進運動率は条件外）。良・秀は別々に判定し、妊娠能力や現在の状態を保証しません。",
};
export const BLOOD = ["A", "B", "O", "AB", "不明"];
export const INFECTIONS = ["HIV", "梅毒", "クラミジア", "淋菌"];
export const SEMEN_FIELDS = [
  { key: "volume", label: "精液量", unit: "mL" },
  { key: "concentration", label: "精子濃度", unit: "百万/mL" },
  { key: "total", label: "総精子数", unit: "百万" },
  { key: "motility", label: "総運動率", unit: "%" },
  { key: "progressive", label: "前進運動率", unit: "%" },
  { key: "morphology", label: "正常形態率", unit: "%" },
] as const;
export const DOC_LABELS: Record<string, string> = {
  identity: "本人確認書類",
  highschool: "高校の卒業証明書",
  university: "大学の卒業証明書",
  wais: "WAISの結果",
  semen: "精液検査の診断書・結果表",
  infection: "感染症検査の診断書・結果表",
  body: "体組成の測定結果",
  health: "健康診断の結果",
};
export type Role = "donor" | "recipient" | "admin";
export type User = {
  id: string;
  email: string;
  role: Role;
  displayId: string;
  birthDate: string;
  emailVerified: boolean;
  emailNotifications: boolean;
};
export type Region = { prefecture: string; area: "全域" | "中心部" };
export type Academic = {
  kind: "highschool" | "university" | "wais";
  catalogId: string;
  school: string;
  faculty: string;
  department: string;
  iq: number | null;
  deviation?: number | null;
  year?: number;
};
export type ProfileData = {
  height: number;
  weight: number;
  bodyFat: number;
  skeletalMass: number | null;
  skeletalRate: number | null;
  smi: number | null;
  bodyAge: number | null;
  visionLeft: number | null;
  visionRight: number | null;
  hairTexture: string;
  eyelid: string;
  bodyDate: string;
  hair: string;
  blood: string;
  residence: string;
  methods: string[];
  weekdays: string[];
  frequencyPeriod: "月" | "年";
  frequency: number;
  extraFrequency: number;
  normalRegions: Region[];
  travelRegions: Region[];
  academics: Academic[];
  semenDate: string;
  semen: Record<string, number | null>;
  infectionDate: string;
  infections: Record<string, string>;
  smoking: string;
  drinking: string;
  exercise: string;
  history: string;
  familyHistory: string;
  smokingAmount: number | null;
  drinkingAmount: number | null;
  alcoholTolerance: string;
  allergy: string;
  contactPolicy: string;
  futureInfo: string;
};
export type Donor = {
  id: string;
  displayId: string;
  age: number;
  verified: boolean;
  hasPhoto: boolean;
  recentlyActive: boolean;
  height: number;
  weight: number;
  bodyFat: number;
  skeletalMass: number | null;
  skeletalRate: number | null;
  skeletalEstimated: boolean;
  visionLeft: number | null;
  visionRight: number | null;
  hairTexture: string;
  eyelid: string;
  bodyDate: string;
  hair: string;
  blood: string;
  residence: string;
  methods: string[];
  weekdays: string[];
  frequencyPeriod: string;
  frequency: number;
  extraFrequency: number;
  normalRegions: Region[];
  travelRegions: Region[];
  iq: number | null;
  semenDate: string;
  semen: Record<string, number | null>;
  infectionDate: string;
  infections: Record<string, string>;
  smoking: string;
  drinking: string;
  exercise: string;
  history: string;
  familyHistory: string;
  smokingAmount: number | null;
  drinkingAmount: number | null;
  alcoholTolerance: string;
  allergy: string;
  contactPolicy: string;
  futureInfo: string;
  donationCount: number;
  birthCount: number;
  privateInfo?: { academics: Academic[]; photoId: string | null };
};
export function ageOf(date: string) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number),
    [by, bm, bd] = date.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
export function dateExpired(date: string) {
  if (!date) return false;
  const d = new Date(date + "T00:00:00+09:00");
  d.setFullYear(d.getFullYear() + 2);
  return Date.now() > d.getTime();
}
export function emptyProfile(): ProfileData {
  return {
    height: 170,
    weight: 65,
    bodyFat: 18,
    skeletalMass: null,
    skeletalRate: null,
    smi: null,
    bodyAge: null,
    visionLeft: null,
    visionRight: null,
    hairTexture: "未回答",
    eyelid: "未回答",
    bodyDate: "",
    hair: "黒",
    blood: "不明",
    residence: "東京都",
    methods: ["シリンジ法"],
    weekdays: [],
    frequencyPeriod: "月",
    frequency: 1,
    extraFrequency: 0,
    normalRegions: [],
    travelRegions: [],
    academics: [],
    semenDate: "",
    semen: Object.fromEntries(SEMEN_FIELDS.map((f) => [f.key, null])),
    infectionDate: "",
    infections: Object.fromEntries(
      INFECTIONS.map((x) => [x, "未検査・未提出"]),
    ),
    smoking: "未回答",
    drinking: "未回答",
    exercise: "未回答",
    history: "未回答",
    familyHistory: "",
    smokingAmount: null,
    drinkingAmount: null,
    alcoholTolerance: "不明",
    allergy: "未回答",
    contactPolicy: "提供時のみ",
    futureInfo: "相談可",
  };
}

export function estimatedSkeletalMass(p: {
  smi?: number | null;
  height?: number;
  weight: number;
  bodyAge?: number | null;
}) {
  if (
    p.smi == null ||
    p.height == null ||
    p.bodyAge == null ||
    p.bodyAge < 18 ||
    p.weight / (p.height / 100) ** 2 >= 35
  )
    return null;
  const mass = 1.13 * p.smi * (p.height / 100) ** 2 - 0.02 * p.bodyAge + 1.58;
  return Number.isFinite(mass) && mass > 0 && mass <= p.weight ? mass : null;
}
export function skeletalRateOf(p: {
  skeletalMass: number | null;
  skeletalRate: number | null;
  weight: number;
  height?: number;
  smi?: number | null;
  bodyAge?: number | null;
}) {
  const mass = p.skeletalMass ?? estimatedSkeletalMass(p);
  const n =
    p.skeletalRate ??
    (mass !== null && p.weight > 0 ? (mass / p.weight) * 100 : null);
  return n === null ? null : Math.round(n * 10) / 10;
}
export function ageAt(birth: string, reference: string) {
  const [y, m, d] = reference.split("-").map(Number),
    [by, bm, bd] = birth.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
export function bodyCategory(n: number | null, kind: "fat" | "skeletal") {
  if (n === null || !Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10) / 10;
  const bounds = kind === "fat" ? [9.9, 19.9, 24.9] : [32.8, 35.7, 37.3];
  return BODY_CATEGORIES[
    bounds.findIndex((x) => rounded <= x) === -1
      ? 3
      : bounds.findIndex((x) => rounded <= x)
  ];
}
export function semenGrades(s: Record<string, number | null>) {
  const meets = (limits: Record<string, number>, strict: boolean) =>
    Object.entries(limits).every(
      ([k, v]) =>
        typeof s[k] === "number" &&
        Number.isFinite(s[k]) &&
        (strict ? s[k]! > v : s[k]! >= v),
    );
  return {
    good: meets(
      {
        volume: 1.4,
        concentration: 16,
        total: 39,
        motility: 42,
        progressive: 30,
        morphology: 4,
      },
      true,
    ),
    excellent: meets(
      {
        volume: 2,
        concentration: 50,
        total: 100,
        motility: 55,
        morphology: 10,
      },
      false,
    ),
  };
}
export function iqMetrics(iq: number | null) {
  if (iq === null) return null;
  const z = (iq - 100) / 18,
    x = Math.abs(z) / Math.SQRT2,
    t = 1 / (1 + 0.3275911 * x);
  const erfc =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
    t *
    Math.exp(-x * x);
  return {
    deviation: Math.round(((iq - 25) / 1.5) * 10) / 10,
    upperPercent: (z >= 0 ? erfc / 2 : 1 - erfc / 2) * 100,
  };
}
export function normalizeProfile(raw: Record<string, any>): ProfileData {
  const { muscle, systolic, diastolic, healthDate, hereditary, ...current } =
    raw;
  return { ...emptyProfile(), ...current };
}
