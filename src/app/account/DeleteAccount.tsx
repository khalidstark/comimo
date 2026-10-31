"use client";

import { useState } from "react";
import { dropAccountCache } from "@/lib/store";
import { rememberCacheKey } from "@/lib/whoami";
import authStyles from "@/app/(auth)/auth.module.css";
import styles from "./account.module.css";

/**
 * Delete the account and everything in it, after typing the password again.
 * Says plainly what goes: comics, cast, photo albums (their links and QR
 * codes stop working) and every signed-in device.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/me/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Your account couldn't be deleted. Try again in a minute.");
        return;
      }
      await dropAccountCache();
      rememberCacheKey(null);
      window.location.replace("/");
    } catch {
      setError("Comimo couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`panel ${styles.danger}`} aria-labelledby="delete-title">
      <h2 id="delete-title" className={styles.title}>
        Delete your account
      </h2>
      <p>
        This deletes every comic, your cast, your monthly covers and your photo albums from Comimo, for good. Album links and the QR
        codes in your comics stop working, and every device you&apos;re signed in on is signed out.
      </p>
      {!open ? (
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
          Delete my account…
        </button>
      ) : (
        <form className={authStyles.form} onSubmit={(event) => void submit(event)}>
          <div className={authStyles.field}>
            <label className={authStyles.label} htmlFor="delete-password">
              Type your password to confirm
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              value={password}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "delete-error" : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p id="delete-error" className={authStyles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button type="submit" className="btn btn--accent" disabled={busy || !password}>
              {busy ? "Deleting…" : "Delete everything"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)} disabled={busy}>
              Keep my account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
