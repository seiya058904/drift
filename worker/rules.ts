export const LIMITS = {
  submit: { count: 5, seconds: 3600 },
  draw: { count: 20, seconds: 60 },
  report: { count: 10, seconds: 3600 },
  session: { count: 30, seconds: 3600 },
} as const;
export const TTL = { session: 86400, draw: 300, dedup: 86400 };
export function normalize(body: string) {
  return body.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}
export function moderate(body: string): {
  status: "approved" | "hidden";
  reason: string | null;
} {
  const count = Array.from(body).length;
  if (!body.trim() || count > 500)
    return { status: "hidden", reason: "length" };
  if (/[\p{Cc}\p{Cs}\p{Cf}]/u.test(body.replace(/[\n\t\u200d]/g, "")))
    return { status: "hidden", reason: "control" };
  if (/(?:https?:|www\.|[\w-]+\.(?:com|net|org|io|cn|xyz)\b)/iu.test(body))
    return { status: "hidden", reason: "link" };
  if (
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s().-]*){7,}|(?:微信|加微|QQ|wechat|whatsapp|telegram|contact me|dm me)\s*[:：@]?\s*[\w-]{3,}/iu.test(
      body,
    )
  )
    return { status: "hidden", reason: "contact" };
  if (/(.)\1{11,}|(.{2,30})(?:\s*\2){5,}/u.test(body))
    return { status: "hidden", reason: "repetition" };
  const prohibited =
    /\b(?:kill yourself|child porn|rape you|buy cocaine|heil hitler|nigger|faggot)\b|去死吧|儿童色情|出售毒品|杀光/iu;
  if (prohibited.test(body)) return { status: "hidden", reason: "prohibited" };
  return { status: "approved", reason: null };
}
export function weight(exposure: number) {
  return 1 / (1 + exposure) ** 1.5;
}
// Weighted reservoir over every eligible row, with bounded memory and no random SQL sort.
export function sample<T extends { exposure_count: number }>(
  rows: T[],
  random = Math.random,
): T | null {
  let selected: T | null = null,
    total = 0;
  for (const row of rows) {
    const w = weight(row.exposure_count);
    total += w;
    if (random() * total < w) selected = row;
  }
  return selected;
}
