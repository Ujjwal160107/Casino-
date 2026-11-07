import { getTopGGReviews } from "@/lib/topgg-reviews";
import { Container, Reveal, Section } from "./kit";

interface Review {
    id: string;
    username: string;
    avatar: string;
    content: string;
    score: number;
    date: string;
}

// Scraped top.gg text carries debris: a leading "• 2 days ago", a trailing
// vote count ("…servers. 3"), an owner reply ("3 Fortuna • Replying to …")
// and "… Read more 3" on truncated reviews. Strip it; end a truncated review
// with one clean ellipsis.
function cleanContent(text: string) {
    let t = text
        .replace(/^[•\s]*(?:\d+|an?)\s+(?:days?|hours?|minutes?|seconds?)\s+ago\s*/i, "")
        .replace(/\s*\d*\s*Fortuna\s*•\s*Replying to[\s\S]*$/i, "")
        .trim();
    const truncated = /\bRead more(?:\s+\d+)*$/i.test(t);
    t = t
        .replace(/\s*\bRead more(?:\s+\d+)*$/i, "")
        .replace(/(?:\s+\d+)+$/, "")
        .trim();
    return truncated ? `${t.replace(/[\s.…,;:]+$/, "")}…` : t;
}

/** A numberless head in the SectionHead style (kit's head always carries a number). */
function ReviewsHead() {
    return (
        <div className="mb-16 grid gap-3 border-b-[3px] border-ink pb-5">
            <h2 className="font-display text-[clamp(46px,6.4vw,104px)] font-black uppercase leading-[.85]">
                What players <em className="not-italic text-gold">say.</em>
            </h2>
            <p className="max-w-[56ch] text-lg text-ink-2">Real reviews from top.gg.</p>
        </div>
    );
}

export async function TopGGReviews() {
    const data = await getTopGGReviews();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the scraped reviews.json is untyped.
    const reviews: Review[] = (data ?? []).map((r: any) => ({
        id: r.id || "unknown",
        username: r.username || "Anonymous",
        avatar: r.avatar || "",
        content: r.review || r.content || "",
        score: r.rating || r.score || 5,
        date: r.date || new Date().toISOString(),
    }));

    if (!reviews || reviews.length === 0) {
        return null;
    }

    const shown = reviews.slice(0, 6);

    return (
        <Section id="reviews">
            <Container>
                <ReviewsHead />
                {/* Balanced columns: cards keep their own height instead of stretching to the row's tallest. */}
                <ul className="m-0 list-none columns-1 gap-6 p-0 md:columns-2 lg:columns-3">
                    {shown.map((r, i) => (
                        <Reveal key={r.id} as="li" delay={(i % 3) * 80} className="mb-6 grid break-inside-avoid gap-4 rounded-[18px] border-[3px] border-ink p-8">
                            <div className="flex gap-1 text-xl text-gold" role="img" aria-label={`${r.score} out of 5`}>
                                {[...Array(5)].map((_, n) => (
                                    <span key={n} aria-hidden className={n < r.score ? "" : "opacity-25"}>
                                        ♦
                                    </span>
                                ))}
                            </div>
                            <blockquote className="m-0 text-lg leading-relaxed text-ink-2">
                                &ldquo;{cleanContent(r.content)}&rdquo;
                            </blockquote>
                            <p className="font-mono text-sm font-bold uppercase tracking-[.12em] text-ink">{r.username}</p>
                        </Reveal>
                    ))}
                </ul>
            </Container>
        </Section>
    );
}
