"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  http,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { Check, CreditCard, ExternalLink, WalletCards } from "lucide-react";
import { fetchApiToken } from "../../lib/auth-client";

type PlanId = "developer" | "team";

type BillingStatus = {
  configured: boolean;
  entitlement: {
    plan_id: PlanId;
    included_operations: number;
    used_operations: number;
    remaining_operations: number;
    expires_at_unix_ms: number;
  } | null;
};

type CheckoutIntent = {
  intent_id: string;
  plan_id: PlanId;
  amount_usdc_micro: number;
  network: string;
  chain_id: number;
  asset: string;
  pay_to: string;
  explorer_base_url: string;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const plans: Array<{ id: PlanId; name: string; amount: string; operations: string }> = [
  { id: "developer", name: "Developer", amount: "99 USDC", operations: "100k API operations" },
  { id: "team", name: "Team", amount: "499 USDC", operations: "1M API operations" },
];

export function BillingCheckout({ apiBaseUrl, orgId }: { apiBaseUrl: string; orgId: string }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cleanBaseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);

  useEffect(() => {
    if (!orgId) {
      setStatus(null);
      return;
    }
    void refreshStatus();
  }, [cleanBaseUrl, orgId]);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await fetchApiToken();
    const response = await fetch(`${cleanBaseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(readError(body));
    return body as T;
  }

  async function refreshStatus() {
    try {
      const next = await api<BillingStatus>(`/v1/orgs/${encodeURIComponent(orgId)}/billing`);
      setStatus(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function payForPlan(planId: PlanId) {
    setBusyPlan(planId);
    setError(null);
    setNotice(null);

    try {
      if (!orgId) throw new Error("Create or select an organization first.");
      const intent = await api<CheckoutIntent>(
        `/v1/orgs/${encodeURIComponent(orgId)}/billing/checkout`,
        { method: "POST", body: JSON.stringify({ plan_id: planId }) },
      );
      const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
      if (!provider) {
        throw new Error("Connect a Base-compatible browser wallet to continue.");
      }

      const chain = intent.chain_id === base.id ? base : baseSepolia;
      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const accounts = await wallet.requestAddresses();
      const account = accounts[0];
      if (!account) throw new Error("No wallet account was selected.");
      setWalletAddress(account);

      if (intent.chain_id !== chain.id) {
        throw new Error("Checkout is configured for an unsupported Base network.");
      }
      await wallet.switchChain({ id: chain.id });

      setNotice("Confirm the USDC transfer in your wallet.");
      const transactionHash = await wallet.writeContract({
        account,
        address: intent.asset as Address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [intent.pay_to as Address, BigInt(intent.amount_usdc_micro)],
      });
      const publicClient = createPublicClient({
        chain,
        transport: http(chain.id === base.id ? "https://mainnet.base.org" : "https://sepolia.base.org"),
      });
      setNotice("Waiting for Base confirmation.");
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });

      const message = checkoutAuthorizationMessage(intent, orgId, transactionHash);
      const signature = await wallet.signMessage({ account, message });
      const entitlement = await api<BillingStatus["entitlement"]>(
        `/v1/orgs/${encodeURIComponent(orgId)}/billing/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            intent_id: intent.intent_id,
            transaction_hash: transactionHash,
            payer_address: account,
            signature,
          }),
        },
      );
      setStatus((current) => (current ? { ...current, entitlement } : current));
      setNotice(`Plan unlocked. Transaction: ${intent.explorer_base_url}${transactionHash}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyPlan(null);
    }
  }

  const entitlement = status?.entitlement;

  return (
    <section id="billing" className="ops-panel wide" aria-labelledby="billing-title">
      <div className="panel-title">
        <CreditCard size={18} aria-hidden="true" />
        <h2 id="billing-title">Unlock a workspace plan</h2>
      </div>
      <p className="billing-copy">
        Pay in USDC on Base to give this workspace included memory operations for 30 days.
      </p>

      {entitlement ? (
        <div className="billing-entitlement">
          <span>current plan</span>
          <strong>{entitlement.plan_id}</strong>
          <span>
            {entitlement.remaining_operations.toLocaleString()} of {entitlement.included_operations.toLocaleString()} memory operations remaining
          </span>
          <span>renews manually after {new Date(entitlement.expires_at_unix_ms).toLocaleDateString()}</span>
        </div>
      ) : null}

      {!status?.configured ? (
        <p className="billing-state">Payments are not configured for this workspace yet.</p>
      ) : (
        <div className="billing-plans">
          {plans.map((plan) => (
            <article className="billing-plan" key={plan.id}>
              <span>{plan.name}</span>
              <strong>{plan.amount}</strong>
              <p>{plan.operations} included for 30 days.</p>
              <button
                type="button"
                disabled={busyPlan !== null || !orgId}
                onClick={() => void payForPlan(plan.id)}
              >
                {busyPlan === plan.id ? <WalletCards size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                {busyPlan === plan.id ? "Confirming" : `Pay ${plan.amount}`}
              </button>
            </article>
          ))}
        </div>
      )}

      {walletAddress ? <p className="billing-state">wallet: {walletAddress}</p> : null}
      {notice ? (
        <p className="billing-state">
          {notice.startsWith("Plan unlocked. Transaction:") ? (
            <a href={notice.replace("Plan unlocked. Transaction: ", "")} target="_blank" rel="noreferrer">
              Plan unlocked. View transaction <ExternalLink size={13} aria-hidden="true" />
            </a>
          ) : (
            notice
          )}
        </p>
      ) : null}
      {error ? <p className="auth-error">{error}</p> : null}
    </section>
  );
}

function checkoutAuthorizationMessage(intent: CheckoutIntent, orgId: string, transactionHash: Hex) {
  return [
    "Energon OS checkout",
    `intent: ${intent.intent_id}`,
    `organization: ${orgId}`,
    `plan: ${intent.plan_id}`,
    `amount_usdc_micro: ${intent.amount_usdc_micro}`,
    `transaction: ${transactionHash}`,
  ].join("\n");
}

function readError(body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const value = (body as { error: unknown }).error;
    if (typeof value === "string") return value;
  }
  return JSON.stringify(body);
}
