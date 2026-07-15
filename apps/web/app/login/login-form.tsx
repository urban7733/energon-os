"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserPlus } from "lucide-react";
import { authClient } from "../../lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ name: name.trim() || email, email, password });

      if (result.error) {
        setError(result.error.message ?? "Authentication failed.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={mode === "sign-in" ? "Sign in" : "Create account"}>
      <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-in"}
          className={mode === "sign-in" ? "auth-mode active" : "auth-mode"}
          onClick={() => setMode("sign-in")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-up"}
          className={mode === "sign-up" ? "auth-mode active" : "auth-mode"}
          onClick={() => setMode("sign-up")}
        >
          Create account
        </button>
      </div>

      {mode === "sign-up" ? (
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Operator name"
          />
        </label>
      ) : null}

      <label>
        Email
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          autoComplete="email"
          placeholder="operator@example.com"
        />
      </label>

      <label>
        Password
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          minLength={10}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          placeholder="minimum 10 characters"
        />
      </label>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={busy}>
        {mode === "sign-in" ? (
          <KeyRound size={16} aria-hidden="true" />
        ) : (
          <UserPlus size={16} aria-hidden="true" />
        )}
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
