import Link from "next/link";
import { INVITE_URL, SUPPORT_URL, VOTE_URL } from "@/lib/links";

const COLUMNS: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}[] = [
  {
    title: "Play",
    links: [
      { href: "/commands", label: "Commands" },
      { href: "/docs/casino", label: "Casino games" },
      { href: "/docs/bank-and-credit", label: "Credit cards" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/docs/getting-started", label: "Getting started" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: SUPPORT_URL, label: "Support server", external: true },
      { href: VOTE_URL, label: "Vote on top.gg", external: true },
      { href: INVITE_URL, label: "Add to Discord", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/policy", label: "Privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-6 py-14 md:grid-cols-6">
        <div className="col-span-2 space-y-3">
          <p className="font-display text-xl font-bold text-ink">FORTUNA</p>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            A life simulator inside Discord. One wallet across every
            server. The house appreciates your business.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-sm font-bold text-ink">{col.title}</h3>
            <ul className="space-y-2">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line py-6 text-center">
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} Fortuna. The Fortunes are fake. The
          grudges are real.
        </p>
      </div>
    </footer>
  );
}
