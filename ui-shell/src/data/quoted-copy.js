/**
 * Presentation-only parsing for the game's existing quotation conventions.
 * No copy is rewritten: quote marks and the attribution's leading —— remain
 * in the returned strings. Components may render text with white-space:
 * pre-line and render `source` directly in <cite>, without adding another dash.
 * Unattributed prose is left intact; a caller may explicitly style an entire
 * action motto as a quote without asking this parser to infer its authorship.
 */

const QUOTE_PAIRS = new Map([
  ["”", "“"],
  ["’", "‘"],
  ["」", "「"],
  ["』", "『"],
  ['"', '"'],
]);
const DATE = /(?:公元前)?\d{1,4}年(?:\d{1,2}月(?:\d{1,2}日)?)?/u;
const NARRATIVE_START =
  /^(?:然后|但是|不过|于是|因为|因此|也就是|这时|那个|嗯|来吧|结果|换句话说|事实上|几乎|为了|以便|同时)/u;
const EFFECT_BOUNDARY =
  /[ \t，；;]+(?=(?:SC\b|BE\b|LA\b|POP\b|ECO\b|EERF\b|人口|经济|科学|神学|秩序|稳定|兵力|本代文明|效果[：:]|影响[：:]))/u;

function citationEnd(text, dashIndex) {
  const newline = text.indexOf("\n", dashIndex);
  const lineEnd = newline < 0 ? text.length : newline;
  const line = text.slice(dashIndex + 2, lineEnd);
  const sentenceEnd = line.search(/[。！？!?]/u);
  let length = sentenceEnd < 0 ? line.length : sentenceEnd + 1;
  const date = DATE.exec(line);
  const scripture = /^[ \t]*《[^》\n]+》[ \t]*[，,]?[ \t]*\d+(?::\d+(?:[-–]\d+)?)?/u.exec(line);
  const referenceEnd = date ? date.index + date[0].length : scripture?.[0].length;
  if (referenceEnd != null) {
    // Consecutive trend reports are joined with a space by the engine. A
    // chapter/verse or year ends its citation before the next report begins.
    const punctuation = /^[。.!！？?]/u.test(line.slice(referenceEnd)) ? 1 : 0;
    length = Math.min(length, referenceEnd + punctuation);
  }
  // An inline effect can follow a year/book reference without a full stop.
  // Keep its original separating punctuation in the subsequent prose block.
  const effect = EFFECT_BOUNDARY.exec(line.slice(0, length));
  if (effect && effect.index > 0) length = effect.index;
  return dashIndex + 2 + length;
}

function explicitQuoteStart(text, contentEnd, lowerBound) {
  const close = text[contentEnd - 1];
  const open = QUOTE_PAIRS.get(close);
  if (!open) return null;
  if (open === close) {
    const index = text.lastIndexOf(open, contentEnd - 2);
    return index >= lowerBound ? index : null;
  }
  let depth = 1;
  for (let index = contentEnd - 2; index >= lowerBound; index -= 1) {
    if (text[index] === close) depth += 1;
    else if (text[index] === open && --depth === 0) return index;
  }
  return null;
}

function looksLikeAttribution(source, explicitlyQuoted, onOwnLine) {
  const attribution = source.slice(2).trim();
  if (!attribution || NARRATIVE_START.test(attribution)) return false;
  const book = /^《[^》]+》(?=$|[\s，,\d。.!])/u.test(attribution);
  const date = DATE.exec(attribution);
  const datedAuthor = date && /[，,]/u.test(attribution.slice(0, date.index));
  if (book || datedAuthor) return true;
  // A paired quotation or a dedicated attribution line can name an author
  // without a date. This is a shape check, never an author lookup.
  if (!explicitlyQuoted && !onOwnLine) return false;
  const name = attribution.replace(/[。.!！?？]$/u, "").trim();
  return (
    /^[\p{Script=Han}·・、]{2,30}$/u.test(name) || /^[A-Za-z][A-Za-z .’'\-]{1,70}$/u.test(name)
  );
}

/** @returns {Array<{type: 'prose'|'quote', text: string, source?: string}>} */
export function parseQuotedCopy(value) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [];
  const blocks = [];
  let cursor = 0;
  const addProse = (fragment) => {
    const trimmed = fragment.trim();
    if (trimmed) blocks.push({ type: "prose", text: trimmed });
  };

  for (const match of text.matchAll(/——/gu)) {
    const dashIndex = match.index;
    if (dashIndex < cursor) continue;
    let contentEnd = dashIndex;
    while (contentEnd > cursor && /\s/u.test(text[contentEnd - 1])) contentEnd -= 1;
    if (contentEnd === cursor) continue;
    const pairedStart = explicitQuoteStart(text, contentEnd, cursor);
    const onOwnLine = text.slice(contentEnd, dashIndex).includes("\n");
    const sourceEnd = citationEnd(text, dashIndex);
    const source = text.slice(dashIndex, sourceEnd).trim();
    if (!looksLikeAttribution(source, pairedStart !== null, onOwnLine)) continue;

    let quoteStart = pairedStart;
    if (quoteStart === null) {
      if (onOwnLine) {
        // Preserve multi-line poetry within the preceding paragraph.
        const paragraph = text.slice(cursor, contentEnd);
        const breaks = [...paragraph.matchAll(/\n[ \t]*\n/gu)];
        const lastBreak = breaks.at(-1);
        quoteStart = lastBreak ? cursor + lastBreak.index + lastBreak[0].length : cursor;
      } else {
        quoteStart = Math.max(cursor, text.lastIndexOf("\n", contentEnd - 1) + 1);
      }
      // Two original trend quotes have no leading newline. Keep the engine's
      // broadcast label as prose instead of attaching it to the quotation.
      const broadcast = /^[ \t]*(?:趋势播报：)?(?:科学|神学)(?:升级至|降级至)[^：\n]{1,12}：/u.exec(
        text.slice(quoteStart, contentEnd),
      );
      if (broadcast) quoteStart += broadcast[0].length;
    }
    const quoteText = text.slice(quoteStart, contentEnd).trim();
    if (!quoteText) continue;
    addProse(text.slice(cursor, quoteStart));
    blocks.push({ type: "quote", text: quoteText, source });
    cursor = sourceEnd;
  }
  addProse(text.slice(cursor));
  return blocks;
}

export default parseQuotedCopy;
