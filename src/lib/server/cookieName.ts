/**
 * The session cookie's name, kept free of server-only imports so the proxy
 * can use it too. In production the cookie carries the __Host- prefix: the
 * browser then only accepts it over HTTPS, for this exact host and path "/".
 */
export function sessionCookieName(production = process.env.NODE_ENV === "production"): string {
  return production ? "__Host-comimo_session" : "comimo_session";
}
