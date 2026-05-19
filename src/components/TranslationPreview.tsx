import type { PrimitiveTranslationBlock } from "../lib/primitiveTranslation";

interface TranslationPreviewProps {
  blocks: PrimitiveTranslationBlock[];
}

export function TranslationPreview({ blocks }: TranslationPreviewProps) {
  if (blocks.length === 0) {
    return (
      <div className="empty-state">
        <h3>No translation preview yet</h3>
        <p>
          Translate some sentences to see the source and translated words line
          up here.
        </p>
      </div>
    );
  }

  return (
    <div className="sentence-stack">
      {blocks.map((block) => {
        const columnCount = Math.max(
          block.sourceTokens.length,
          block.translatedTokens.length,
        );
        const columns = Array.from(
          { length: columnCount },
          (_, index) => index,
        );

        return (
          <article className="sentence-card" key={block.id}>
            <div className="sentence-row sentence-row--source">
              <div className="sentence-label">Source</div>
              <div
                className="word-grid"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, minmax(8ch, 1fr))`,
                }}
              >
                {columns.map((columnIndex) => (
                  <div
                    className="word-cell"
                    key={`${block.id}-source-${columnIndex}`}
                  >
                    {block.sourceTokens[columnIndex] ?? ""}
                  </div>
                ))}
              </div>
            </div>

            <div className="sentence-row sentence-row--translation">
              <div className="sentence-label">Translation</div>
              <div
                className="word-grid"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, minmax(8ch, 1fr))`,
                }}
              >
                {columns.map((columnIndex) => (
                  <div
                    className="word-cell word-cell--translation"
                    key={`${block.id}-translation-${columnIndex}`}
                  >
                    {block.translatedTokens[columnIndex] ?? ""}
                  </div>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
