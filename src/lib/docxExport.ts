import {
  AlignmentType,
  BorderStyle,
  Document,
  Paragraph,
  Packer,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { PrimitiveTranslationBlock } from "./primitiveTranslation";

export type DocxLayoutMode =
  | "aligned-tables"
  | "spaced-lines"
  | "plain-paragraphs";

interface DownloadPrimitiveTranslationDocxArgs {
  blocks: PrimitiveTranslationBlock[];
  sourceLanguage: string;
  targetLanguage: string;
  layoutMode: DocxLayoutMode;
}

function createWordCell(text: string, widthTwips: number, bold = false) {
  return new TableCell({
    width: {
      size: widthTwips,
      type: WidthType.DXA,
    },
    margins: {
      top: 100,
      bottom: 100,
      left: 100,
      right: 100,
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            size: 20,
            bold,
          }),
        ],
      }),
    ],
  });
}

function buildWordColumns(block: PrimitiveTranslationBlock) {
  const columnCount = Math.max(
    block.sourceTokens.length,
    block.translatedTokens.length,
  );
  const wordLengths = Array.from({ length: columnCount }, (_, index) => {
    const sourceTokenLength = block.sourceTokens[index]?.length ?? 0;
    const translatedTokenLength = block.translatedTokens[index]?.length ?? 0;
    return Math.max(sourceTokenLength, translatedTokenLength, 1);
  });

  // Keep the table as compact as possible: width is based on the actual word length
  // with a small buffer for alignment, not on the full sentence length.
  return wordLengths.map((length) => {
    const paddedLength = length + 1;
    return Math.max(360, paddedLength * 120);
  });
}

function createMonospaceParagraph(
  text: string,
  bold = false,
  spacingAfter = 0,
) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 20,
        bold,
        font: "Courier New",
      }),
    ],
    spacing: {
      after: spacingAfter,
    },
  });
}

function padWordsToColumns(words: string[], columnWidths: number[]) {
  return columnWidths
    .map((width, index) => {
      const word = words[index] ?? "";
      const approxChars = Math.max(1, Math.floor(width / 120) - 1);
      return word.padEnd(approxChars, " ");
    })
    .join(" ")
    .trimEnd();
}

export async function downloadPrimitiveTranslationDocx({
  blocks,
  sourceLanguage,
  targetLanguage,
  layoutMode,
}: DownloadPrimitiveTranslationDocxArgs) {
  const bodyChildren: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({
          text: "Primitive Translation Handout",
          bold: true,
          size: 28,
        }),
      ],
      spacing: {
        after: 180,
      },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Source: ${sourceLanguage}    Target: ${targetLanguage}`,
          size: 18,
        }),
      ],
      spacing: {
        after: 280,
      },
    }),
  ];

  for (const block of blocks) {
    if (layoutMode === "aligned-tables") {
      const wordColumns = buildWordColumns(block);
      const sourceRow = new TableRow({
        children: wordColumns.map((width, index) =>
          createWordCell(block.sourceTokens[index] ?? "", width, true),
        ),
      });
      const translationRow = new TableRow({
        children: wordColumns.map((width, index) =>
          createWordCell(block.translatedTokens[index] ?? "", width, false),
        ),
      });

      const tableWidth = wordColumns.reduce((s, w) => s + w, 0) || 720;

      bodyChildren.push(
        new Table({
          rows: [sourceRow, translationRow],
          width: {
            size: tableWidth,
            type: WidthType.DXA,
          },
          layout: TableLayoutType.FIXED,
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: {
              style: BorderStyle.NONE,
              size: 0,
              color: "FFFFFF",
            },
            insideVertical: {
              style: BorderStyle.NONE,
              size: 0,
              color: "FFFFFF",
            },
          },
        }),
        new Paragraph({
          spacing: {
            after: 200,
          },
        }),
      );
      continue;
    }

    if (layoutMode === "spaced-lines") {
      const wordColumns = buildWordColumns(block);
      bodyChildren.push(
        createMonospaceParagraph(
          padWordsToColumns(block.sourceTokens, wordColumns),
          true,
          60,
        ),
        createMonospaceParagraph(
          padWordsToColumns(block.translatedTokens, wordColumns),
          false,
          200,
        ),
      );
      continue;
    }

    bodyChildren.push(
      createMonospaceParagraph(block.sourceSentence, false, 60),
      createMonospaceParagraph(block.translatedSentence, false, 200),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children: bodyChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const downloadUrl = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = downloadUrl;
  link.download = `primitive-translation-${sourceLanguage}-${targetLanguage}.docx`;
  link.click();
  URL.revokeObjectURL(downloadUrl);
}
