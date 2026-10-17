"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { User } from "@/lib/shared";

type Ticket = {
  id: string;
  category: string;
  subject: string;
  status: string;
  updated_at: string;
};
type Message = { id: string; sender: string; body: string; created_at: string };
type Receipt = { id: string; token: string; subject: string };
const categories = [
  "登録・ログイン",
  "支払い・返金",
  "掲載・審査",
  "不具合",
  "運営者情報の開示請求",
  "その他",
];
const labels: Record<string, string> = {
  open: "返信待ち",
  answered: "運営から返信あり",
  closed: "対応済み",
};
const storageKey = "kounotori-support-receipts";
async function request(
  route: string,
  method = "GET",
  data?: unknown,
  token = "",
) {
  const response = await fetch("/api/" + route, {
    method,
    cache: "no-store",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Support-Token": token } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "処理できませんでした。");
  return result;
}

export default function SupportPage({
  user,
  admin = false,
}: {
  user: User | null;
  admin?: boolean;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [receipts, setReceipts] = useState<Receipt[]>([]);
  const [active, setActive] = useState(""),
    [token, setToken] = useState(""),
    [ticket, setTicket] = useState<Ticket | null>(null),
    [messages, setMessages] = useState<Message[]>([]);
  const [category, setCategory] = useState(categories[0]),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [reply, setReply] = useState(""),
    [website, setWebsite] = useState("");
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [receiptLink, setReceiptLink] = useState("");
  const permitted = !admin || user?.role === "admin";
  const loadList = useCallback(async () => {
    if (!user || !permitted) return;
    try {
      setTickets((await request(admin ? "admin/support" : "support")).tickets);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }, [user?.id, admin, permitted]);
  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    if (admin) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved))
        setReceipts(
          saved
            .filter(
              (r) =>
                typeof r.id === "string" &&
                typeof r.token === "string" &&
                typeof r.subject === "string",
            )
            .slice(-10),
        );
    } catch {
      /* A receipt link also works when browser storage is unavailable. */
    }
    const fragment = window.location.hash.slice(1).split(".");
    if (fragment.length === 2) {
      setActive(fragment[0]);
      setToken(fragment[1]);
      history.replaceState(null, "", window.location.pathname);
    }
  }, [admin]);
  const loadThread = useCallback(async () => {
    if (!active || !permitted) return;
    try {
      const result = await request(
        "support/" + encodeURIComponent(active),
        "GET",
        undefined,
        token,
      );
      setTicket(result.ticket);
      setMessages(result.messages);
    } catch (error) {
      setTicket(null);
      setMessages([]);
      setNotice((error as Error).message);
    }
  }, [active, token, permitted]);
  useEffect(() => {
    void loadThread();
  }, [loadThread]);
  const select = (id: string, secret = "") => {
    setActive(id);
    setToken(secret);
    setTicket(null);
    setMessages([]);
    setNotice("");
    setReceiptLink("");
    setReply("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const result = await request("support", "POST", {
        category,
        subject,
        body,
        website,
      });
      const secret = result.accessToken || "";
      select(result.id, secret);
      if (secret) {
        const link =
          window.location.origin + "/contact#" + result.id + "." + secret;
        setReceiptLink(link);
        const saved = [
          ...receipts,
          { id: result.id, token: secret, subject },
        ].slice(-10);
        setReceipts(saved);
        try {
          localStorage.setItem(storageKey, JSON.stringify(saved));
        } catch {}
      }
      setSubject("");
      setBody("");
      setNotice("問い合わせを受け付けました。返信はこのページで確認できます。");
      await loadList();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await request("support/" + active, "POST", { body: reply }, token);
      setReply("");
      await loadThread();
      await loadList();
      setNotice("返信を保存しました。");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const change = async (method: "PATCH" | "DELETE") => {
    if (
      method === "DELETE" &&
      !window.confirm("この問い合わせと返信を削除します。よろしいですか？")
    )
      return;
    setBusy(true);
    try {
      await request(
        "support/" + active,
        method,
        method === "PATCH" ? { status: "closed" } : undefined,
        token,
      );
      if (method === "DELETE") {
        const remaining = receipts.filter((r) => r.id !== active);
        setReceipts(remaining);
        try {
          localStorage.setItem(storageKey, JSON.stringify(remaining));
        } catch {}
        setActive("");
        setTicket(null);
        setMessages([]);
        setReceiptLink("");
      } else await loadThread();
      await loadList();
      setNotice(
        method === "DELETE"
          ? "問い合わせを削除しました。"
          : "対応済みにしました。",
      );
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!permitted)
    return (
      <div className="page-shell">
        <h1>問い合わせ管理</h1>
        <p>管理者としてログインしてください。</p>
      </div>
    );
  return (
    <div className="page-shell support-page">
      <div className="page-heading">
        <span className="eyebrow">SUPPORT</span>
        <h1>{admin ? "問い合わせ管理" : "お問い合わせ"}</h1>
        <p>受付と返信をサイト内で行います。メールでの返信通知はありません。</p>
        {admin && <Link href="/admin">管理ページへ戻る</Link>}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {receiptLink && (
        <section className="panel">
          <h2>返信確認用リンク</h2>
          <p>
            このリンクを保存してください。リンクを知る人は内容を閲覧・返信できます。他の人には共有しないでください。
          </p>
          <input
            aria-label="返信確認用リンク"
            readOnly
            value={receiptLink}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p>このブラウザーにも直近10件の受付履歴を保存します。</p>
        </section>
      )}
      <div className="support-layout">
        <aside className="panel support-list">
          <h2>{admin ? "受け付けた問い合わせ" : "問い合わせ履歴"}</h2>
          <button
            className="button secondary"
            onClick={() => {
              void loadList();
              void loadThread();
            }}
          >
            最新の状態に更新
          </button>
          {tickets.map((item) => (
            <button
              className="support-ticket"
              aria-pressed={active === item.id}
              key={item.id}
              onClick={() => select(item.id)}
            >
              <strong>{item.subject}</strong>
              <small>
                {item.category} / {labels[item.status]}
              </small>
            </button>
          ))}
          {!admin &&
            receipts.map((item) => (
              <button
                className="support-ticket"
                aria-pressed={active === item.id}
                key={item.id}
                onClick={() => select(item.id, item.token)}
              >
                <strong>{item.subject}</strong>
                <small>ログインせずに送った問い合わせ</small>
              </button>
            ))}
          {!tickets.length && !receipts.length && (
            <p className="muted">問い合わせはまだありません。</p>
          )}
        </aside>
        <div className="support-main">
          {ticket && (
            <section className="panel">
              <h2>{ticket.subject}</h2>
              <p className="muted">
                {ticket.category} / {labels[ticket.status]} / 受付番号：
                {ticket.id}
              </p>
              <div className="support-messages">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={
                      message.sender === "admin"
                        ? "support-message support-admin"
                        : "support-message"
                    }
                  >
                    <strong>
                      {message.sender === "admin" ? "運営" : "お問い合わせ者"}
                    </strong>
                    <time>
                      {new Date(message.created_at).toLocaleString("ja-JP")}
                    </time>
                    <p>{message.body}</p>
                  </article>
                ))}
              </div>
              {ticket.status !== "closed" && (
                <form onSubmit={sendReply}>
                  <label>
                    返信
                    <textarea
                      required
                      maxLength={4000}
                      rows={5}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    返信を送信
                  </button>{" "}
                  <button
                    className="button secondary"
                    disabled={busy}
                    type="button"
                    onClick={() => void change("PATCH")}
                  >
                    対応済みにする
                  </button>
                </form>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void change("DELETE")}
              >
                この問い合わせを削除
              </button>
            </section>
          )}
          {!admin && (
            <section className="panel">
              <h2>新しい問い合わせ</h2>
              <p>
                ログインの有無にかかわらず送信できます。身分証・検査結果・パスワードは記載しないでください。
              </p>
              <form onSubmit={submit} className="support-form">
                <label>
                  種類
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  件名
                  <input
                    required
                    maxLength={100}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </label>
                <label>
                  お問い合わせ内容
                  <textarea
                    required
                    maxLength={4000}
                    rows={7}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <div hidden aria-hidden="true">
                  <label>
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>
                <p className="muted">
                  {user
                    ? "履歴はこのアカウントで確認できます。退会時に問い合わせも削除します。"
                    : "送信後に表示する専用リンクで返信を確認できます。リンクを紛失すると内容を確認できなくなります。"}
                </p>
                <button className="button primary" disabled={busy}>
                  問い合わせを送信
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
