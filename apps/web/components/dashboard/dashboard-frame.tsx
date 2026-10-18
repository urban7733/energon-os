import Link from "next/link";
import {
  BookOpen,
  Bot,
  CreditCard,
  Database,
  LayoutDashboard,
  Network,
  PenLine,
  SlidersHorizontal,
} from "lucide-react";
import { EnergonWordmark } from "../brand/energon-mark";

const icons = {
  overview: LayoutDashboard,
  atlas: Network,
  agents: Bot,
  memory: Database,
  write: PenLine,
  billing: CreditCard,
  advanced: SlidersHorizontal,
} as const;

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: keyof typeof icons;
  active?: boolean;
};

type DashboardFrameProps = {
  nav: DashboardNavItem[];
  userEmail: string;
  workspaceLabel: string;
  section: string;
  title: string;
  subtitle: string;
  badge?: string;
  children: React.ReactNode;
};

/** Shared operator shell for the live dashboard and the public demo. */
export function DashboardFrame({
  nav,
  userEmail,
  workspaceLabel,
  section,
  title,
  subtitle,
  badge,
  children,
}: DashboardFrameProps) {
  const initial = userEmail.trim().charAt(0).toUpperCase() || "E";

  return (
    <div className="dx">
      <aside className="dx-side" aria-label="Dashboard navigation">
        <Link className="dx-brand" href="/" aria-label="Energon OS home">
          <EnergonWordmark size={24} />
        </Link>

        <div className="dx-workspace">
          <span className="dx-workspace-avatar" aria-hidden="true">
            {workspaceLabel.charAt(0).toUpperCase()}
          </span>
          <span className="dx-workspace-copy">
            <small>Workspace</small>
            <strong>{workspaceLabel}</strong>
          </span>
        </div>

        <nav className="dx-nav">
          <span className="dx-nav-label">Operate</span>
          {nav.map(({ label, href, icon, active }) => {
            const Icon = icons[icon];
            return (
              <Link key={href} href={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="dx-side-foot">
          <a className="dx-side-link" href="https://github.com/urban7733/energon-os/tree/main/docs" target="_blank" rel="noreferrer">
            <BookOpen size={15} aria-hidden="true" />
            Documentation
          </a>
          <div className="dx-user">
            <span className="dx-user-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="dx-user-copy">
              <strong>{userEmail}</strong>
              <small>Operator</small>
            </span>
          </div>
        </div>
      </aside>

      <div className="dx-main">
        <header className="dx-top">
          <div className="dx-crumbs">
            <span>{workspaceLabel}</span>
            <i aria-hidden="true">/</i>
            <strong>{section}</strong>
          </div>
          {badge ? (
            <span className="ex-chip">
              <span className="ex-dot ex-dot-live" />
              {badge}
            </span>
          ) : null}
        </header>

        <div className="dx-content">
          <header className="dx-page-head">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
