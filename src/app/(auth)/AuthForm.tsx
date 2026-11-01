"use client";

import Link from "next/link";
import { useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { safeNext, useAccount } from "@/components/account/useAccount";
import styles from "./auth.module.css";

type Mode = "signin" | "signup";
type Field = "name" | "email" | "password";

interface Copy {
  submit: string;
  busy: string;
  switchText: string;
  switchLink: string;
  switchHref: "/signin" | "/signup";
  fallbackNext: string;
}

const COPY: Record<Mode, Copy> = {
  signup: {
    submit: "Start my comic book",
    busy: "Making your account…",
    switchText: "Already have a Comimo?",
    switchLink: "Sign in",
    switchHref: "/signin",
    fallbackNext: "/record",
  },
  signin: {
    submit: "Sign in",
    busy: "Signing in…",
    switchText: "New here?",
    switchLink: "Start your comic book",
    switchHref: "/signup",
    fallbackNext: "/record",
  },
};

const MIN_PASSWORD = 8;

/** The query string only exists in the browser; it doesn't change while this page is open. */
const noSubscribe = () => () => {};
const readSearch = () => window.location.search;

/** The one-screen sign-in or sign-up form. Errors come back in plain words, next to the field they're about. */
export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const account = useAccount();
  // Where to go after: ?next= from the page that sent the visitor here (same-site paths only).
  const search = useSyncExternalStore(noSubscribe, readSearch, () => "");
  const next = safeNext(new URLSearchParams(search).get("next"), copy.fallbackNext);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const id = useId();

  function focusField(field?: Field) {
    const target = field ? formRef.current?.querySelector<HTMLInputElement>(`[name="${field}"]`) : null;
    if (target) target.focus();
    else alertRef.current?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const body = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    };

    // Quick checks before the round trip; the server checks everything again.
    let problem: { field: Field; message: string } | null = null;
    if (mode === "signup" && !body.name.trim()) problem = { field: "name", message: "What should Comimo call you?" };
    else if (!body.email) problem = { field: "email", message: "Add your email." };
    else if (!body.password) problem = { field: "password", message: "Add your password." };
    else if (mode === "signup" && body.password.length < MIN_PASSWORD) {
      problem = { field: "password", message: `Use at least ${MIN_PASSWORD} characters.` };
    }
    if (problem) {
      setError(problem);
      focusField(problem.field);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(mode === "signup" ? body : { email: body.email, password: body.password }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; field?: Field } | null;
      if (response.ok) {
        // A full load, so the nav and every page start from the new session.
        // New accounts tell Comimo about themselves first, then go on to where they were headed.
        const after = mode === "signup" && next !== "/welcome" ? `/welcome?next=${encodeURIComponent(next)}` : next;
        window.location.replace(after);
        return;
      }
      const message = result?.error || `Something went wrong (${response.status}). Try again.`;
      setError({ field: result?.field, message });
      setBusy(false);
      requestAnimationFrame(() => focusField(result?.field));
    } catch {
      setError({ message: "Couldn't reach Comimo. Check your connection and try again." });
      setBusy(false);
      requestAnimationFrame(() => focusField());
    }
  }

  const switchHref = `${copy.switchHref}${next !== copy.fallbackNext ? `?next=${encodeURIComponent(next)}` : ""}`;
  const fieldError = (field: Field) => (error?.field === field ? error.message : null);
  const describe = (field: Field, hint?: string) => [fieldError(field) ? `${id}-${field}-error` : null, hint].filter(Boolean).join(" ") || undefined;

  if (account.status === "signed-in") {
    return (
      <div className={styles.already}>
        <p className={styles.alreadyText} dir="auto">
          You&apos;re signed in as <strong>{account.name}</strong>.
        </p>
        <Link href={next} className="btn btn--accent">
          Keep going
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate aria-busy={busy}>
      {error && !error.field ? (
        <p ref={alertRef} className={styles.alert} role="alert" tabIndex={-1}>
          {error.message}
        </p>
      ) : null}

      {mode === "signup" ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-name`}>
            Your name
          </label>
          <input
            id={`${id}-name`}
            name="name"
            type="text"
            autoComplete="given-name"
            dir="auto"
            maxLength={40}
            required
            aria-invalid={fieldError("name") ? true : undefined}
            aria-describedby={describe("name")}
          />
          {fieldError("name") ? (
            <p id={`${id}-name-error`} className={styles.error} role="alert">
              {fieldError("name")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-email`}>
          Email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete={mode === "signup" ? "email" : "username"}
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          maxLength={254}
          required
          aria-invalid={fieldError("email") ? true : undefined}
          aria-describedby={describe("email")}
        />
        {fieldError("email") ? (
          <p id={`${id}-email-error`} className={styles.error} role="alert">
            {fieldError("email")}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-password`}>
          Password
        </label>
        <div className={styles.passwordRow}>
          <input
            id={`${id}-password`}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            minLength={mode === "signup" ? MIN_PASSWORD : undefined}
            maxLength={200}
            required
            aria-invalid={fieldError("password") ? true : undefined}
            aria-describedby={describe("password", mode === "signup" ? `${id}-password-hint` : undefined)}
          />
          <button
            type="button"
            className={styles.reveal}
            aria-pressed={showPassword}
            aria-controls={`${id}-password`}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? "Hide" : "Show"}
            <span className="visually-hidden"> password</span>
          </button>
        </div>
        {mode === "signup" ? (
          <p id={`${id}-password-hint`} className={styles.hint}>
            At least {MIN_PASSWORD} characters.
          </p>
        ) : null}
        {fieldError("password") ? (
          <p id={`${id}-password-error`} className={styles.error} role="alert">
            {fieldError("password")}
          </p>
        ) : null}
      </div>

      <button type="submit" className={`btn btn--accent ${styles.submit}`} aria-disabled={busy || undefined}>
        {busy ? copy.busy : copy.submit}
      </button>

      <p className={styles.switch}>
        {copy.switchText}{" "}
        <Link href={switchHref} className="link">
          {copy.switchLink}
        </Link>
      </p>
    </form>
  );
}
