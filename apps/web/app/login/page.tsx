import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, enabledSocialProviders } from "../../lib/auth";
import { LoginForm, type SocialProviderId } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Energon OS operator dashboard.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/dashboard");
  }

  const socialProviders = (Object.keys(enabledSocialProviders) as SocialProviderId[]).filter(
    (provider) => enabledSocialProviders[provider],
  );

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link className="brand" href="/" aria-label="Energon OS home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Energon</span>
        </Link>
        <header className="auth-header">
          <p className="eyebrow">Operator access</p>
          <h1>Sign in to the memory control plane</h1>
          <p>
            Human accounts manage organizations, agents, and API keys. Agents authenticate
            separately with bearer API keys.
          </p>
        </header>
        <LoginForm socialProviders={socialProviders} />
      </div>
    </main>
  );
}
