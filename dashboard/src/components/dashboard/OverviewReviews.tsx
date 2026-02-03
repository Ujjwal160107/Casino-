import { getTopGGReviews } from "@/actions/public-actions";
import { Star, MessageSquareQuote } from "lucide-react";
import Image from "next/image";

export async function OverviewReviews() {
    const reviews = await getTopGGReviews();
    // Take only the last 3 for the overview to keep it clean, or random 3
    // Let's take the first 3 (usually most recent if sorted that way, or we can slice)
    const recentReviews = reviews.slice(0, 3);

    return (
        <div className="flex flex-col gap-6 w-full">
            <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-bold font-display text-white">Recent Feedback</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {recentReviews.map((review: any) => (
                    <div
                        key={review.id}
                        className="relative p-6 rounded-2xl glass-card flex flex-col gap-4 group hover:-translate-y-1 transition-transform duration-300"
                    >
                        {/* Quote Icon Background */}
                        <MessageSquareQuote className="absolute top-4 right-4 text-white/5 w-12 h-12 rotate-12 group-hover:text-primary/10 transition-colors" />

                        <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-zinc-800">
                                {review.avatar ? (
                                    <Image
                                        src={review.avatar}
                                        alt={review.username}
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-400 bg-white/5">
                                        {review.username.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-white">{review.username}</span>
                                <div className="flex gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                        <Star
                                            key={i}
                                            size={10}
                                            className={i < review.score ? "text-amber-400 fill-amber-400" : "text-zinc-700"}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1">
                            <p className="text-zinc-200 text-sm italic leading-relaxed line-clamp-4">
                                "{review.content}"
                            </p>
                        </div>

                        <div className="text-[10px] text-zinc-400 font-mono mt-2">
                            {new Date(review.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
