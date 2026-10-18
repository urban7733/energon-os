import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, enabledSocialProviders } from "../../lib/auth";
import { EnergonWordmark } from "../../components/brand/energon-mark";
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
    <main className="auth-shell ex-auth">
      <div className="ex-auth-glow" aria-hidden="true" />
      <div className="auth-card">
        <Link className="ex-auth-brand" href="/" aria-label="Energon OS home">
          <EnergonWordmark size={26} />
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
