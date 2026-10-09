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
  muscle: number;
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
  healthDate: string;
  systolic: number | null;
  diastolic: number | null;
  smoking: string;
  drinking: string;
  exercise: string;
  history: string;
  hereditary: string;
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
  muscle: number;
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
  healthDate: string;
  systolic: number | null;
  diastolic: number | null;
  smoking: string;
  drinking: string;
  exercise: string;
  history: string;
  hereditary: string;
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
    muscle: 30,
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
    healthDate: "",
    systolic: null,
    diastolic: null,
    smoking: "未回答",
    drinking: "未回答",
    exercise: "未回答",
    history: "未回答",
    hereditary: "未回答",
    allergy: "未回答",
    contactPolicy: "提供時のみ",
    futureInfo: "相談可",
  };
}
