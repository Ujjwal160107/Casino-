"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Footer } from "@/components/Footer";
import { GeneralSidebar } from "@/components/GeneralSidebar";
import { Github, Twitter, Linkedin, MessageCircle, Code, Palette, Cpu } from "lucide-react";

export default function TeamPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-violet-500/30">
            <LandingNavbar hideLogin={true} />

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-violet-900/20 to-transparent pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400 mb-6"
                    >
                        Meet the Team
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-zinc-400 max-w-2xl mx-auto"
                    >
                        The minds behind Fortuna.
                    </motion.p>
                </div>
            </section>

            {/* Team Grid */}
            <div className="max-w-[1400px] mx-auto px-6 pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="col-span-2">
                    <GeneralSidebar />
                </div>

                <div className="col-span-1 lg:col-span-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <TeamMemberCard
                            name="BEAST"
                            role="Lead Developer"
                            image="/team/beast.png"
                            desc="Architect of Fortuna's core systems. Beast ensures high resilience, security, and scalability under load, powering the entire ecosystem."
                            delay={0.2}
                        />

                        <TeamMemberCard
                            name="RACHIT"
                            role="Developer"
                            image="/team/rachit.png"
                            desc="Bridging complex logic and user experience. Rachit optimizes game mechanics and squashes bugs for fluid, responsive interactions."
                            delay={0.3}
                        />

                        <TeamMemberCard
                            name="LAKSHAY"
                            role="Creativity & Development Head"
                            image="/team/lakshay.png"
                            desc="Leading the vision for Fortuna's aesthetic and feel. Lakshay ensures every feature is refined, intuitive, and visually stunning."
                            delay={0.4}
                        />
                    </div>
                </div>
            </div>

            <Footer />
        </main>
    );
}

function TeamMemberCard({
    name,
    role,
    desc,
    image,
    delay,
}: {
    name: string;
    role: string;
    desc: string;
    image: string;
    delay: number;
}) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 500, damping: 100 });
    const mouseY = useSpring(y, { stiffness: 500, damping: 100 });

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        const xPos = clientX - left;
        const yPos = clientY - top;
        // Center of the car
        const centerX = width / 2;
        const centerY = height / 2;

        const rotateXVal = ((yPos - centerY) / centerY) * -10; // Invert Y for tilt
        const rotateYVal = ((xPos - centerX) / centerX) * 10;

        x.set(rotateYVal);
        y.set(rotateXVal);
    }

    function handleMouseLeave() {
        x.set(0);
        y.set(0);
    }

    const rotateX = useTransform(mouseY, (val) => val);
    const rotateY = useTransform(mouseX, (val) => val);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            style={{ perspective: 1000 }}
            className="group h-full"
        >
            <motion.div
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                    rotateX: mouseY,
                    rotateY: mouseX,
                    transformStyle: "preserve-3d",
                }}
                className="h-full"
            >
                <GlassCard className="h-full p-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:bg-white/5">

                    {/* Glow Effect */}
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors pointer-events-none" />

                    {/* Header with PFP */}
                    <div className="flex items-center gap-5 mb-6 relative z-10 pointer-events-none transform-gpu" style={{ transform: "translateZ(20px)" }}>
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/10 shadow-lg shrink-0">
                            <img src={image} alt={name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-white tracking-wide">{name}</h3>
                            <p className="text-sm font-medium uppercase tracking-wider text-zinc-500 group-hover:text-zinc-400 transition-colors">
                                {role}
                            </p>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="flex-1 relative z-10 pointer-events-none transform-gpu" style={{ transform: "translateZ(10px)" }}>
                        <p className="text-zinc-400 leading-relaxed text-sm">
                            {desc}
                        </p>
                    </div>

                </GlassCard>
            </motion.div>
        </motion.div>
    );
}
