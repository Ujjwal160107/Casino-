import Image from "next/image";
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

const linkClass = "inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-gold sm:min-h-8";

export function Footer() {
  return (
    <footer className="border-t-[3px] border-ink bg-bg">
      <div className="mx-auto grid w-full max-w-[86rem] grid-cols-2 gap-x-6 gap-y-12 px-4 py-12 sm:px-6 md:grid-cols-6 lg:px-9">
        <div className="col-span-2 space-y-4">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-ink">
            <Image src="/fortuna_icon.png" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full border-2 border-ink" />
            <span className="font-display text-[26px] font-black uppercase leading-none">Fortuna</span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            A life simulator inside Discord. One wallet across every
            server. The house appreciates your business.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-[.14em] text-ink">{col.title}</h3>
            <ul className="space-y-1">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className={linkClass}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-[86rem] px-4 py-6 font-mono text-xs text-muted sm:px-6 lg:px-9">
          © {new Date().getFullYear()} Fortuna. The Fortunes are fake. The
          grudges are real.
        </p>
      </div>
    </footer>
  );
}
