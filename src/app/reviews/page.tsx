import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Stars } from "@/components/stars";
import { ReviewList } from "@/components/review-list";
import { getPublicReviews } from "@/lib/reviews-server";
import { isConfigured } from "@/lib/auth";

export const metadata = {
  title: "Reviews · Pepper Pan",
  description: "What our customers say about Pepper Pan.",
};

export default async function ReviewsPage() {
  const { reviews, average, count } = isConfigured()
    ? await getPublicReviews(100)
    : { reviews: [], average: 0, count: 0 };

  // A distribution bar reads better than five numbers, and it's one measure
  // across five ordered buckets — so one hue, darkest at the top score.
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    n: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Straight from the customers"
        title="Reviews"
        subtitle={
          count > 0
            ? `${average.toFixed(1)} out of 5 from ${count} review${count === 1 ? "" : "s"}.`
            : "Be the first to tell us how we did."
        }
      />

      <section className="mx-auto max-w-3xl px-6 py-14">
        {count === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-10 text-center">
            <p className="font-display text-2xl font-bold text-ink-950">
              No reviews yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-ink-800/70">
              Only customers who&apos;ve actually received an order can leave
              one — so every review here is from a real Pepper Pan meal.
            </p>
            <Link
              href="/menu"
              className="mt-6 inline-block rounded-full bg-brand-600 px-7 py-3 font-bold text-cream-50 transition-transform hover:scale-105"
            >
              Order something →
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-10 flex flex-col items-center gap-6 rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10 sm:flex-row sm:items-start">
              <div className="text-center">
                <p className="font-display text-6xl font-black text-brand-600">
                  {average.toFixed(1)}
                </p>
                <Stars rating={average} size="md" className="mt-1" />
                <p className="mt-1 text-xs text-ink-800/55">
                  {count} review{count === 1 ? "" : "s"}
                </p>
              </div>

              <ul className="flex w-full flex-col gap-1.5">
                {buckets.map(({ star, n }) => (
                  <li key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-10 shrink-0 font-semibold text-ink-800/70">
                      {star} star
                    </span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-950/10">
                      <span
                        className="block h-full rounded-full bg-gold-500"
                        style={{ width: `${count ? (n / count) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right font-semibold text-ink-800/70">
                      {n}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <ReviewList reviews={reviews} />

            <p className="mt-10 text-center text-sm text-ink-800/55">
              Only customers who&apos;ve received an order can review, so every
              rating here comes from a real meal.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
