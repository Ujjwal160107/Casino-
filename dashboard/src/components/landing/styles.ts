/**
 * Plain style tokens for the landing page. Kept out of the "use client" kit
 * on purpose: a value exported from a client module reaches server components
 * as a client reference, so these strings would arrive undefined there.
 */

/** Primary and secondary buttons in the Maximal Mono style. */
export const btn = {
  base: "inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full border-[3px] px-6 font-body text-[15px] font-extrabold uppercase tracking-[.05em] transition-[transform,box-shadow,background-color,color,translate] duration-150 active:translate-y-0.5",
  main: "border-gold bg-gold text-bg shadow-[4px_4px_0_var(--color-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)]",
  ghost: "border-ink bg-transparent text-ink hover:bg-ink hover:text-bg",
  lg: "min-h-14 px-8 text-[17px]",
};
