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

interface DownloadPrimitiveTranslationDocxArgs {
  blocks: PrimitiveTranslationBlock[];
  sourceLanguage: string;
  targetLanguage: string;
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

// label cell removed: we now bold source tokens instead of using a label column

function buildWordColumns(block: PrimitiveTranslationBlock) {
  const columnCount = Math.max(
    block.sourceTokens.length,
    block.translatedTokens.length,
  );
  const wordLengths = Array.from({ length: columnCount }, (_, index) => {
    const sourceTokenLength = block.sourceTokens[index]?.length ?? 0;
    const translatedTokenLength = block.translatedTokens[index]?.length ?? 0;
    return Math.max(sourceTokenLength, translatedTokenLength, 4);
  });

  const totalLength = wordLengths.reduce((sum, length) => sum + length, 0) || 1;
  const availableWidth = 9360; // max content width in twips (approx usable page width)

  // Compute proportional widths but cap each column to avoid huge gaps for short sentences
  const rawWidths = wordLengths.map((length) =>
    Math.max(720, Math.floor((availableWidth * length) / totalLength)),
  );
  const maxColumnWidth = 2880; // cap columns to ~2 inches to keep readability

  const cappedWidths = rawWidths.map((w) => Math.min(w, maxColumnWidth));

  // If capping reduced total width substantially, distribute remaining available width
  const sumCapped = cappedWidths.reduce((s, v) => s + v, 0);
  if (sumCapped >= availableWidth || columnCount === 0) {
    return cappedWidths;
  }

  // There is leftover space; keep table width equal to sum of columns so it won't be stretched to full page.
  return cappedWidths;
}

export async function downloadPrimitiveTranslationDocx({
  blocks,
  sourceLanguage,
  targetLanguage,
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

    // Table width: use the sum of column widths (DXA) so short sentences won't be stretched
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
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
      }),
      new Paragraph({
        spacing: {
          after: 200,
        },
      }),
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
