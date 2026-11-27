// Talks to the app's own Worker (/api/*). The sign-in cookie is HttpOnly, so scripts never see it.

export class ApiError extends Error {
  constructor(status) {
    super(`api ${status}`);
    this.status = status;
  }
}

async function call(path, { method = "GET", body, keepalive = false } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    keepalive,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 409) return { conflict: await res.json() };
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

export const getMe = async () => (await call("/api/me")).user;
export const login = async (credential) => (await call("/api/login", { method: "POST", body: { credential } })).user;
export const logout = () => call("/api/logout", { method: "POST" });
export const deleteAccount = () => call("/api/account", { method: "DELETE" });
export const getDoc = () => call("/api/data");
// -> { version } or { conflict: { data, version } } when another device saved first.
// `user` is the account this copy belongs to; the server refuses it (403) if that is not the signed-in account.
export const putDoc = (data, version, user, keepalive = false) => call("/api/data", { method: "PUT", body: { data, version, user }, keepalive });
