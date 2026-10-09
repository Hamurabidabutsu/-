// 現在掲載されている年度のみ。学科が判別できない高校の数値は採用しない。
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { load } from "cheerio";

const pages = Number(
  process.argv.find((v) => v.startsWith("--pages="))?.split("=")[1] || 1,
);
if (!Number.isInteger(pages) || pages < 1 || pages > 500)
  throw new Error("--pages は1〜500で指定してください");
const entries = new Map();
function read(url) {
  if (new URL(url).hostname !== "www.minkou.jp")
    throw new Error("Unsupported source");
  return load(
    execFileSync(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--max-time",
        "30",
        url,
      ],
      { encoding: "utf8", maxBuffer: 12 * 1024 * 1024 },
    ),
  );
}
function add(kind, school, faculty, department, deviation, year, source_url) {
  if (
    !school ||
    !department ||
    !Number.isFinite(deviation) ||
    deviation < 20 ||
    deviation > 90 ||
    !year
  )
    return;
  const id = createHash("sha256")
    .update([kind, school, faculty, department].join("|"))
    .digest("hex")
    .slice(0, 24);
  const entry = {
    id,
    kind,
    school,
    faculty,
    department,
    deviation,
    year,
    source_url,
  };
  // 同一学部・学科で複数の入試日程がある場合は最高値を使用。
  if (!entries.has(id) || entries.get(id).deviation < deviation)
    entries.set(id, entry);
}
for (let page = 1; page <= pages; page++) {
  const url =
      "https://www.minkou.jp/hischool/ranking/deviation/" +
      (page === 1 ? "" : `page=${page}`),
    $ = read(url);
  const year = Number(
    $("title")
      .text()
      .match(/(20\d{2})年度/)?.[1],
  );
  if (!year) throw new Error("高校の掲載年度を取得できませんでした");
  const rows = $(".mod-listRanking-list");
  if (!rows.length) throw new Error("高校の一覧形式が変わっています");
  rows.each((_, el) => {
    const name = $(el).find(".mod-listRanking-name").clone();
    const school = name.find("a").first().text().trim();
    name.find("a,span").remove();
    const department = name.text().trim().replace(/\s+/g, " "),
      score = $(el).find(".mod-listRanking-devi .info-main a").text().trim();
    if (/^\d+(\.\d+)?$/.test(score))
      add("highschool", school, "", department, Number(score), year, url);
  });
  if (page < pages) await new Promise((resolve) => setTimeout(resolve, 500));
}
const universityUrl = "https://www.minkou.jp/university/ranking/deviation/",
  $ = read(universityUrl);
const year = Number(
  $("title")
    .text()
    .match(/(20\d{2})年度/)?.[1],
);
if (!year) throw new Error("大学の掲載年度を取得できませんでした");
$(".usMod-deviTable tr").each((_, el) => {
  const td = $(el).find("td");
  if (td.length !== 5) return;
  add(
    "university",
    td.eq(0).text().trim(),
    td.eq(1).text().trim(),
    td.eq(2).text().trim(),
    Number(td.eq(4).text().trim()),
    year,
    universityUrl,
  );
});
if (![...entries.values()].some((e) => e.kind === "university"))
  throw new Error("大学の一覧形式が変わっています");
mkdirSync("catalog", { recursive: true });
writeFileSync(
  "catalog/current.json",
  JSON.stringify(
    { retrievedAt: new Date().toISOString(), entries: [...entries.values()] },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      imported: entries.size,
      highschool: [...entries.values()].filter((e) => e.kind === "highschool")
        .length,
      university: [...entries.values()].filter((e) => e.kind === "university")
        .length,
      highschoolPages: pages,
      coverage:
        "取得したランキングページのみ。全国全件の収録ではありません。未収録は管理者照合。",
    },
    null,
    2,
  ),
);
