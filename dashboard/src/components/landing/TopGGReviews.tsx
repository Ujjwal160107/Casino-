"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getTopGGReviews } from "@/actions/public-actions";

interface Review {
    id: string;
    username: string;
    avatar: string;
    content: string;
    score: number;
    date: string;
}

export function TopGGReviews() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        async function fetchReviews() {
            try {
                const data = await getTopGGReviews();

                const mapped = data.map((r: any) => ({
                    id: r.id || "unknown",
                    username: r.username || "Anonymous",
                    avatar: r.avatar || "",
                    content: r.review || r.content || "",
                    score: r.rating || r.score || 5,
                    date: r.date || new Date().toISOString()
                }));

                setReviews(mapped);
            } catch (e) {
                console.error("[TopGG] Client fetch error:", e);
            }
        }
        fetchReviews();
    }, []);

    useEffect(() => {
        if (reviews.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % reviews.length);
        }, 5000); // Change every 5 seconds

        return () => clearInterval(interval);
    }, [reviews]);

    if (!reviews || reviews.length === 0) {
        return null; // Don't show anything if no reviews
    }

    const currentReview = reviews[currentIndex];

    // Function to render stars
    const renderStars = (score: number) => {
        return (
            <div className="flex gap-1 text-yellow-400">
                {[...Array(5)].map((_, i) => (
                    <svg
                        key={i}
                        className={`w-5 h-5 ${i < score ? "fill-current" : "text-gray-600 fill-current opacity-20"}`}
                        viewBox="0 0 20 20"
                    >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                ))}
            </div>
        );
    };

    return (
        <div className="w-full py-12 overflow-hidden relative">
            <div className="max-w-4xl mx-auto px-4 text-center">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent mb-8">
                    Loved by our Community
                </h2>

                <div className="relative h-48 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentReview.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-6 md:p-8 max-w-2xl w-full shadow-xl shadow-yellow-900/5 relative"
                        >
                            {/* Quote Icon */}
                            <div className="absolute top-4 left-4 text-white/5">
                                <svg className="w-12 h-12 fill-current" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V11C14.017 11.5523 13.5693 12 13.017 12H12.017V5H22.017V15C22.017 18.3137 19.3307 21 16.017 21H14.017ZM5.0166 21L5.0166 18C5.0166 16.8954 5.91203 16 7.0166 16H10.0166C10.5689 16 11.0166 15.5523 11.0166 15V9C11.0166 8.44772 10.5689 8 10.0166 8H6.0166C5.46432 8 5.0166 8.44772 5.0166 9V11C5.0166 11.5523 4.56889 12 4.0166 12H3.0166V5H13.0166V15C13.0166 18.3137 10.3303 21 7.0166 21H5.0166Z" /></svg>
                            </div>

                            <div className="flex flex-col items-center gap-4 relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    {/* Avatar Placeholder or Image */}
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden">
                                        {currentReview.avatar ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={currentReview.avatar} alt={currentReview.username} className="w-full h-full object-cover" />
                                        ) : (
                                            currentReview.username.slice(0, 2).toUpperCase()
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-white">{currentReview.username}</div>
                                        <div className="text-xs text-zinc-400">Top.gg Review</div>
                                    </div>
                                    <div className="ml-auto">
                                        {renderStars(currentReview.score)}
                                    </div>
                                </div>

                                <p className="text-zinc-300 italic text-lg line-clamp-3">
                                    "{currentReview.content}"
                                </p>
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Indicators */}
                <div className="flex justify-center gap-2 mt-6">
                    {reviews.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === currentIndex ? "bg-yellow-500 w-6" : "bg-white/20 hover:bg-white/40"
                                }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
