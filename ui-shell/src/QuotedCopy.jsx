import { parseQuotedCopy } from "./data/quoted-copy.js";
import "./quoted-copy.css";

// Typography only: retain the engine's prose and attribution verbatim.
export default function QuotedCopy({ text, quoteOnly = false, compact = false, className = "" }) {
  const blocks = parseQuotedCopy(text);
  const hasQuote = quoteOnly || blocks.some((block) => block.type === "quote");
  return (
    <div
      className={`game-quoted-copy ${compact ? "is-compact" : ""} ${hasQuote ? "has-quote" : ""} ${className}`}
    >
      {blocks.map((block, index) =>
        block.type === "quote" || quoteOnly ? (
          <figure key={index}>
            <blockquote>{block.text}</blockquote>
            {block.source && (
              <figcaption>
                <cite>{block.source}</cite>
              </figcaption>
            )}
          </figure>
        ) : (
          <p key={index}>{block.text}</p>
        ),
      )}
    </div>
  );
}
