"use server";

import { can, getViewer } from "@/lib/auth";
import { findTopic, noMatchReply, opener, type GuideTopic } from "@/lib/hq-guide";
import { explain } from "@/lib/hq-guide-server";

export type Answer = {
  text: string;
  /** Live figures, worked out from the shop's own data. Absent for most topics. */
  numbers: string | null;
  where: GuideTopic["where"] | null;
  matched: boolean;
};

/**
 * Ask HQ a question.
 *
 * The capability check is the real gate, not the sidebar row: explaining a
 * figure means reading it, so an assistant that answered for a manager would
 * be a hole straight through the role that exists to keep the books from
 * them.
 */
export async function askHq(question: string): Promise<Answer> {
  if (!can(await getViewer(), "assistant")) {
    return {
      text: "This one is the owner's — it reads the books to explain them.",
      numbers: null,
      where: null,
      matched: false,
    };
  }

  const q = question.trim().slice(0, 500);
  const topic = findTopic(q);

  if (!topic) {
    return { text: noMatchReply(q), numbers: null, where: null, matched: false };
  }

  /* The figures are the nice half, not the answer.
     
     `explain` reads the shop's own numbers out of Supabase, and that read
     can fail for reasons that have nothing to do with the question — a
     dropped connection on a stall's network is the usual one. It used to be
     awaited bare, so a failed read rejected the whole server action and the
     page recorded "Load failed". The widget lives in the ROOT layout, so
     that error was filed against whatever page the person happened to be
     on: it showed up in the error log as a fault on /admin/counter, which
     is a screen that has nothing to do with it and would have been
     investigated as if it did.
     
     The explanation is still worth giving without its figures. */
  let numbers = null;
  if (topic.numbers) {
    try {
      numbers = await explain(topic.numbers);
    } catch (e) {
      console.error(`[ask] numbers for ${topic.id}: ${String(e)}`);
    }
  }
  const lead = opener(q, topic);

  return {
    text: lead ? `${lead}\n\n${topic.answer}` : topic.answer,
    numbers,
    where: topic.where ?? null,
    matched: true,
  };
}

/** The same, addressed straight at a topic — used by the suggestion chips. */
export async function askTopic(id: string): Promise<Answer> {
  const { TOPICS } = await import("@/lib/hq-guide");
  const topic = TOPICS.find((t) => t.id === id);
  if (!topic) return askHq(id);
  return askHq(topic.triggers[0] ?? topic.question);
}
