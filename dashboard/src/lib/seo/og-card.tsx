import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/site";
import { OG_SIZE } from "./metadata";

/**
 * The social card in the site's Ink & Gold style: a gold eyebrow, a giant
 * condensed title, a tagline and the page's address. Every opengraph-image
 * route renders through here; only the words change.
 */

const INK = "#0c0c0c";
const BONE = "#f3efe6";
const GOLD = "#ffb400";
const MUTED = "#9a958b";

const fromRoot = (...p: string[]) => path.join(process.cwd(), ...p);

async function assets() {
  const [display, mono, icon] = await Promise.all([
    readFile(fromRoot("src/assets/fonts/BigShoulders-Black.ttf")),
    readFile(fromRoot("src/assets/fonts/JetBrainsMono-Bold.ttf")),
    readFile(fromRoot("public/fortuna_icon.png")),
  ]);
  return { display, mono, icon: `data:image/png;base64,${icon.toString("base64")}` };
}

/**
 * Title size that keeps the title on one line: Big Shoulders Black caps run
 * about half an em wide, across the card's ~1040px of usable width.
 */
function titleSize(title: string) {
  return Math.min(260, Math.floor(1040 / (title.length * 0.5)));
}

export async function renderOgCard({
  eyebrow,
  title,
  tagline,
  pagePath,
}: {
  eyebrow: string;
  title: string;
  tagline: string;
  /** the page's site path, printed bottom-left after the host */
  pagePath: string;
}) {
  const { display, mono, icon } = await assets();
  const address = `${new URL(SITE_URL).host}${pagePath === "/" ? "" : pagePath}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: INK,
          color: BONE,
          padding: "56px 72px",
          borderBottom: `24px solid ${GOLD}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> only */}
          <img src={icon} width={72} height={72} alt="" style={{ borderRadius: 72, border: `4px solid ${BONE}` }} />
          <div style={{ display: "flex", width: 44, height: 6, background: GOLD }} />
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 28, letterSpacing: 4, color: GOLD, textTransform: "uppercase" }}>
            {eyebrow}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
            fontFamily: "Display",
            fontSize: titleSize(title),
            lineHeight: 0.86,
            textTransform: "uppercase",
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", fontFamily: "Display", fontSize: 50, lineHeight: 1.05, color: BONE, maxWidth: 1000 }}>
          {tagline}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 28,
            paddingTop: 22,
            borderTop: `3px solid ${BONE}`,
            fontFamily: "Mono",
            fontSize: 24,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>{address}</div>
          <div style={{ display: "flex", color: GOLD }}>FREE ON DISCORD</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Display", data: display, weight: 900, style: "normal" },
        { name: "Mono", data: mono, weight: 700, style: "normal" },
      ],
    },
  );
}
