// Each account's saved document, with a version number so two devices can't silently overwrite each other.
import { json } from "./http.js";
import { clearCookie } from "./session.js";
import { validateDoc, cleanDoc } from "../shared/doc.js";

export const MAX_BYTES = 1_000_000;

export async function getData(env, user) {
  const row = await env.DB.prepare("SELECT data, version FROM docs WHERE user_id = ?").bind(user.id).first();
  return row ? { data: JSON.parse(row.data), version: row.version } : { data: null, version: 0 };
}

export async function putData(request, env, user) {
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BYTES + 1000) return json({ error: "too big" }, 413);
  const text = await request.text();
  if (text.length > MAX_BYTES + 1000) return json({ error: "too big" }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const { data, version, user: claimed } = body || {};
  if (!Number.isInteger(version) || version < 0 || !validateDoc(data)) return json({ error: "bad request" }, 400);
  // a tab still showing another account must never write into this one
  if (claimed !== user.id) return json({ error: "wrong account" }, 403);
  const str = JSON.stringify(cleanDoc(data));
  if (new TextEncoder().encode(str).length > MAX_BYTES) return json({ error: "too big" }, 413);

  const t = Math.floor(Date.now() / 1000);
  // The version check and the write are one statement, so two saves can never both win.
  const res =
    version === 0
      ? await env.DB.prepare("INSERT INTO docs (user_id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING")
          .bind(user.id, str, t)
          .run()
      : await env.DB.prepare("UPDATE docs SET data = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?")
          .bind(str, t, user.id, version)
          .run();
  if (res.meta.changes === 1) return json({ version: version + 1 });
  return json(await getData(env, user), 409);
}

export async function deleteAccount(env, user) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM docs WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}
