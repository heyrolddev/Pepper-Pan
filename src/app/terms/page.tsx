import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SHOP } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms & conditions",
  description:
    "How ordering, paying, pickup, delivery and cancellations work at Pepper Pan.",
};

/**
 * What the shop is actually promising, written from what the system actually
 * does.
 *
 * Every clause here describes real behaviour somewhere in this codebase — the
 * ETA is an estimate because `eta_minutes` is a promise staff type in, GCash
 * is confirmed by hand because nothing here talks to GCash, only staff can
 * cancel because there is no customer-facing cancel action. Terms that
 * describe a different shop than the one the code runs are worse than no
 * terms: they're a promise nobody can keep.
 *
 * Deliberately not written as legalese. The people reading this are buying
 * noodles.
 */

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink-950/10 pt-8">
      <h2 className="flex items-baseline gap-3 font-display text-2xl font-black text-ink-950">
        <span className="text-base font-black text-brand-600">{n}</span>
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-ink-800/80">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="flex-1">
      <PageHeader
        compact
        eyebrow="The small print"
        title="Terms & conditions"
        subtitle="How ordering, paying and collecting work here — in plain English."
      />

      <section className="mx-auto max-w-3xl px-6 pb-20 pt-8">
        <p className="rounded-2xl bg-cream-100 p-5 text-sm text-ink-800/70 ring-1 ring-ink-950/10">
          {SHOP.name} is a food stall in {SHOP.locality}, {SHOP.region}. This
          page describes how we handle orders placed through this website. By
          placing an order you&apos;re agreeing to it. If anything here
          doesn&apos;t match what happened with your order, ring us on{" "}
          <a
            href={`tel:${SHOP.phoneHref}`}
            className="font-bold text-brand-600 hover:underline"
          >
            {SHOP.phone}
          </a>{" "}
          — a phone call sorts most things faster than a policy does.
        </p>

        <div className="mt-10 flex flex-col gap-8">
          <Section n={1} title="Your account">
            <p>
              You need an account to order, so we can show you your orders and
              tell you when your food is ready. Keep your password to yourself —
              anything ordered from your account is treated as ordered by you.
            </p>
            <p>
              Give us a real name and a working mobile number. We use the number
              to reach you about your order, and a wrong one is the single most
              common reason food goes cold waiting.
            </p>
            <p>
              We may pause an account that repeatedly orders and doesn&apos;t
              collect, or that abuses staff. You can ask us to delete your
              account at any time.
            </p>
          </Section>

          <Section n={2} title="Prices and the menu">
            <p>
              Prices are in Philippine pesos and include what&apos;s shown on
              the item. What you pay is the price at the moment you place the
              order, even if the menu changes afterwards.
            </p>
            <p>
              We cook fresh and in small batches, so an item can run out during
              the day. If something you ordered is gone, we&apos;ll ring you
              before cooking the rest.
            </p>
          </Section>

          <Section n={3} title="Paying">
            <p>
              <strong className="text-ink-950">Cash</strong> is paid when you
              collect, or to the rider on delivery.
            </p>
            <p>
              <strong className="text-ink-950">GCash</strong> is sent in the
              GCash app to the number shown at checkout. You give us the
              reference number; a person here checks it against the shop&apos;s
              own GCash records before the order is marked paid. Nothing on this
              site is connected to GCash — an order sits as
              &ldquo;waiting for the shop to confirm&rdquo; until someone has
              actually looked.
            </p>
            <p>
              Where a <strong className="text-ink-950">down payment</strong> is
              offered, the balance is due on collection or delivery.
            </p>
          </Section>

          <Section n={4} title="Ordering ahead">
            <p>
              Booking a time has to be paid for up front — in full, or with a
              down payment. That&apos;s what holds the slot: we buy for it and
              set the time aside, and a booking nobody turns up for is
              ingredients and prep we can&apos;t sell to anyone else.
            </p>
            <p>
              We can only accept times when we&apos;re actually open. The
              checkout will tell you which times are available.
            </p>
          </Section>

          <Section n={5} title="How long it takes">
            <p>
              The countdown on your order is our{" "}
              <strong className="text-ink-950">best estimate</strong>, typed in
              by whoever is cooking. It is not a guarantee. A rush, a delivery
              of stock, or one big order ahead of yours will move it.
            </p>
            <p>
              We&apos;ll tell you when your food is actually ready — that
              message is the real one, not the timer.
            </p>
          </Section>

          <Section n={6} title="Pickup and delivery">
            <p>
              Pickup is at the stall: {SHOP.street}, {SHOP.locality}.
            </p>
            <p>
              For delivery, drop the pin on the map at checkout as exactly as
              you can. The fee is worked out from that pin and shown before you
              order, and there&apos;s a distance we can&apos;t go past — the
              checkout will say so rather than take an order we can&apos;t
              fulfil.
            </p>
            <p>
              Riders will call or text when they&apos;re close, so keep your
              phone nearby. If nobody answers and nobody comes down, the rider
              can&apos;t wait indefinitely — the food comes back to the stall
              and the order is still payable.
            </p>
          </Section>

          <Section n={7} title="Changes and cancellations">
            <p>
              There&apos;s no cancel button on this site, and that&apos;s
              deliberate: once an order reaches the kitchen it&apos;s food, not
              a line in a database.{" "}
              <strong className="text-ink-950">
                Ring us on {SHOP.phone}
              </strong>{" "}
              and we&apos;ll sort it — if we haven&apos;t started cooking, we
              can usually cancel or change it.
            </p>
            <p>
              We may cancel an order ourselves — we&apos;ve run out, the address
              is outside our range, or we can&apos;t reach you. You&apos;ll see
              the reason on the order, and anything already paid is refunded.
            </p>
          </Section>

          <Section n={8} title="If something's wrong with your food">
            <p>
              Tell us the same day, ideally before you finish it, and bring or
              send a photo. We&apos;ll replace it or refund it. We&apos;d much
              rather hear it from you than read it in a review.
            </p>
          </Section>

          <Section n={9} title="Allergies">
            <p>
              We cook everything in one small kitchen. Peanuts, soy, wheat,
              eggs, shellfish and sesame are all in regular use, and we
              can&apos;t promise any dish is free of traces of them. If you have
              a serious allergy, please ring us before ordering rather than
              relying on the notes box.
            </p>
          </Section>

          <Section n={10} title="Reviews">
            <p>
              You can review dishes you&apos;ve actually ordered. Say what you
              like — we may reply publicly, and we&apos;ll hide anything abusive
              or aimed at a person rather than the food.
            </p>
          </Section>

          <Section n={11} title="Notifications">
            <p>
              If you turn on notifications, we use them only for your own
              orders. It&apos;s per device, and you can turn it off in{" "}
              <Link href="/account" className="font-bold text-brand-600 hover:underline">
                your account
              </Link>{" "}
              or in your browser at any time. We don&apos;t send ads that way.
            </p>
          </Section>

          <Section n={12} title="Your details">
            <p>
              We keep your name, mobile number, email, delivery address and pin,
              and your order history — because we need them to cook, deliver and
              answer questions about your order. We don&apos;t sell them, and we
              don&apos;t pass them to anyone except the rider bringing your
              food.
            </p>
            <p>
              Ask us and we&apos;ll delete your account and its personal
              details. We keep the bare sales record, without your details, for
              the shop&apos;s books.
            </p>
          </Section>

          <Section n={13} title="Changes to these terms">
            <p>
              We&apos;ll update this page as the shop changes. The version here
              when you place an order is the one that applies to it.
            </p>
          </Section>
        </div>

        <p className="mt-12 rounded-2xl bg-gold-400/15 p-5 text-sm text-ink-800/70 ring-1 ring-gold-400/40">
          <strong className="text-ink-950">Questions?</strong> Ring{" "}
          <a
            href={`tel:${SHOP.phoneHref}`}
            className="font-bold text-brand-600 hover:underline"
          >
            {SHOP.phone}
          </a>
          , message us on any of the accounts linked at the bottom of this page,
          or ask through{" "}
          <Link href="/menu" className="font-bold text-brand-600 hover:underline">
            the site
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
