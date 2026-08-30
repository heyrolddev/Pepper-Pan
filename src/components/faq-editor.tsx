"use client";

import { useState } from "react";
import {
  teachAnswer,
  updateFaqEntry,
  deleteFaqEntry,
} from "@/app/admin/inbox/actions";
import { deriveTriggers } from "@/lib/faq";
import { formatDateTime } from "@/lib/format-date";

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  triggers: string[];
  is_active: boolean;
  hits: number;
  priority: number;
  updated_at: string;
};

const fieldClass =
  "rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm outline-none focus:border-brand-600";
const labelClass =
  "flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-ink-800";

/** The trigger words that will actually be saved, shown before saving. */
function TriggerPreview({ source }: { source: string }) {
  const preview = deriveTriggers(source);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold text-ink-800/55">
        Will trigger on:
      </span>
      {preview.length === 0 ? (
        <span className="text-[11px] font-semibold text-brand-700">
          nothing yet — add a word
        </span>
      ) : (
        preview.map((t) => (
          <span
            key={t}
            className="rounded-full bg-ink-950 px-2 py-0.5 font-mono text-[10px] font-bold text-gold-400"
          >
            {t}
          </span>
        ))
      )}
    </div>
  );
}

export function FaqEditor({ rows }: { rows: FaqRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      {adding ? (
        <NewAnswer onDone={() => setAdding(false)} onError={setError} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="self-start rounded-full bg-brand-600 px-6 py-3 font-bold text-cream-50 transition-transform hover:scale-105"
        >
          + Add an answer
        </button>
      )}

      {rows.length === 0 ? (
        <div className="rounded-3xl bg-cream-100 px-6 py-10 text-center ring-1 ring-ink-950/10">
          <p className="text-sm text-ink-800/60">
            No custom answers yet. Ask Pepper Pan still handles the menu,
            prices, delivery, payment, hours and your bestseller on its own —
            this is for everything else.
          </p>
          <p className="mt-2 text-sm text-ink-800/60">
            The quickest way to start: open <strong>Inbox</strong>, find a
            question it couldn&apos;t answer, and press{" "}
            <strong>Teach this answer</strong>.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) =>
            editingId === row.id ? (
              <li key={row.id}>
                <EditAnswer
                  row={row}
                  onDone={() => setEditingId(null)}
                  onError={setError}
                />
              </li>
            ) : (
              <li
                key={row.id}
                className={`rounded-3xl bg-cream-50 p-5 ring-1 ${
                  row.is_active ? "ring-ink-950/10" : "ring-ink-950/10 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink-950">{row.question}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800/75">
                      {row.answer}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setEditingId(row.id)}
                      className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {row.triggers.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-cream-200 px-2 py-0.5 font-mono text-[10px] font-bold text-ink-800"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <p className="mt-2 text-[11px] text-ink-800/45">
                  Used {row.hits} time{row.hits === 1 ? "" : "s"}
                  {row.priority > 0 && ` · priority ${row.priority}`}
                  {!row.is_active && " · switched off"} · updated{" "}
                  {formatDateTime(row.updated_at)}
                </p>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function NewAnswer({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [triggers, setTriggers] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await teachAnswer({
      question,
      answer,
      triggers: triggers || question,
    });
    setBusy(false);
    if (res.error) return onError(res.error);
    onDone();
  }

  const preview = deriveTriggers(triggers || question);

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-gold-50 p-5 ring-1 ring-gold-400/50">
      <p className="font-display text-lg font-black text-ink-950">
        A new answer
      </p>

      <label className={labelClass}>
        The question, as a customer would ask it
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="May parking ba kayo?"
          className={`${fieldClass} font-normal normal-case tracking-normal`}
        />
      </label>

      <label className={labelClass}>
        Your answer
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder="Meron po, sa harap mismo ng stall — libre po."
          className={`${fieldClass} resize-none font-normal normal-case tracking-normal`}
        />
      </label>

      <label className={labelClass}>
        Words that should reach it
        <input
          value={triggers}
          onChange={(e) => setTriggers(e.target.value)}
          placeholder="Leave blank to use the question's own words"
          className={`${fieldClass} font-normal normal-case tracking-normal`}
        />
      </label>

      <TriggerPreview source={triggers || question} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={busy || !answer.trim() || preview.length === 0}
          className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save answer"}
        </button>
        <button
          onClick={onDone}
          className="rounded-full px-4 py-2.5 text-sm font-bold text-ink-800 hover:text-brand-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditAnswer({
  row,
  onDone,
  onError,
}: {
  row: FaqRow;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [question, setQuestion] = useState(row.question);
  const [answer, setAnswer] = useState(row.answer);
  const [triggers, setTriggers] = useState(row.triggers.join(", "));
  const [isActive, setIsActive] = useState(row.is_active);
  const [priority, setPriority] = useState(row.priority);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const preview = deriveTriggers(triggers);

  async function save() {
    setBusy(true);
    const res = await updateFaqEntry({
      id: row.id,
      question,
      answer,
      triggers,
      isActive,
      priority,
    });
    setBusy(false);
    if (res.error) return onError(res.error);
    onDone();
  }

  async function remove() {
    setBusy(true);
    const res = await deleteFaqEntry(row.id);
    setBusy(false);
    if (res.error) return onError(res.error);
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-cream-100 p-5 ring-2 ring-brand-600/30">
      <label className={labelClass}>
        The question
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className={`${fieldClass} font-normal normal-case tracking-normal`}
        />
      </label>

      <label className={labelClass}>
        Your answer
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          className={`${fieldClass} resize-none font-normal normal-case tracking-normal`}
        />
      </label>

      <label className={labelClass}>
        Words that should reach it
        <input
          value={triggers}
          onChange={(e) => setTriggers(e.target.value)}
          className={`${fieldClass} font-normal normal-case tracking-normal`}
        />
      </label>

      <TriggerPreview source={triggers} />

      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          Live
        </label>

        <label className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          Priority
          <input
            type="number"
            min={0}
            max={99}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-20 rounded-xl border-2 border-ink-950/15 bg-cream-50 px-2 py-1 text-sm outline-none focus:border-brand-600"
          />
          <span className="text-[11px] font-medium text-ink-800/50">
            wins ties
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={busy || !answer.trim() || preview.length === 0}
          className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={onDone}
          className="rounded-full px-4 py-2.5 text-sm font-bold text-ink-800 hover:text-brand-600"
        >
          Cancel
        </button>

        {confirmDelete ? (
          <button
            onClick={remove}
            disabled={busy}
            className="ml-auto rounded-full bg-brand-600 px-4 py-2.5 text-sm font-bold text-cream-50"
          >
            Really delete?
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto rounded-full px-4 py-2.5 text-sm font-bold text-brand-700 hover:underline"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
