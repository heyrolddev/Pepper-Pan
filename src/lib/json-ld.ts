/**
 * Structured data, safe to put inside a <script> tag.
 *
 * `JSON.stringify` escapes quotes and backslashes but leaves "<" alone, and
 * an HTML parser does not care that it is reading JSON — it stops the script
 * at the first "</script>" it sees. Shop content reaches these blocks: dish
 * names, opening notes, and review text a customer typed. A review of
 * "great</script><script>…" would close the tag early and have the rest of
 * that stranger's message parsed as markup on the shop's own homepage.
 *
 * Escaping "<" as its unicode form removes the sequence while leaving the
 * JSON identical to a parser, so the text survives exactly as written.
 *
 * This lived as the same `.replace` written out in each of the three schema
 * components. Three copies of a security control is two chances to drop one
 * in an edit and never notice, because nothing looks different afterwards.
 */
export function jsonLd(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}
