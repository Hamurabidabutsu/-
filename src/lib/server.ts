import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { mailMode, deliverMail } from "./mail";
import {
  Academic,
  ProfileData,
  Donor,
  User,
  Role,
  PREFECTURES,
  WEEKDAYS,
  FREQUENCIES,
  HAIR_TEXTURES,
  EYELIDS,
  TOLERANCES,
  normalizeProfile,
  skeletalRateOf,
  bodyCategory,
  semenGrades,
  BLOOD,
  INFECTIONS,
  SEMEN_FIELDS,
  DOC_LABELS,
  emptyProfile,
  validDate,
  ageOf,
  ageAt,
  estimatedSkeletalMass,
} from "./shared";

type Row = Record<string, any>;
const demo = () => process.env.APP_MODE === "demo";
const dataDir = () =>
  path.resolve(
    process.env.DATA_DIR || (demo() ? "./data/demo" : "./data/live"),
  );
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const id = () => randomUUID();
const now = () => new Date().toISOString();
class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new Problem(status, message);
}
function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const candidate = scryptSync(password, salt, 64),
    expected = Buffer.from(key, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
let instance: DatabaseSync | undefined;
function db() {
  if (instance) return instance;
  mkdirSync(path.join(dataDir(), "uploads"), { recursive: true, mode: 0o700 });
  instance = new DatabaseSync(path.join(dataDir(), "site.sqlite"));
  instance.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,birth_date TEXT NOT NULL,display_id TEXT NOT NULL,created_at TEXT NOT NULL,last_active TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'draft',data_json TEXT NOT NULL,approved_json TEXT,verified INTEGER NOT NULL DEFAULT 0,photo_id TEXT);
    CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,data_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'payment_pending',paid INTEGER NOT NULL DEFAULT 0,payment_ref TEXT,paypal_order TEXT,created_at TEXT NOT NULL,review_started_at TEXT,review_reason TEXT);
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'requested',disclosed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(donor_id,recipient_id));
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,kind TEXT NOT NULL,file_key TEXT NOT NULL,mime TEXT NOT NULL,original_name TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,file_id TEXT REFERENCES files(id) ON DELETE SET NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,occurred_on TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_tombstones(id TEXT PRIMARY KEY,survivor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS file_gc(file_key TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS catalog(id TEXT PRIMARY KEY,kind TEXT NOT NULL,school TEXT NOT NULL,faculty TEXT NOT NULL,department TEXT NOT NULL,deviation REAL NOT NULL,year INTEGER NOT NULL,source_url TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS message_time ON messages(conversation_id,created_at);
    CREATE INDEX IF NOT EXISTS file_owner ON files(owner_id);
    CREATE INDEX IF NOT EXISTS applications_owner ON applications(user_id,created_at);
    `);
  migrate();
  const catalogFile = path.join(process.cwd(), "catalog", "current.json");
  if (existsSync(catalogFile)) {
    const imported = JSON.parse(readFileSync(catalogFile, "utf8"));
    transaction(() => {
      run("DELETE FROM catalog");
      for (const entry of imported.entries)
        run(
          "INSERT INTO catalog VALUES(?,?,?,?,?,?,?,?)",
          entry.id,
          entry.kind,
          entry.school,
          entry.faculty,
          entry.department,
          entry.deviation,
          entry.year,
          entry.source_url,
        );
    });
  }
  if (demo() && !one("SELECT id FROM users LIMIT 1")) seedDemo();
  if (
    !demo() &&
    !one("SELECT id FROM users WHERE role='admin' LIMIT 1") &&
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD
  ) {
    const email = process.env.ADMIN_EMAIL.toLowerCase().trim(),
      password = process.env.ADMIN_PASSWORD;
    if (password.length < 12)
      throw new Error("ADMIN_PASSWORDは12文字以上に設定してください。");
    run(
      "INSERT INTO users(id,email,password_hash,role,birth_date,display_id,created_at,last_active) VALUES(?,?,?,?,?,?,?,?)",
      id(),
      email,
      passwordHash(password),
      "admin",
      "1980-01-01",
      "管理者",
      now(),
      now(),
    );
  }
  cleanFiles();
  startMailWorker();
  return instance;
}
function migrate() {
  const version = Number(one("PRAGMA user_version")?.user_version || 0);
  if (version >= 2) return;
  transaction(() => {
    const columns = all("PRAGMA table_info(users)").map((x) => x.name);
    if (!columns.includes("email_verified"))
      run(
        "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
      );
    if (!columns.includes("email_notifications"))
      run(
        "ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1",
      );
    db()
      .exec(`CREATE TABLE IF NOT EXISTS email_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,email TEXT NOT NULL,expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mail_queue(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,kind TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);`);
    for (const row of all("SELECT * FROM profiles")) {
      const normalize = (json: string | null) => {
        if (!json) return null;
        const raw = JSON.parse(json),
          p = normalizeProfile(raw);
        if (raw.hereditary && raw.hereditary !== "未回答")
          p.history =
            `${p.history || ""}\n旧形式の遺伝性疾患申告：${raw.hereditary}`.trim();
        if (/^demo_donor[123]$/.test(row.user_id) && raw.muscle !== undefined)
          p.skeletalRate = [36.2, 34.1, 38.5][
            Number(row.user_id.slice(-1)) - 1
          ];
        return JSON.stringify(p);
      };
      run(
        "UPDATE profiles SET data_json=?,approved_json=? WHERE user_id=?",
        normalize(row.data_json),
        normalize(row.approved_json),
        row.user_id,
      );
    }
    for (const row of all("SELECT id,data_json FROM applications"))
      run(
        "UPDATE applications SET data_json=? WHERE id=?",
        JSON.stringify(normalizeProfile(JSON.parse(row.data_json))),
        row.id,
      );
    run(
      "UPDATE users SET email_verified=1 WHERE id LIKE 'demo_%' AND email LIKE '%@example.test'",
    );
    db().exec("PRAGMA user_version=2");
  });
}
let mailFlushing = false;
async function flushMail() {
  if (mailFlushing || mailMode() !== "smtp") return;
  mailFlushing = true;
  try {
    for (let batch = 0; batch < 4; batch++) {
      const pending = all(
        "SELECT * FROM mail_queue WHERE status='queued' AND next_attempt<=? ORDER BY created_at LIMIT 30",
        Date.now(),
      );
      if (!pending.length) break;
      for (const item of pending) {
        const user = one("SELECT * FROM users WHERE id=?", item.user_id);
        const chat = item.conversation_id
          ? one(
              "SELECT status FROM conversations WHERE id=?",
              item.conversation_id,
            )
          : null;
        if (
          !user ||
          (item.kind !== "verify" &&
            (!user.email_verified ||
              !user.email_notifications ||
              !chat ||
              !["accepted", "requested"].includes(chat.status)))
        ) {
          run("DELETE FROM mail_queue WHERE id=?", item.id);
          continue;
        }
        if (
          item.kind === "verify" &&
          !one(
            "SELECT token_hash FROM email_tokens WHERE user_id=? AND email=? AND expires_at>?",
            user.id,
            user.email,
            now(),
          )
        ) {
          run("DELETE FROM mail_queue WHERE id=?", item.id);
          continue;
        }
        try {
          await deliverMail(user.email, item.subject, item.body);
          run("DELETE FROM mail_queue WHERE id=?", item.id);
        } catch {
          const attempts = item.attempts + 1;
          run(
            "UPDATE mail_queue SET attempts=?,next_attempt=?,status=? WHERE id=?",
            attempts,
            Date.now() + Math.min(3600000, 60000 * 2 ** attempts),
            attempts >= 5 ? "failed" : "queued",
            item.id,
          );
        }
      }
    }
  } finally {
    mailFlushing = false;
  }
}
function enqueueMail(
  uid: string,
  kind: string,
  subject: string,
  content: string,
  conversationId: string | null = null,
) {
  if (mailMode() === "unconfigured") return;
  const user = one("SELECT * FROM users WHERE id=?", uid);
  if (
    !user ||
    (kind !== "verify" && (!user.email_verified || !user.email_notifications))
  )
    return;
  run(
    "INSERT INTO mail_queue(id,user_id,conversation_id,kind,subject,body,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
    id(),
    uid,
    conversationId,
    kind,
    subject,
    content,
    mailMode() === "preview" ? "preview" : "queued",
    now(),
  );
  void flushMail();
}
function verifyEmail(user: Row) {
  if (mailMode() === "unconfigured")
    fail(503, "メール送信が未設定です。運営者にお問い合わせください。");
  rate("verify-email:" + user.id, 3, 3600000);
  const token = randomBytes(32).toString("hex");
  transaction(() => {
    run("DELETE FROM email_tokens WHERE user_id=?", user.id);
    run("DELETE FROM mail_queue WHERE user_id=? AND kind='verify'", user.id);
    run(
      "INSERT INTO email_tokens VALUES(?,?,?,?)",
      hash(token),
      user.id,
      user.email,
      new Date(Date.now() + 86400000).toISOString(),
    );
    enqueueMail(
      user.id,
      "verify",
      "コウノトリのつばさ：メールアドレスの確認",
      `登録メールアドレスを確認してください。リンクは24時間有効です。\n${siteUrl()}/verify-email?token=${token}\n心当たりがなければ、このメールを破棄してください。`,
    );
  });
}
function siteUrl() {
  return (process.env.SITE_URL || "").replace(/\/$/, "");
}
function chatMail(uid: string, cid: string, kind: string) {
  const label =
    kind === "request"
      ? "会話の申請が届きました"
      : kind === "accept"
        ? "会話の申請が承認されました"
        : "新しいメッセージが届きました";
  enqueueMail(
    uid,
    kind,
    `コウノトリのつばさ：${label}`,
    `${label}。ログインして確認してください。\n${siteUrl()}/chat?conversation=${cid}\n通知設定はアカウント画面から変更できます。`,
    cid,
  );
}
let mailTimer: ReturnType<typeof setInterval> | undefined;
function startMailWorker() {
  if (mailTimer || mailMode() !== "smtp") return;
  mailTimer = setInterval(() => {
    void flushMail();
  }, 60000);
  mailTimer.unref();
  void flushMail();
}

function one(sql: string, ...params: any[]): Row | undefined {
  return db()
    .prepare(sql)
    .get(...params) as Row | undefined;
}
function all(sql: string, ...params: any[]): Row[] {
  return db()
    .prepare(sql)
    .all(...params) as Row[];
}
function run(sql: string, ...params: any[]) {
  return db()
    .prepare(sql)
    .run(...params);
}
function transaction<T>(fn: () => T): T {
  db().exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db().exec("COMMIT");
    return result;
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}
function cleanFiles() {
  for (const file of all("SELECT file_key FROM file_gc")) {
    try {
      const p = path.join(dataDir(), "uploads", file.file_key);
      if (existsSync(p)) unlinkSync(p);
      run("DELETE FROM file_gc WHERE file_key=?", file.file_key);
    } catch {
      /* Keep only the random storage key for a retry; never expose the file. */
    }
  }
}
function deleteDocuments(applicationId: string) {
  for (const file of all(
    "SELECT file_key FROM files WHERE application_id=?",
    applicationId,
  ))
    run("INSERT OR IGNORE INTO file_gc VALUES(?)", file.file_key);
  run("DELETE FROM files WHERE application_id=?", applicationId);
}
function seedDemo() {
  const users = [
    ["demo_admin", "admin@example.test", "admin", "1980-01-01", "管理者"],
    [
      "demo_recipient",
      "recipient@example.test",
      "recipient",
      "1992-05-10",
      "R-0001",
    ],
    ["demo_donor1", "donor1@example.test", "donor", "1991-06-12", "D-0001"],
    ["demo_donor2", "donor2@example.test", "donor", "1987-03-22", "D-0002"],
    ["demo_donor3", "donor3@example.test", "donor", "1996-11-08", "D-0003"],
  ];
  for (const u of users)
    run(
      "INSERT INTO users(id,email,password_hash,role,birth_date,display_id,created_at,last_active) VALUES(?,?,?,?,?,?,?,?)",
      u[0],
      u[1],
      passwordHash(randomBytes(24).toString("hex")),
      u[2],
      u[3],
      u[4],
      now(),
      now(),
    );
  run("UPDATE users SET email_verified=1 WHERE id LIKE 'demo_%'");
  const date = now().slice(0, 10);
  for (let i = 1; i <= 3; i++) {
    const p = emptyProfile();
    Object.assign(p, {
      height: [178, 173, 182][i - 1],
      weight: [72, 66, 78][i - 1],
      bodyFat: [16.5, 19.2, 14.8][i - 1],
      skeletalRate: [36.2, 34.1, 38.5][i - 1],
      hairTexture: "直毛・柔毛",
      eyelid: "二重",
      visionLeft: 1,
      visionRight: 1,
      bodyDate: date,
      blood: ["A", "O", "B"][i - 1],
      residence: ["東京都", "神奈川県", "大阪府"][i - 1],
      weekdays: i === 2 ? ["土", "日", "祝"] : ["月", "水", "土", "祝"],
      frequency: 2 + i,
      extraFrequency: 2,
      semenDate: date,
      semen: {
        volume: 3.2,
        concentration: 68 + i * 6,
        total: 240 + i * 20,
        motility: 65 + i * 3,
        progressive: 45 + i * 2,
        morphology: 8 + i,
      },
      infectionDate: i === 3 ? "" : date,
      infections: Object.fromEntries(
        INFECTIONS.map((x) => [x, i === 3 ? "未検査・未提出" : "陰性"]),
      ),

      smoking: "吸わない",
      drinking: "週2日",
      exercise: "週3日",
      history: "なし",
      familyHistory: "なし",
      allergy: "なし",
      contactPolicy: "妊娠結果まで",
      futureInfo: "対応可",
      academics: [
        {
          kind: "wais",
          catalogId: "",
          school: "",
          faculty: "",
          department: "",
          iq: [123, 118, 130][i - 1],
        },
      ],
    });
    p.normalRegions = [{ prefecture: p.residence, area: "全域" }];
    p.travelRegions =
      i === 3
        ? [
            { prefecture: "京都府", area: "中心部" },
            { prefecture: "兵庫県", area: "全域" },
          ]
        : [
            { prefecture: "埼玉県", area: "全域" },
            { prefecture: "千葉県", area: "中心部" },
          ];
    run(
      "INSERT INTO profiles VALUES(?,?,?,?,?,NULL)",
      "demo_donor" + i,
      "approved",
      JSON.stringify(p),
      JSON.stringify(p),
      1,
    );
  }
}
function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
function publicUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayId: row.display_id,
    birthDate: row.birth_date,
    emailVerified: !!row.email_verified,
    emailNotifications: !!row.email_notifications,
  };
}
function sessionUser(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("kt_session="))
    ?.slice(11);
  if (!token || token.length > 200) return undefined;
  const row = one(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    hash(token),
    now(),
  );
  if (row) run("UPDATE users SET last_active=? WHERE id=?", now(), row.id);
  return row;
}
function needUser(req: Request, role?: Role) {
  const user = sessionUser(req);
  if (!user) fail(401, "ログインしてください。");
  if (role && user.role !== role) fail(403, "この操作を行う権限がありません。");
  return user;
}
function sessionCookie(
  token: string,
  req: Request,
  maxAge = 60 * 60 * 24 * 30,
) {
  const secure = new URL(process.env.SITE_URL || req.url).protocol === "https:";
  return `kt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function loginResponse(user: Row, req: Request) {
  const token = randomBytes(32).toString("base64url");
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash(token),
    user.id,
    new Date(Date.now() + 30 * 86400000).toISOString(),
  );
  return json({ user: publicUser(user) }, 200, {
    "Set-Cookie": sessionCookie(token, req),
  });
}
function rate(key: string, limit: number, windowMs: number) {
  const time = Date.now(),
    k = hash(key),
    r = one("SELECT * FROM rate_limits WHERE key=?", k);
  if (!r || r.expires_at < time)
    run(
      "INSERT OR REPLACE INTO rate_limits VALUES(?,?,?)",
      k,
      1,
      time + windowMs,
    );
  else {
    if (r.hits >= limit)
      fail(429, "試行回数が多いため、しばらく待ってからお試しください。");
    run("UPDATE rate_limits SET hits=hits+1 WHERE key=?", k);
  }
}
async function bounded(req: Request, max: number) {
  if (Number(req.headers.get("content-length") || 0) > max)
    fail(413, "送信データが大きすぎます。");
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      fail(413, "送信データが大きすぎます。");
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
async function body(req: Request): Promise<Row> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    fail(415, "JSON形式で送信してください。");
  try {
    const value = JSON.parse((await bounded(req, 128000)).toString());
    if (!value || Array.isArray(value) || typeof value !== "object")
      fail(400, "入力形式が不正です。");
    return value;
  } catch (e) {
    if (e instanceof Problem) throw e;
    return fail(400, "入力形式が不正です。");
  }
}
function choice(value: any, choices: string[], label: string) {
  if (typeof value !== "string" || !choices.includes(value))
    fail(400, label + "を選択してください。");
  return value;
}
function numeric(
  value: any,
  min: number,
  max: number,
  label: string,
  optional = false,
): number | null {
  if (optional && (value === null || value === undefined || value === ""))
    return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(400, label + "の値を確認してください。");
  return value;
}
function text(value: any, max = 120) {
  if (typeof value !== "string" || value.length > max)
    fail(400, "入力文字数を確認してください。");
  return value.trim();
}
function date(value: any, required = false) {
  if (!value && !required) return "";
  if (
    typeof value !== "string" ||
    !validDate(value) ||
    value > now().slice(0, 10)
  )
    fail(400, "日付を確認してください。");
  return value;
}
function choices(value: any, options: string[]): string[] {
  if (!Array.isArray(value) || value.length > options.length)
    fail(400, "選択項目を確認してください。");
  return [...new Set(value.map((x: unknown) => choice(x, options, "項目")))];
}
function regions(value: any) {
  if (!Array.isArray(value) || value.length > 94)
    fail(400, "地域の指定を確認してください。");
  const seen = new Set();
  return value.map((v: Row) => {
    const r = {
      prefecture: choice(v?.prefecture, PREFECTURES, "都道府県"),
      area: choice(v?.area, ["全域", "中心部"], "範囲") as "全域" | "中心部",
    };
    const k = r.prefecture + r.area;
    if (seen.has(k)) fail(400, "地域の指定が重複しています。");
    seen.add(k);
    return r;
  });
}
function profileData(
  input: Row,
  previous: ProfileData | undefined,
  birthDate: string,
): ProfileData {
  const p = emptyProfile();
  for (const [key, min, max, label] of [
    ["height", 100, 250, "身長"],
    ["weight", 25, 300, "体重"],
    ["bodyFat", 1, 75, "体脂肪率"],
  ] as const)
    p[key] = numeric(input[key], min, max, label)!;
  p.skeletalMass = numeric(
    input.skeletalMass,
    1,
    p.weight,
    "全身の骨格筋量",
    true,
  );
  p.skeletalRate = numeric(input.skeletalRate, 1, 100, "骨格筋率", true);
  p.smi = numeric(input.smi, 0.1, 30, "四肢由来のSMI", true);
  if (
    [p.skeletalMass, p.skeletalRate, p.smi].filter((x) => x !== null).length !==
    1
  )
    fail(
      400,
      "全身の骨格筋量・骨格筋率・四肢由来SMIのいずれか1つだけを入力してください。",
    );
  p.visionLeft = numeric(input.visionLeft, 0, 3, "左目の裸眼視力", true);
  p.visionRight = numeric(input.visionRight, 0, 3, "右目の裸眼視力", true);
  p.hairTexture = choice(input.hairTexture || "未回答", HAIR_TEXTURES, "髪質");
  p.eyelid = choice(input.eyelid || "未回答", EYELIDS, "まぶた");
  p.bodyDate = date(input.bodyDate, true);
  p.bodyAge = p.smi !== null ? ageAt(birthDate, p.bodyDate) : null;
  if (p.smi !== null && estimatedSkeletalMass(p) === null)
    fail(
      400,
      "SMIによる概算は測定時18歳以上・BMI35未満が対象です。値や単位を確認するか、骨格筋量・骨格筋率を登録してください。",
    );
  p.hair = text(input.hair || "", 80);
  p.blood = choice(input.blood, BLOOD, "血液型");
  p.residence = choice(input.residence, PREFECTURES, "居住都道府県");
  p.methods = choices(input.methods, ["シリンジ法", "タイミング法"]);
  if (!p.methods.length) fail(400, "提供方法を1つ以上選択してください。");
  p.weekdays = choices(input.weekdays, WEEKDAYS);
  if (!p.weekdays.length) fail(400, "提供可能な曜日を選択してください。");
  p.frequencyPeriod = choice(
    input.frequencyPeriod,
    ["月", "年"],
    "頻度の単位",
  ) as "月" | "年";
  p.frequency = numeric(input.frequency, 1, 365, "提供回数")!;
  p.extraFrequency = numeric(input.extraFrequency, 0, 365, "追加回数")!;
  if (!Number.isInteger(p.frequency) || !Number.isInteger(p.extraFrequency))
    fail(400, "回数は整数で入力してください。");
  p.normalRegions = regions(input.normalRegions);
  p.travelRegions = regions(input.travelRegions);
  if (!p.normalRegions.length && !p.travelRegions.length)
    fail(400, "提供可能な地域を指定してください。");
  if (
    !Array.isArray(input.academics) ||
    !input.academics.length ||
    input.academics.length > 3
  )
    fail(400, "高校・大学の卒業証明またはWAISのうち、最低1つが必要です。");
  const kinds = new Set();
  p.academics = input.academics.map((a: Row) => {
    const kind = choice(
      a.kind,
      ["highschool", "university", "wais"],
      "学歴・検査",
    ) as Academic["kind"];
    if (kinds.has(kind)) fail(400, "同じ種類の学歴・検査は1つまでです。");
    kinds.add(kind);
    const r: Academic = {
      kind,
      catalogId: "",
      school: "",
      faculty: "",
      department: "",
      iq: null,
    };
    if (kind === "wais") r.iq = numeric(a.iq, 40, 200, "WAIS全検査IQ")!;
    else {
      const entry = a.catalogId
        ? one(
            "SELECT * FROM catalog WHERE id=? AND kind=?",
            text(a.catalogId),
            kind,
          )
        : undefined;
      if (entry) {
        Object.assign(r, {
          catalogId: entry.id,
          school: entry.school,
          faculty: entry.faculty,
          department: entry.department,
          deviation: entry.deviation,
          year: entry.year,
        });
      } else {
        r.school = text(a.school);
        r.faculty = text(a.faculty || "");
        r.department = text(a.department || "");
        if (!r.school || !r.department || (kind === "university" && !r.faculty))
          fail(400, "学校・学部・学科名を入力してください。");
      }
    }
    const trusted = previous?.academics.find(
      (old) =>
        old.kind === r.kind &&
        old.school === r.school &&
        old.faculty === r.faculty &&
        old.department === r.department &&
        old.catalogId === r.catalogId,
    );
    if (r.kind !== "wais" && trusted?.deviation !== undefined && !r.deviation) {
      r.deviation = trusted.deviation;
      if (trusted.year) r.year = trusted.year;
    }
    return r;
  });
  p.semenDate = date(input.semenDate, true);
  p.semen = {};
  for (const f of SEMEN_FIELDS)
    p.semen[f.key] = numeric(
      input.semen?.[f.key],
      0,
      ["motility", "progressive", "morphology"].includes(f.key) ? 100 : 100000,
      f.label,
      true,
    );
  if (Object.values(p.semen).every((x) => x === null))
    fail(400, "精液検査の数値を1つ以上入力してください。");
  p.infectionDate = date(input.infectionDate);
  p.infections = {};
  for (const name of INFECTIONS)
    p.infections[name] = choice(
      input.infections?.[name] || "未検査・未提出",
      ["未検査・未提出", "陰性", "陽性", "判定保留"],
      name,
    );
  if (
    Object.values(p.infections).some((x) => x !== "未検査・未提出") &&
    !p.infectionDate
  )
    fail(400, "感染症の検査日を入力してください。");
  const frequency = (
    key: "smoking" | "drinking" | "exercise",
    extra: string[],
  ) => {
    const options = [...FREQUENCIES, ...extra];
    if (
      previous &&
      !options.includes(previous[key]) &&
      input[key] === previous[key]
    )
      return previous[key];
    return choice(input[key], options, key);
  };
  p.smoking = frequency("smoking", ["吸わない", "過去に喫煙"]);
  p.drinking = frequency("drinking", ["飲まない"]);
  p.exercise = frequency("exercise", []);
  p.smokingAmount = numeric(input.smokingAmount, 0, 200, "喫煙日の本数", true);
  if (p.smokingAmount !== null && !Number.isInteger(p.smokingAmount))
    fail(400, "喫煙本数は整数で入力してください。");
  p.drinkingAmount = numeric(
    input.drinkingAmount,
    0,
    1000,
    "飲酒1回の純アルコール量",
    true,
  );
  p.alcoholTolerance = choice(
    input.alcoholTolerance || "不明",
    TOLERANCES,
    "アルコール耐性",
  );
  for (const k of ["history", "familyHistory", "allergy"] as const)
    p[k] = text(input[k] || "", 1000);
  p.contactPolicy = choice(
    input.contactPolicy,
    ["提供時のみ", "妊娠結果まで", "出産後も相談可"],
    "提供後の連絡",
  );
  p.futureInfo = choice(
    input.futureInfo,
    ["対応可", "相談可", "対応不可"],
    "将来の情報提供",
  );
  return p;
}
function iqOf(p: ProfileData) {
  const values = p.academics
    .map((a) =>
      a.kind === "wais"
        ? a.iq
        : typeof a.deviation === "number"
          ? a.deviation * 1.5 + 25
          : null,
    )
    .filter((v): v is number => typeof v === "number");
  return values.length ? Math.max(...values) : null;
}
function donor(row: Row, viewer?: Row): Donor {
  const p = normalizeProfile(JSON.parse(row.approved_json));
  const granted =
    viewer &&
    (viewer.id === row.id ||
      viewer.role === "admin" ||
      one(
        "SELECT id FROM conversations WHERE donor_id=? AND recipient_id=? AND disclosed=1 AND status='accepted'",
        row.id,
        viewer.id,
      ));
  const counts = one(
    "SELECT SUM(CASE WHEN kind='donation' THEN 1 ELSE 0 END) donations,SUM(CASE WHEN kind='birth' THEN 1 ELSE 0 END) births FROM events WHERE donor_id=? AND status='confirmed'",
    row.id,
  );
  const { academics, smi, bodyAge, ...publicData } = p;
  return {
    ...publicData,
    skeletalRate: skeletalRateOf(p),
    skeletalEstimated: smi !== null,
    id: row.id,
    displayId: row.display_id,
    age: ageOf(row.birth_date),
    verified: !!row.verified,
    hasPhoto: !!row.photo_id,
    recentlyActive:
      new Date(row.last_active).getTime() > Date.now() - 7 * 86400000,
    iq: iqOf(p),
    donationCount: counts?.donations || 0,
    birthCount: counts?.births || 0,
    ...(granted
      ? { privateInfo: { academics, photoId: row.photo_id || null } }
      : {}),
  };
}
function conversation(chatId: string, user: Row) {
  const c = one("SELECT * FROM conversations WHERE id=?", chatId);
  if (
    !c ||
    (user.role !== "admin" &&
      c.donor_id !== user.id &&
      c.recipient_id !== user.id)
  )
    fail(404, "会話が見つかりません。");
  return c;
}
function checkFileAccess(file: Row, user: Row) {
  if (user.role === "admin") return;
  if (file.kind === "chat") {
    const c = conversation(file.conversation_id, user);
    if (c.status !== "accepted") fail(403, "会話の承認が必要です。");
    return;
  }
  if (file.owner_id === user.id) return;
  if (
    file.kind === "photo" &&
    one(
      "SELECT id FROM conversations WHERE donor_id=? AND recipient_id=? AND status='accepted' AND disclosed=1",
      file.owner_id,
      user.id,
    )
  )
    return;
  fail(404, "ファイルが見つかりません。");
}
const protectedFields = [
  "height",
  "weight",
  "bodyFat",
  "skeletalMass",
  "skeletalRate",
  "smi",
  "bodyAge",
  "bodyDate",
  "blood",
  "academics",
  "semen",
  "semenDate",
  "infections",
  "infectionDate",
];
function equalFields(a: Row, b: Row, keys: string[]) {
  return keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
function ensureDocuments(
  p: ProfileData,
  user: Row,
  fileIds: string[],
  previous?: ProfileData,
) {
  const files = fileIds.map((fid) => {
    const f = one(
      "SELECT * FROM files WHERE id=? AND owner_id=? AND application_id IS NULL AND conversation_id IS NULL",
      fid,
      user.id,
    );
    if (!f || !DOC_LABELS[f.kind]) fail(400, "提出書類を確認してください。");
    return f;
  });
  const has = (kind: string) => files.some((f) => f.kind === kind);
  const requireDoc = (kind: string) => {
    if (!has(kind)) fail(400, DOC_LABELS[kind] + "を添付してください。");
  };
  if (!one("SELECT verified FROM profiles WHERE user_id=?", user.id)?.verified)
    requireDoc("identity");
  if (!previous || !equalFields(p, previous, ["academics"]))
    for (const a of p.academics) requireDoc(a.kind);
  if (
    !previous ||
    !equalFields(p, previous, [
      "height",
      "weight",
      "bodyFat",
      "skeletalMass",
      "skeletalRate",
      "smi",
      "bodyAge",
      "bodyDate",
    ])
  )
    requireDoc("body");
  if (!previous || !equalFields(p, previous, ["semen", "semenDate"]))
    requireDoc("semen");
  if (
    Object.values(p.infections).some((x) => x !== "未検査・未提出") &&
    (!previous || !equalFields(p, previous, ["infections", "infectionDate"]))
  )
    requireDoc("infection");
  return files;
}
let paypalToken: { value: string; expires: number } | undefined;
function paypalBase() {
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}
async function paypal(
  pathname: string,
  method: string,
  payload?: unknown,
  requestId?: string,
) {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
    fail(503, "PayPalの接続設定が必要です。支払いは実行されていません。");
  if (!paypalToken || paypalToken.expires < Date.now()) {
    const res = await fetch(paypalBase() + "/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.PAYPAL_CLIENT_ID +
              ":" +
              process.env.PAYPAL_CLIENT_SECRET,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok)
      fail(502, "決済サービスに接続できません。課金は確認されていません。");
    const token = await res.json();
    paypalToken = {
      value: token.access_token,
      expires: Date.now() + (Number(token.expires_in) - 60) * 1000,
    };
  }
  const res = await fetch(paypalBase() + pathname, {
    method,
    headers: {
      Authorization: "Bearer " + paypalToken.value,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (!res.ok)
    fail(
      502,
      "決済サービスで処理を完了できませんでした。再度確認してください。",
    );
  return data;
}
export function verifiedCapture(data: Row, applicationId: string) {
  const unit = data.purchase_units?.find(
    (u: Row) => u.custom_id === applicationId,
  );
  const captures = unit?.payments?.captures || [];
  const capture = captures.find(
    (c: Row) =>
      c.status === "COMPLETED" &&
      c.amount?.currency_code === "JPY" &&
      Number(c.amount?.value) === 5000,
  );
  if (data.status !== "COMPLETED" || !capture || captures.length !== 1)
    fail(
      409,
      "5,000円の決済完了を確認できませんでした。審査は開始されていません。",
    );
  return capture.id as string;
}
export async function handle(req: Request, parts: string[]) {
  try {
    const method = req.method,
      key = parts.join("/");
    if (!["GET", "HEAD"].includes(method)) {
      const origin = req.headers.get("origin"),
        expected = new URL(process.env.SITE_URL || req.url).origin;
      if (
        (origin && origin !== expected) ||
        req.headers.get("sec-fetch-site") === "cross-site"
      )
        fail(403, "別のサイトからの操作は受け付けられません。");
    }
    if (key === "health" && method === "GET")
      return json({
        ok: true,
        mode: demo() ? "demo" : "live",
        paymentMode: process.env.PAYMENT_MODE || "paypal",
        paypalConfigured: !!(
          process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
        ),
      });
    if (key === "me" && method === "GET") {
      const u = sessionUser(req);
      return json({
        user: u ? publicUser(u) : null,
        demo: demo(),
        mailMode: mailMode(),
        paymentMode: process.env.PAYMENT_MODE || "paypal",
      });
    }
    if (key === "auth/demo" && method === "POST") {
      if (!demo()) fail(404, "この操作は利用できません。");
      const b = await body(req);
      const uid = {
        donor: "demo_donor1",
        recipient: "demo_recipient",
        admin: "demo_admin",
      }[b.role as Role];
      if (!uid) fail(400, "役割を選択してください。");
      return loginResponse(one("SELECT * FROM users WHERE id=?", uid)!, req);
    }
    if (key === "auth/signup" && method === "POST") {
      const b = await body(req),
        email = text(b.email, 254).toLowerCase(),
        password = text(b.password, 128),
        role = choice(b.role, ["donor", "recipient"], "利用区分"),
        birth = date(b.birthDate, true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, "メールアドレスを確認してください。");
      if (password.length < 10)
        fail(400, "パスワードは10文字以上で設定してください。");
      if (ageOf(birth) < 18)
        fail(400, "18歳以上の方が登録できます。生年月日を確認してください。");
      if (b.agreed !== true)
        fail(400, "利用規約と情報の取り扱いへの同意が必要です。");
      rate(
        "signup:" + (req.headers.get("x-forwarded-for") || "local"),
        30,
        3600000,
      );
      if (one("SELECT id FROM users WHERE email=?", email))
        fail(409, "このメールアドレスは登録されています。");
      const uid = id(),
        display =
          (role === "donor" ? "D-" : "R-") +
          randomBytes(3).toString("hex").toUpperCase();
      transaction(() => {
        run(
          "INSERT INTO users(id,email,password_hash,role,birth_date,display_id,created_at,last_active) VALUES(?,?,?,?,?,?,?,?)",
          uid,
          email,
          passwordHash(password),
          role,
          birth,
          display,
          now(),
          now(),
        );
        if (role === "donor")
          run(
            "INSERT INTO profiles VALUES(?,?,?,?,?,NULL)",
            uid,
            "draft",
            JSON.stringify(emptyProfile()),
            null,
            0,
          );
      });
      const created = one("SELECT * FROM users WHERE id=?", uid)!;
      if (mailMode() !== "unconfigured") verifyEmail(created);
      return loginResponse(created, req);
    }
    if (key === "auth/verify-email" && method === "POST") {
      const b = await body(req),
        token = text(b.token, 64);
      if (!/^[a-f0-9]{64}$/.test(token)) fail(400, "確認リンクが無効です。");
      const item = one(
        "SELECT * FROM email_tokens WHERE token_hash=? AND expires_at>?",
        hash(token),
        now(),
      );
      if (!item)
        fail(400, "確認リンクが無効か期限切れです。再送してください。");
      transaction(() => {
        run(
          "UPDATE users SET email_verified=1 WHERE id=? AND email=?",
          item.user_id,
          item.email,
        );
        run("DELETE FROM email_tokens WHERE user_id=?", item.user_id);
        run(
          "DELETE FROM mail_queue WHERE user_id=? AND kind='verify'",
          item.user_id,
        );
      });
      return json({ ok: true });
    }
    if (key === "account/email-verification" && method === "POST") {
      const u = needUser(req);
      if (!u.email_verified) verifyEmail(u);
      return json({ ok: true, mailMode: mailMode() });
    }
    if (key === "account/settings" && method === "PATCH") {
      const u = needUser(req),
        b = await body(req);
      if (typeof b.emailNotifications !== "boolean")
        fail(400, "通知設定を確認してください。");
      transaction(() => {
        run(
          "UPDATE users SET email_notifications=? WHERE id=?",
          Number(b.emailNotifications),
          u.id,
        );
        if (!b.emailNotifications)
          run(
            "DELETE FROM mail_queue WHERE user_id=? AND kind!='verify'",
            u.id,
          );
      });
      return json({ ok: true });
    }
    if (key === "account/mail-preview" && method === "GET") {
      const u = needUser(req);
      if (!demo() || mailMode() !== "preview")
        fail(404, "この操作は利用できません。");
      return json({
        mails: all(
          "SELECT id,subject,body,created_at FROM mail_queue WHERE user_id=? AND status='preview' ORDER BY created_at DESC LIMIT 20",
          u.id,
        ),
      });
    }
    if (key === "auth/login" && method === "POST") {
      const b = await body(req),
        email = text(b.email, 254).toLowerCase(),
        password = text(b.password, 128);
      rate("login:" + email, 10, 900000);
      const u = one("SELECT * FROM users WHERE email=?", email);
      const matches = passwordMatches(
        password,
        u?.password_hash ||
          "0123456789abcdef0123456789abcdef:" + "00".repeat(64),
      );
      if (!u || !matches)
        fail(401, "メールアドレスまたはパスワードが正しくありません。");
      return loginResponse(u, req);
    }
    if (key === "auth/logout" && method === "POST") {
      const u = needUser(req);
      const token = req.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)kt_session=([^;]+)/)?.[1];
      if (token)
        run(
          "DELETE FROM sessions WHERE token_hash=? AND user_id=?",
          hash(token),
          u.id,
        );
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie("", req, 0),
      });
    }
    if (key === "catalog" && method === "GET") {
      const url = new URL(req.url),
        query = (url.searchParams.get("q") || "").slice(0, 80),
        kind = url.searchParams.get("kind");
      const rows = all(
        "SELECT * FROM catalog WHERE (? IS NULL OR kind=?) AND (school LIKE ? OR department LIKE ?) ORDER BY school,faculty,department LIMIT 80",
        kind,
        kind,
        "%" + query + "%",
        "%" + query + "%",
      );
      return json({ entries: rows });
    }
    if (key === "donors" && method === "GET") {
      const u = sessionUser(req),
        url = new URL(req.url),
        pref = url.searchParams.get("prefecture"),
        blood = url.searchParams.get("blood"),
        methodFilter = url.searchParams.get("method"),
        weekday = url.searchParams.get("weekday");
      let rows = all(
        "SELECT u.*,p.* FROM users u JOIN profiles p ON p.user_id=u.id WHERE p.status='approved' AND p.approved_json IS NOT NULL",
      ).map((r) => donor(r, u));
      if (pref)
        rows = rows.filter((d) =>
          d.normalRegions
            .concat(d.travelRegions)
            .some((r) => r.prefecture === pref),
        );
      if (blood) rows = rows.filter((d) => d.blood === blood);
      if (methodFilter)
        rows = rows.filter((d) => d.methods.includes(methodFilter));
      if (weekday) rows = rows.filter((d) => d.weekdays.includes(weekday));
      for (const [param, field] of [
        ["minAge", "age"],
        ["minHeight", "height"],
        ["minIq", "iq"],
      ] as const) {
        const val = url.searchParams.get(param);
        if (val)
          rows = rows.filter(
            (d) => d[field] !== null && Number(d[field]) >= Number(val),
          );
      }
      const max = url.searchParams.get("maxAge");
      if (max) rows = rows.filter((d) => d.age <= Number(max));
      if (url.searchParams.get("infectionVerified") === "1")
        rows = rows.filter((d) =>
          INFECTIONS.every((k) => d.infections[k] === "陰性"),
        );
      const fat = url.searchParams.get("bodyFatCategory"),
        skeletal = url.searchParams.get("skeletalCategory"),
        grade = url.searchParams.get("semenGrade");
      if (fat)
        rows = rows.filter((d) => bodyCategory(d.bodyFat, "fat") === fat);
      if (skeletal)
        rows = rows.filter(
          (d) => bodyCategory(skeletalRateOf(d), "skeletal") === skeletal,
        );
      if (grade)
        rows = rows.filter((d) =>
          grade === "良"
            ? semenGrades(d.semen).good
            : grade === "秀" && semenGrades(d.semen).excellent,
        );
      if (url.searchParams.get("sort") === "height")
        rows.sort((a, b) => b.height - a.height);
      else if (url.searchParams.get("sort") === "iq")
        rows.sort(
          (a, b) =>
            (b.iq ?? -Infinity) - (a.iq ?? -Infinity) ||
            a.displayId.localeCompare(b.displayId),
        );
      else if (url.searchParams.get("sort") === "age")
        rows.sort((a, b) => a.age - b.age);
      else
        rows.sort(
          (a, b) =>
            Number(b.recentlyActive) - Number(a.recentlyActive) ||
            a.displayId.localeCompare(b.displayId),
        );
      return json({ donors: rows });
    }
    if (parts[0] === "donors" && parts.length === 2 && method === "GET") {
      const u = sessionUser(req),
        r = one(
          "SELECT u.*,p.* FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=? AND p.approved_json IS NOT NULL",
          parts[1],
        );
      if (
        !r ||
        (r.status !== "approved" && u?.id !== r.id && u?.role !== "admin")
      )
        fail(404, "提供者が見つかりません。");
      return json({ donor: donor(r, u) });
    }
    if (key === "profile" && method === "GET") {
      const u = needUser(req, "donor"),
        p = one("SELECT * FROM profiles WHERE user_id=?", u.id)!;
      return json({
        profile: normalizeProfile(JSON.parse(p.data_json)),
        approved: p.approved_json
          ? normalizeProfile(JSON.parse(p.approved_json))
          : null,
        status: p.status,
        verified: !!p.verified,
        photoId: p.photo_id,
        documents: all(
          "SELECT id,kind,original_name FROM files WHERE owner_id=? AND application_id IS NULL AND kind NOT IN ('photo','chat')",
          u.id,
        ),
        applications: all(
          "SELECT id,kind,status,paid,created_at,review_reason FROM applications WHERE user_id=? ORDER BY created_at DESC",
          u.id,
        ),
      });
    }
    if (key === "profile" && method === "PATCH") {
      const u = needUser(req, "donor"),
        b = await body(req),
        current = one("SELECT * FROM profiles WHERE user_id=?", u.id)!,
        p = profileData(
          b.profile,
          current.approved_json ? JSON.parse(current.approved_json) : undefined,
          u.birth_date,
        );
      if (b.publish === true) {
        if (!current.approved_json) fail(409, "先に登録審査を受けてください。");
        const old = JSON.parse(current.approved_json);
        if (!equalFields(p, old, protectedFields))
          fail(409, "証明情報の変更には有料の更新審査が必要です。");
        run(
          "UPDATE profiles SET data_json=?,approved_json=? WHERE user_id=?",
          JSON.stringify(p),
          JSON.stringify(p),
          u.id,
        );
      } else
        run(
          "UPDATE profiles SET data_json=? WHERE user_id=?",
          JSON.stringify(p),
          u.id,
        );
      return json({ ok: true });
    }
    if (key === "profile/availability" && method === "POST") {
      const u = needUser(req, "donor"),
        b = await body(req),
        p = one("SELECT * FROM profiles WHERE user_id=?", u.id);
      if (!p?.approved_json || !["approved", "paused"].includes(p.status))
        fail(409, "掲載承認後に変更できます。");
      run(
        "UPDATE profiles SET status=? WHERE user_id=?",
        b.paused === true ? "paused" : "approved",
        u.id,
      );
      return json({ ok: true });
    }
    if (key === "applications" && method === "POST") {
      const u = needUser(req, "donor"),
        b = await body(req),
        current = one("SELECT * FROM profiles WHERE user_id=?", u.id)!,
        p = profileData(
          b.profile,
          current.approved_json ? JSON.parse(current.approved_json) : undefined,
          u.birth_date,
        );
      if (
        one(
          "SELECT id FROM applications WHERE user_id=? AND status IN ('payment_pending','queued','reviewing','needs_changes')",
          u.id,
        )
      )
        fail(409, "処理中の申請があります。先に現在の申請を完了してください。");
      if (!Array.isArray(b.fileIds) || b.fileIds.length > 16)
        fail(400, "提出書類を確認してください。");
      const files = ensureDocuments(
          p,
          u,
          b.fileIds,
          current.approved_json ? JSON.parse(current.approved_json) : undefined,
        ),
        aid = id();
      transaction(() => {
        run(
          "INSERT INTO applications(id,user_id,kind,data_json,status,created_at) VALUES(?,?,?,?,?,?)",
          aid,
          u.id,
          current.approved_json ? "update" : "initial",
          JSON.stringify(p),
          "payment_pending",
          now(),
        );
        run(
          "UPDATE profiles SET data_json=? WHERE user_id=?",
          JSON.stringify(p),
          u.id,
        );
        for (const f of files)
          run("UPDATE files SET application_id=? WHERE id=?", aid, f.id);
      });
      return json(
        { applicationId: aid, amount: 5000, status: "payment_pending" },
        201,
      );
    }
    if (
      parts[0] === "applications" &&
      parts.length === 3 &&
      parts[2] === "revise" &&
      method === "POST"
    ) {
      const u = needUser(req, "donor"),
        app = one(
          "SELECT * FROM applications WHERE id=? AND user_id=?",
          parts[1],
          u.id,
        );
      if (!app || app.status !== "needs_changes")
        fail(409, "差し戻し中の申請ではありません。");
      const b = await body(req),
        prev = one(
          "SELECT approved_json FROM profiles WHERE user_id=?",
          u.id,
        )?.approved_json,
        p = profileData(
          b.profile,
          prev ? JSON.parse(prev) : undefined,
          u.birth_date,
        );
      const oldFiles = all(
          "SELECT * FROM files WHERE application_id=?",
          app.id,
        ),
        ids = [...oldFiles.map((f) => f.id), ...(b.fileIds || [])];
      for (const f of oldFiles)
        run("UPDATE files SET application_id=NULL WHERE id=?", f.id);
      try {
        const files = ensureDocuments(
          p,
          u,
          ids,
          prev ? JSON.parse(prev) : undefined,
        );
        transaction(() => {
          run(
            "UPDATE applications SET data_json=?,status='queued',review_reason=NULL WHERE id=?",
            JSON.stringify(p),
            app.id,
          );
          run(
            "UPDATE profiles SET data_json=? WHERE user_id=?",
            JSON.stringify(p),
            u.id,
          );
          for (const f of files)
            run("UPDATE files SET application_id=? WHERE id=?", app.id, f.id);
        });
      } catch (e) {
        for (const f of oldFiles)
          run("UPDATE files SET application_id=? WHERE id=?", app.id, f.id);
        throw e;
      }
      return json({ ok: true, additionalCharge: 0 });
    }
    if (
      parts[0] === "applications" &&
      parts.length === 2 &&
      method === "DELETE"
    ) {
      const u = needUser(req, "donor"),
        app = one(
          "SELECT * FROM applications WHERE id=? AND user_id=?",
          parts[1],
          u.id,
        );
      if (
        !app ||
        app.paid ||
        app.status !== "payment_pending" ||
        app.paypal_order
      )
        fail(409, "決済手続き開始前の未払い申請のみ取り消せます。");
      transaction(() => {
        run(
          "UPDATE files SET application_id=NULL WHERE application_id=?",
          app.id,
        );
        run("DELETE FROM applications WHERE id=?", app.id);
      });
      return json({ ok: true });
    }
    if (parts[0] === "payments" && parts.length === 3 && method === "POST") {
      const u = needUser(req, "donor"),
        app = one(
          "SELECT * FROM applications WHERE id=? AND user_id=?",
          parts[1],
          u.id,
        );
      if (!app) fail(404, "申請が見つかりません。");
      if (app.paid) return json({ paid: true });
      if (app.status !== "payment_pending")
        fail(409, "申請の状態を確認してください。");
      if (parts[2] === "demo") {
        if (!demo() || process.env.PAYMENT_MODE !== "demo")
          fail(404, "デモ支払いは利用できません。");
        run(
          "UPDATE applications SET paid=1,status='queued',payment_ref=? WHERE id=? AND paid=0",
          "demo:" + id(),
          app.id,
        );
        return json({ paid: true, demo: true });
      }
      if (process.env.PAYMENT_MODE !== "paypal")
        fail(503, "本番の決済サービスが未設定です。");
      if (parts[2] === "create") {
        if (!process.env.SITE_URL?.startsWith("https://") && !demo())
          fail(503, "本番のSITE_URLにはHTTPSが必要です。");
        if (app.paypal_order) {
          const order = await paypal(
            "/v2/checkout/orders/" + app.paypal_order,
            "GET",
          );
          const link = order.links?.find((l: Row) => l.rel === "approve")?.href;
          if (link) return json({ approveUrl: link });
        }
        const site = (process.env.SITE_URL || new URL(req.url).origin).replace(
          /\/$/,
          "",
        );
        const order = await paypal(
          "/v2/checkout/orders",
          "POST",
          {
            intent: "CAPTURE",
            purchase_units: [
              {
                custom_id: app.id,
                description:
                  app.kind === "initial"
                    ? "コウノトリのつばさ 登録審査料"
                    : "コウノトリのつばさ 証明書更新審査料",
                amount: { currency_code: "JPY", value: "5000" },
              },
            ],
            application_context: {
              return_url: site + "/register?application=" + app.id,
              cancel_url: site + "/register?cancelled=1",
              user_action: "PAY_NOW",
            },
          },
          app.id,
        );
        const link = order.links?.find((l: Row) => l.rel === "approve")?.href;
        if (
          !link ||
          !["www.paypal.com", "www.sandbox.paypal.com"].includes(
            new URL(link).hostname,
          )
        )
          fail(502, "決済先を確認できませんでした。");
        run(
          "UPDATE applications SET paypal_order=? WHERE id=?",
          order.id,
          app.id,
        );
        return json({ approveUrl: link });
      }
      if (parts[2] === "capture") {
        if (!app.paypal_order) fail(409, "先に決済手続きを開始してください。");
        let order = await paypal(
          "/v2/checkout/orders/" + app.paypal_order,
          "GET",
        );
        if (order.status !== "COMPLETED")
          order = await paypal(
            "/v2/checkout/orders/" + app.paypal_order + "/capture",
            "POST",
            {},
            app.id + "-capture",
          );
        const ref = verifiedCapture(order, app.id);
        run(
          "UPDATE applications SET paid=1,status='queued',payment_ref=? WHERE id=? AND paid=0",
          ref,
          app.id,
        );
        return json({ paid: true });
      }
    }
    if (key === "files" && method === "POST") {
      const u = needUser(req),
        raw = await bounded(req, 10 * 1024 * 1024),
        form = await new Request(req.url, {
          method: "POST",
          headers: { "Content-Type": req.headers.get("content-type") || "" },
          body: raw,
        }).formData();
      const kind = String(form.get("kind") || ""),
        chatId = String(form.get("conversationId") || "");
      if (![...Object.keys(DOC_LABELS), "photo", "chat"].includes(kind))
        fail(400, "書類の種類を選択してください。");
      if (kind !== "chat" && u.role !== "donor")
        fail(403, "提供者のみ登録できます。");
      if (
        kind === "chat" &&
        (u.role === "admin" || conversation(chatId, u).status !== "accepted")
      )
        fail(409, "会話が承認されていません。");
      if (
        one(
          "SELECT COUNT(*) count FROM files WHERE owner_id=? AND application_id IS NULL AND kind NOT IN ('photo','chat')",
          u.id,
        )!.count >= 20 &&
        kind !== "chat" &&
        kind !== "photo"
      )
        fail(409, "未提出の書類を整理してください。");
      const file = form.get("file");
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > (kind === "photo" || kind === "chat" ? 5 : 8) * 1024 * 1024
      )
        fail(400, "画像は5MB、証明書は8MB以内にしてください。");
      let bytes: Buffer = Buffer.from(await file.arrayBuffer()),
        mime: string,
        ext: string;
      if (
        kind !== "photo" &&
        kind !== "chat" &&
        file.type === "application/pdf" &&
        bytes.subarray(0, 5).toString() === "%PDF-"
      ) {
        mime = "application/pdf";
        ext = "pdf";
      } else {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          fail(400, "JPEG・PNG・WebP画像、または証明書PDFを選んでください。");
        try {
          bytes = await sharp(bytes, { limitInputPixels: 24_000_000 })
            .rotate()
            .resize({
              width: 1800,
              height: 1800,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 85 })
            .toBuffer();
        } catch {
          fail(400, "画像を読み取れませんでした。");
        }
        mime = "image/webp";
        ext = "webp";
      }
      const fid = id(),
        storage = randomBytes(24).toString("hex") + "." + ext;
      writeFileSync(path.join(dataDir(), "uploads", storage), bytes, {
        mode: 0o600,
      });
      transaction(() => {
        run(
          "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
          fid,
          u.id,
          null,
          kind === "chat" ? chatId : null,
          kind,
          storage,
          mime,
          path.basename(file.name).slice(0, 120),
          now(),
        );
        if (kind === "photo") {
          const old = one(
            "SELECT photo_id FROM profiles WHERE user_id=?",
            u.id,
          )?.photo_id;
          if (old) {
            const f = one("SELECT file_key FROM files WHERE id=?", old);
            if (f) run("INSERT OR IGNORE INTO file_gc VALUES(?)", f.file_key);
            run("DELETE FROM files WHERE id=?", old);
          }
          run("UPDATE profiles SET photo_id=? WHERE user_id=?", fid, u.id);
        }
      });
      cleanFiles();
      return json(
        { file: { id: fid, kind, original_name: file.name.slice(0, 120) } },
        201,
      );
    }
    if (parts[0] === "files" && parts.length === 2) {
      const u = needUser(req),
        file = one("SELECT * FROM files WHERE id=?", parts[1]);
      if (!file) fail(404, "ファイルが見つかりません。");
      checkFileAccess(file, u);
      if (method === "GET") {
        const p = path.join(dataDir(), "uploads", file.file_key);
        if (!existsSync(p)) fail(404, "ファイルが見つかりません。");
        return new Response(readFileSync(p), {
          headers: {
            "Content-Type": file.mime,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
            "Content-Disposition":
              file.mime === "application/pdf"
                ? 'attachment; filename="document.pdf"'
                : "inline",
          },
        });
      }
      if (method === "DELETE") {
        if (
          file.owner_id !== u.id ||
          file.application_id ||
          (file.kind === "chat" &&
            one("SELECT id FROM messages WHERE file_id=?", file.id))
        )
          fail(403, "このファイルは削除できません。");
        run("INSERT OR IGNORE INTO file_gc VALUES(?)", file.file_key);
        run("DELETE FROM files WHERE id=?", file.id);
        if (file.kind === "photo")
          run("UPDATE profiles SET photo_id=NULL WHERE user_id=?", u.id);
        cleanFiles();
        return json({ ok: true });
      }
    }
    if (key === "conversations" && method === "GET") {
      const u = needUser(req),
        rows = all(
          "SELECT c.*,d.display_id donor_name,r.display_id recipient_name FROM conversations c JOIN users d ON d.id=c.donor_id JOIN users r ON r.id=c.recipient_id WHERE (?='admin' OR c.donor_id=? OR c.recipient_id=?) ORDER BY c.created_at DESC",
          u.role,
          u.id,
          u.id,
        );
      const tombstones = all(
        "SELECT id,created_at FROM chat_tombstones WHERE survivor_id=? ORDER BY created_at DESC",
        u.id,
      ).map((r) => ({
        ...r,
        status: "deleted",
        donor_name: "会話先",
        recipient_name: "会話先",
      }));
      return json({ conversations: [...rows, ...tombstones] });
    }
    if (key === "conversations" && method === "POST") {
      const u = needUser(req, "recipient"),
        b = await body(req),
        p = one(
          "SELECT * FROM profiles WHERE user_id=? AND status='approved'",
          text(b.donorId),
        );
      if (!p) fail(404, "現在、会話を申請できる提供者ではありません。");
      const existing = one(
        "SELECT * FROM conversations WHERE donor_id=? AND recipient_id=?",
        p.user_id,
        u.id,
      );
      if (existing) {
        if (existing.status === "blocked" || existing.status === "declined")
          fail(403, "この提供者への申請は受け付けられません。");
        return json({ conversationId: existing.id });
      }
      rate("conversation:" + u.id, 20, 3600000);
      const cid = id();
      run(
        "INSERT INTO conversations(id,donor_id,recipient_id,status,created_at) VALUES(?,?,?,?,?)",
        cid,
        p.user_id,
        u.id,
        "requested",
        now(),
      );
      chatMail(p.user_id, cid, "request");
      return json({ conversationId: cid }, 201);
    }
    if (parts[0] === "conversations" && parts.length === 2) {
      const u = needUser(req),
        c = conversation(parts[1], u);
      if (method === "GET") {
        const messages = all(
          "SELECT m.*,u.display_id sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE conversation_id=? ORDER BY created_at,id",
          c.id,
        );
        return json({
          conversation: c,
          messages,
          events: all(
            "SELECT * FROM events WHERE conversation_id=? ORDER BY created_at DESC",
            c.id,
          ),
        });
      }
      if (method === "PATCH") {
        const b = await body(req);
        if (b.action === "accept" || b.action === "decline") {
          if (c.donor_id !== u.id || c.status !== "requested")
            fail(403, "提供者のみ申請を判断できます。");
          run(
            "UPDATE conversations SET status=? WHERE id=?",
            b.action === "accept" ? "accepted" : "declined",
            c.id,
          );
          if (b.action === "accept") chatMail(c.recipient_id, c.id, "accept");
        } else if (b.action === "disclose") {
          if (c.donor_id !== u.id || c.status !== "accepted")
            fail(403, "提供者のみ開示を変更できます。");
          run(
            "UPDATE conversations SET disclosed=? WHERE id=?",
            b.enabled === true ? 1 : 0,
            c.id,
          );
        } else if (b.action === "block") {
          if (u.role === "admin") fail(403, "管理者はこの操作を行えません。");
          run(
            "UPDATE conversations SET status='blocked',disclosed=0 WHERE id=?",
            c.id,
          );
        } else fail(400, "操作を確認してください。");
        return json({ ok: true });
      }
    }
    if (
      parts[0] === "conversations" &&
      parts.length === 3 &&
      parts[2] === "messages" &&
      method === "POST"
    ) {
      const u = needUser(req),
        c = conversation(parts[1], u);
      if (c.status !== "accepted" || u.role === "admin")
        fail(403, "承認された会話の当事者のみ送信できます。");
      const b = await body(req),
        message = text(b.body || "", 4000);
      let fid: string | null = null;
      if (b.fileId) {
        const file = one(
          "SELECT * FROM files WHERE id=? AND owner_id=? AND conversation_id=? AND kind='chat'",
          text(b.fileId),
          u.id,
          c.id,
        );
        if (!file) fail(400, "添付画像を確認してください。");
        fid = file.id;
      }
      if (!message && !fid)
        fail(400, "メッセージまたは画像を入力してください。");
      rate("message:" + u.id, 60, 60000);
      const mid = id();
      run(
        "INSERT INTO messages VALUES(?,?,?,?,?,?)",
        mid,
        c.id,
        u.id,
        message,
        fid,
        now(),
      );
      chatMail(
        c.donor_id === u.id ? c.recipient_id : c.donor_id,
        c.id,
        "message",
      );
      return json({ id: mid }, 201);
    }
    if (
      parts[0] === "conversations" &&
      parts.length === 3 &&
      parts[2] === "report" &&
      method === "POST"
    ) {
      const u = needUser(req),
        c = conversation(parts[1], u),
        b = await body(req),
        reason = choice(
          b.reason,
          ["迷惑行為", "虚偽情報", "無断開示", "その他"],
          "通報理由",
        );
      db().exec(
        "CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,reason TEXT,created_at TEXT)",
      );
      run(
        "INSERT INTO reports VALUES(?,?,?,?,?)",
        id(),
        c.id,
        u.id,
        reason,
        now(),
      );
      return json({ ok: true });
    }
    if (
      parts[0] === "conversations" &&
      parts.length === 3 &&
      parts[2] === "events" &&
      method === "POST"
    ) {
      const u = needUser(req, "donor"),
        c = conversation(parts[1], u);
      if (c.status !== "accepted" || c.donor_id !== u.id)
        fail(403, "承認済みの会話で登録してください。");
      const b = await body(req),
        kind = choice(b.kind, ["donation", "pregnancy", "birth"], "実績"),
        occurred = date(b.date, true);
      run(
        "INSERT INTO events VALUES(?,?,?,?,?,?,?,?)",
        id(),
        c.id,
        c.donor_id,
        c.recipient_id,
        kind,
        occurred,
        "pending",
        now(),
      );
      return json({ ok: true }, 201);
    }
    if (parts[0] === "events" && parts.length === 2 && method === "PATCH") {
      const u = needUser(req, "recipient"),
        event = one(
          "SELECT * FROM events WHERE id=? AND recipient_id=?",
          parts[1],
          u.id,
        );
      if (!event || event.status !== "pending")
        fail(404, "確認待ちの実績が見つかりません。");
      const b = await body(req);
      run(
        "UPDATE events SET status=? WHERE id=?",
        b.confirmed === true ? "confirmed" : "rejected",
        event.id,
      );
      return json({ ok: true });
    }
    if (key === "admin/applications" && method === "GET") {
      needUser(req, "admin");
      return json({
        applications: all(
          "SELECT a.*,u.display_id,u.birth_date,u.email FROM applications a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC",
        ).map((a) => ({
          ...a,
          profile: JSON.parse(a.data_json),
          data_json: undefined,
          files: all(
            "SELECT id,kind,original_name FROM files WHERE application_id=?",
            a.id,
          ),
        })),
      });
    }
    if (
      parts[0] === "admin" &&
      parts[1] === "applications" &&
      parts.length === 3 &&
      method === "PATCH"
    ) {
      needUser(req, "admin");
      const app = one("SELECT * FROM applications WHERE id=?", parts[2]);
      if (!app) fail(404, "申請が見つかりません。");
      if (!app.paid) fail(409, "支払い完了後に審査を開始できます。");
      const b = await body(req);
      if (b.action === "start") {
        if (app.status !== "queued")
          fail(409, "審査を開始できる状態ではありません。");
        run(
          "UPDATE applications SET status='reviewing',review_started_at=? WHERE id=?",
          now(),
          app.id,
        );
        return json({ ok: true });
      }
      if (app.status !== "reviewing") fail(409, "先に審査を開始してください。");
      const p = JSON.parse(app.data_json) as ProfileData;
      if (b.action === "approve") {
        if (b.confirmed !== true)
          fail(400, "本人確認と証明書の照合を確認してください。");
        if (b.academicDeviations) {
          for (const a of p.academics) {
            if (a.kind !== "wais" && !a.deviation) {
              const value = b.academicDeviations[a.kind];
              if (value !== null && value !== undefined && value !== "")
                a.deviation = numeric(value, 20, 90, "照合した偏差値")!;
            }
          }
        }
        transaction(() => {
          run(
            "UPDATE profiles SET data_json=?,approved_json=?,status='approved',verified=1 WHERE user_id=?",
            JSON.stringify(p),
            JSON.stringify(p),
            app.user_id,
          );
          run(
            "UPDATE applications SET status='approved',data_json=? WHERE id=?",
            JSON.stringify(p),
            app.id,
          );
          deleteDocuments(app.id);
        });
        cleanFiles();
        return json({ ok: true });
      }
      if (b.action === "revise" || b.action === "reject") {
        const reason = choice(
          b.reason,
          [
            "書類が不鮮明",
            "入力と書類が不一致",
            "必要書類が不足",
            "登録条件を満たさない",
          ],
          "理由",
        );
        transaction(() => {
          run(
            "UPDATE applications SET status=?,review_reason=? WHERE id=?",
            b.action === "revise" ? "needs_changes" : "rejected",
            reason,
            app.id,
          );
          if (b.action === "reject") deleteDocuments(app.id);
        });
        cleanFiles();
        return json({ ok: true });
      }
      fail(400, "審査操作を確認してください。");
    }
    if (key === "admin/donors" && method === "GET") {
      needUser(req, "admin");
      return json({
        donors: all(
          "SELECT u.id,u.display_id,p.status FROM users u JOIN profiles p ON p.user_id=u.id",
        ),
      });
    }
    if (
      parts[0] === "admin" &&
      parts[1] === "donors" &&
      parts.length === 3 &&
      method === "PATCH"
    ) {
      needUser(req, "admin");
      const b = await body(req),
        p = one("SELECT * FROM profiles WHERE user_id=?", parts[2]);
      if (!p?.approved_json) fail(409, "未承認の提供者です。");
      run(
        "UPDATE profiles SET status=? WHERE user_id=?",
        b.paused === true ? "suspended" : "approved",
        parts[2],
      );
      return json({ ok: true });
    }
    if (key === "admin/reports" && method === "GET") {
      needUser(req, "admin");
      const exists = one("SELECT name FROM sqlite_master WHERE name='reports'");
      return json({
        reports: exists
          ? all("SELECT * FROM reports ORDER BY created_at DESC")
          : [],
      });
    }
    if (key === "account" && method === "DELETE") {
      const u = needUser(req),
        b = await body(req);
      if (b.confirm !== true) fail(400, "削除の確認が必要です。");
      if (u.role === "admin")
        fail(403, "管理者アカウントの削除は運用手順から実施してください。");
      const chats = all(
        "SELECT * FROM conversations WHERE donor_id=? OR recipient_id=?",
        u.id,
        u.id,
      );
      const files = all(
        "SELECT file_key FROM files WHERE owner_id=? OR conversation_id IN (SELECT id FROM conversations WHERE donor_id=? OR recipient_id=?)",
        u.id,
        u.id,
        u.id,
      );
      transaction(() => {
        for (const c of chats)
          run(
            "INSERT INTO chat_tombstones VALUES(?,?,?)",
            id(),
            c.donor_id === u.id ? c.recipient_id : c.donor_id,
            now(),
          );
        for (const f of files)
          run("INSERT OR IGNORE INTO file_gc VALUES(?)", f.file_key);
        run("DELETE FROM users WHERE id=?", u.id);
      });
      cleanFiles();
      db().exec(
        "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
      );
      return json(
        {
          ok: true,
          pendingFileCleanup: one("SELECT COUNT(*) count FROM file_gc")!.count,
        },
        200,
        { "Set-Cookie": sessionCookie("", req, 0) },
      );
    }
    fail(404, "ページが見つかりません。");
  } catch (error) {
    if (error instanceof Problem)
      return json({ error: error.message }, error.status);
    console.error(
      "API operation failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      { error: "処理を完了できませんでした。時間をおいて再度お試しください。" },
      500,
    );
  }
}
