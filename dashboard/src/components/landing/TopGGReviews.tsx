import { SectionHeader } from "@/components/ui/SectionHeader";
import { Panel } from "@/components/ui/Panel";
import { getTopGGReviews } from "@/lib/topgg-reviews";

interface Review {
    id: string;
    username: string;
    avatar: string;
    content: string;
    score: number;
    date: string;
}

// Strip leading top.gg noise like "• 2 days ago" from scraped review text.
function cleanContent(text: string) {
    return text
        .replace(/^[•\s]*(?:\d+|an?)\s+(?:days?|hours?|minutes?|seconds?)\s+ago\s*/i, "")
        .trim();
}

export async function TopGGReviews() {
    const data = await getTopGGReviews();

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
        <section className="mx-auto max-w-6xl px-6 py-20">
            <SectionHeader
                eyebrow="Word on the street"
                title="What players say"
                sub="Real reviews from top.gg. We didn't pay them. We can't afford to."
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((r) => (
                    <Panel key={r.id} className="p-6">
                        <div
                            className="flex gap-0.5 text-gold"
                            aria-label={`${r.score} out of 5`}
                        >
                            {[...Array(5)].map((_, i) => (
                                <span
                                    key={i}
                                    aria-hidden
                                    className={i < r.score ? "" : "opacity-25"}
                                >
                                    ♦
                                </span>
                            ))}
                        </div>
                        <p className="mt-3 leading-relaxed text-muted">
                            &ldquo;{cleanContent(r.content)}&rdquo;
                        </p>
                        <p className="mt-4 text-sm font-medium text-ink">
                            {r.username}
                        </p>
                    </Panel>
                ))}
            </div>
        </section>
    );
}
