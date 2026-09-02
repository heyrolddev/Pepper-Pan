"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { askHq, askTopic, type Answer } from "@/app/admin/ask/actions";
import { suggestions, topicsByGroup, type GuideTopic } from "@/lib/hq-guide";

type Turn =
  | { role: "you"; text: string }
  | { role: "hq"; answer: Answer };

/**
 * Ask HQ.
 *
 * Written as a conversation rather than a searchable manual because the
 * question an owner has is a question, not a keyword — "bakit ganito ang
 * kita ko" is not a heading anyone would think to look under. The topic list
 * is still there underneath, because a conversation with something that only
 * knows forty things is cruel unless you can see the forty.
 */
export function HqAssistant() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function run(label: string, work: () => Promise<Answer>) {
    setTurns((t) => [...t, { role: "you", text: label }]);
    setDraft("");
    startTransition(async () => {
      const answer = await work();
      setTurns((t) => [...t, { role: "hq", answer }]);
      // After the reply, not before: scrolling to a space that has not been
      // filled yet lands above the thing you wanted to read.
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    });
  }

  const ask = (q: string) => q.trim() && run(q.trim(), () => askHq(q.trim()));
  const pick = (t: GuideTopic) => run(t.question, () => askTopic(t.id));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        {turns.length === 0 && <Intro onPick={pick} />}

        {turns.map((turn, i) =>
          turn.role === "you" ? (
            <p
              key={i}
              className="max-w-[85%] self-end rounded-3xl rounded-br-lg bg-ink-950 px-5 py-3 text-cream-50"
            >
              {turn.text}
            </p>
          ) : (
            <Reply key={i} answer={turn.answer} />
          )
        )}

        {pending && (
          <p className="max-w-[85%] rounded-3xl rounded-bl-lg bg-cream-100 px-5 py-3 text-sm text-ink-800/60 ring-1 ring-ink-950/10">
            Working it out…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="sticky bottom-4 flex gap-2 rounded-3xl bg-cream-50 p-2 shadow-lg ring-1 ring-ink-950/10"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything — “paano naging ganyan ang net profit?”"
          className="min-w-0 flex-1 rounded-2xl bg-cream-100 px-4 py-3 text-ink-950 outline-none ring-1 ring-ink-950/10 focus:ring-2 focus:ring-gold-400"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="shrink-0 rounded-2xl bg-brand-600 px-5 py-3 font-bold text-cream-50 transition-colors hover:bg-brand-700 disabled:bg-ink-950/15 disabled:text-ink-800/40"
        >
          Ask
        </button>
      </form>

      <div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-black uppercase tracking-widest text-ink-800/50 hover:text-brand-600"
        >
          {showAll ? "Hide" : "Show"} everything I can answer
        </button>
        {showAll && (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {topicsByGroup().map(({ group, topics }) => (
              <div key={group}>
                <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/40">
                  {group}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {topics.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => pick(t)}
                        className="text-left text-sm text-ink-800/75 hover:text-brand-600 hover:underline"
                      >
                        {t.question}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Intro({ onPick }: { onPick: (t: GuideTopic) => void }) {
  return (
    <div className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
      <p className="font-display text-xl font-black text-ink-950">
        Ask me about your own shop.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-ink-800/70">
        I know every screen in here, what each number means, and how it was
        worked out — and for the money ones I&apos;ll show you the actual
        arithmetic with <strong>your</strong> figures, not an example. English
        or Taglish, parehas lang.
      </p>
      <p className="mt-3 max-w-2xl text-xs text-ink-800/50">
        I answer from what is in your own database. That means I can&apos;t
        invent an answer — but it also means there are questions I simply
        don&apos;t know, and I&apos;ll say so rather than make something up.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {suggestions().map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t)}
            className="rounded-full bg-cream-50 px-4 py-2 text-sm font-semibold text-ink-800 ring-1 ring-ink-950/10 transition-colors hover:bg-gold-400 hover:text-ink-950"
          >
            {t.question}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One reply.
 *
 * Exported so it can be mounted on its own with a known answer. The panel
 * around it is behind an owner session, and a renderer that cannot be loaded
 * without logging in is a renderer nobody ever looks at — which is how a sum
 * ships with its columns not lining up.
 */
export function Reply({ answer }: { answer: Answer }) {
  return (
    <div className="max-w-[92%] rounded-3xl rounded-bl-lg bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <p className="whitespace-pre-line text-ink-800/85">{answer.text}</p>

      {answer.numbers && (
        // Monospaced and boxed, because it is a sum. Columns that don't line
        // up are a sum you have to squint at to check, and the whole promise
        // here is that you can check it.
        //
        // Wrapping rather than scrolling: the sum lines are short enough to
        // never wrap, and the sentence that explains them is long enough to
        // be cut in half by a scrollbar nobody notices is there.
        <pre className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-ink-950 p-4 font-mono text-[12.5px] leading-relaxed text-cream-100">
          {answer.numbers}
        </pre>
      )}

      {answer.where && (
        <Link
          href={answer.where.href}
          className="mt-4 inline-block rounded-full bg-ink-950 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400 transition-transform hover:scale-105"
        >
          Open {answer.where.label} →
        </Link>
      )}
    </div>
  );
}
