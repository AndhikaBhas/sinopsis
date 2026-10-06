import {
  AlignmentType,
  Document,
  Table as DocxTable,
  TableCell as DocxTableCell,
  TableRow as DocxTableRow,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  VerticalAlign,
  WidthType,
  convertInchesToTwip,
} from "docx";
import sizeOf from "image-size";
import fs from "node:fs/promises";
import path from "node:path";
import type { ActionFunctionArgs } from "react-router";
import { getRapatById } from "~/models/rapat.server";

// Parse block-level markdown into docx paragraphs
function parseMarkdownToDocx(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split("\n");
  let indentBoostFromNumbered = false;

  for (const line of lines) {
    // Empty line
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: "" }));
      indentBoostFromNumbered = false;
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      paragraphs.push(new Paragraph({ text: line.substring(4), heading: HeadingLevel.HEADING_3 }));
      indentBoostFromNumbered = false;
      continue;
    }

    if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({ text: line.substring(3), heading: HeadingLevel.HEADING_2 }));
      indentBoostFromNumbered = false;
      continue;
    }

    if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({ text: line.substring(2), heading: HeadingLevel.HEADING_1 }));
      indentBoostFromNumbered = false;
      continue;
    }

    // Bullet points (- or *) with nesting based on leading spaces
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      const leadingSpaces = bulletMatch[1].length;
      const level = Math.min(Math.floor(leadingSpaces / 2), 4);
      const content = bulletMatch[2];
      // Slightly tighter indent progression; no extra boost after numbered lists
      // Reduce level 2 indent a bit
      const baseIndentInches = 0.25 + level * 0.13; // level0=0.25, level1=0.43, level2=0.61
      const indentLeft = convertInchesToTwip(baseIndentInches);

      paragraphs.push(
        new Paragraph({
          children: parseInlineMarkdown(content),
          numbering: { reference: "default-bullet", level },
          indent: { left: indentLeft, hanging: convertInchesToTwip(0.13) },
        })
      );
      // Keep boost active until a non-list block appears
      continue;
    }

    // Numbered lists (e.g., 1. item) with nesting based on leading spaces
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const leadingSpaces = numberedMatch[1].length;
      const level = Math.min(Math.floor(leadingSpaces / 2), 4);
      const content = numberedMatch[3];
      const baseIndentInches = 0.25 * (level + 1);
      const indentLeft = convertInchesToTwip(baseIndentInches);

      paragraphs.push(
        new Paragraph({
          children: parseInlineMarkdown(content),
          numbering: { reference: "default-numbering", level },
          indent: { left: indentLeft, hanging: convertInchesToTwip(0.13) },
        })
      );
      indentBoostFromNumbered = true;
      continue;
    }

    // Regular paragraph with inline formatting
    paragraphs.push(new Paragraph({ children: parseInlineMarkdown(line) }));
    indentBoostFromNumbered = false;
  }

  return paragraphs;
}

// Parse inline markdown markers for bold, italics, and code
function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let currentPos = 0;
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentPos) {
      const plainText = text.substring(currentPos, match.index);
      if (plainText) runs.push(new TextRun({ text: plainText }));
    }

    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: "Courier New" }));
    }

    currentPos = regex.lastIndex;
  }

  if (currentPos < text.length) {
    const plainText = text.substring(currentPos);
    if (plainText) runs.push(new TextRun({ text: plainText }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }

  return runs;
}

export async function action({ params }: ActionFunctionArgs) {
  const id = Number.parseInt(params.id || "");

  if (Number.isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  const rapat = await getRapatById(id);

  if (!rapat) {
    throw new Response("Rapat not found", { status: 404 });
  }

  // Extract summary from ringkasan if it exists
  let summary = "";
  if (rapat.ringkasan) {
    try {
      const parsed = typeof rapat.ringkasan === "string" ? JSON.parse(rapat.ringkasan) : rapat.ringkasan;

      if (parsed && typeof parsed === "object" && "summary" in parsed) {
        summary = parsed.summary;
      } else {
        summary = typeof rapat.ringkasan === "string" ? rapat.ringkasan : JSON.stringify(rapat.ringkasan);
      }
    } catch (error) {
      console.error("Failed to parse ringkasan:", error);
      summary = typeof rapat.ringkasan === "string" ? rapat.ringkasan : JSON.stringify(rapat.ringkasan);
    }
    // Normalize double-encoded newlines
    if (typeof summary === "string") {
      summary = summary.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
    }
  }

  // Format date
  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return "-";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Load images and get dimensions - keep as Buffer for docx library
  const publicDir = path.join(process.cwd(), "public");
  let danantaraImage: Buffer | null = null;
  let palImage: Buffer | null = null;
  let danantaraDimensions = { width: 100, height: 50 };
  let palDimensions = { width: 100, height: 50 };

  try {
    const imagePath = path.join(publicDir, "danantara.png");
    danantaraImage = await fs.readFile(imagePath);
    const dimensions = sizeOf(danantaraImage);
    if (dimensions.width && dimensions.height) {
      // Scale to max width of 120 while maintaining aspect ratio
      const maxWidth = 120;
      const scale = maxWidth / dimensions.width;
      danantaraDimensions = {
        width: maxWidth,
        height: Math.round(dimensions.height * scale),
      };
    }
  } catch (error) {
    console.error("Failed to load danantara.png:", error);
  }

  try {
    const imagePath = path.join(publicDir, "pal.png");
    palImage = await fs.readFile(imagePath);
    const dimensions = sizeOf(palImage);
    if (dimensions.width && dimensions.height) {
      // Scale to max width of 120 while maintaining aspect ratio
      const maxWidth = 120;
      const scale = maxWidth / dimensions.width;
      palDimensions = {
        width: maxWidth,
        height: Math.round(dimensions.height * scale),
      };
    }
  } catch (error) {
    console.error("Failed to load pal.png:", error);
  }

  // Create the document
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2.", alignment: AlignmentType.LEFT },
            { level: 2, format: LevelFormat.LOWER_ROMAN, text: "%3.", alignment: AlignmentType.LEFT },
            { level: 3, format: LevelFormat.DECIMAL, text: "%4.", alignment: AlignmentType.LEFT },
            { level: 4, format: LevelFormat.LOWER_LETTER, text: "%5.", alignment: AlignmentType.LEFT },
          ],
        },
        {
          reference: "default-bullet",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT },
            { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT },
            { level: 2, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT },
            { level: 3, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT },
            { level: 4, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          // Header with logos and title
          new DocxTable({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: [
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [
                      danantaraImage
                        ? new Paragraph({
                            children: [
                              new ImageRun({
                                data: danantaraImage,
                                type: "png",
                                transformation: {
                                  width: danantaraDimensions.width,
                                  height: danantaraDimensions.height,
                                },
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                          })
                        : new Paragraph({ text: "DANANTARA", alignment: AlignmentType.CENTER }),
                    ],
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [
                      new Paragraph({
                        text: "RISALAH RAPAT",
                        alignment: AlignmentType.CENTER,
                        heading: HeadingLevel.HEADING_1,
                      }),
                    ],
                    width: { size: 34, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [
                      palImage
                        ? new Paragraph({
                            children: [
                              new ImageRun({
                                data: palImage,
                                type: "png",
                                transformation: {
                                  width: palDimensions.width,
                                  height: palDimensions.height,
                                },
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                          })
                        : new Paragraph({ text: "PT PAL", alignment: AlignmentType.CENTER }),
                    ],
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }), // Spacing
          // Agenda and details
          new DocxTable({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: [
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Agenda:", bold: true })],
                      }),
                      new Paragraph({ text: rapat.judul || "-" }),
                    ],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Nomor: ", bold: true }),
                          new TextRun({ text: rapat.id.toString() }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Hari, Tanggal: ", bold: true }),
                          new TextRun({ text: formatDate(rapat.tanggal) }),
                        ],
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: "Pukul: ", bold: true }), new TextRun({ text: "-" })],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: "Tempat: ", bold: true }),
                          new TextRun({ text: rapat.tempat_rapat || "-" }),
                        ],
                      }),
                    ],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Kepada Yth.", bold: true })] })],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Peserta Rapat", bold: true })] })],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }), // Spacing
          // Summary section
          new Paragraph({
            children: [new TextRun({ text: "Ringkasan", bold: true })],
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: "" }), // Spacing
          // Add summary content - split by newlines
          ...(summary
            ? parseMarkdownToDocx(summary)
            : [new Paragraph({ children: [new TextRun({ text: "Ringkasan belum tersedia", italics: true })] })]),
          new Paragraph({ text: "" }), // Spacing
          new Paragraph({ text: "" }), // Spacing
          // Signature table
          new DocxTable({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: [
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [new Paragraph({ text: "Dibuat Oleh:" })],
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ text: "Diperiksa Oleh:" })],
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ text: "Disetujui Oleh:" })],
                    width: { size: 34, type: WidthType.PERCENTAGE },
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [new Paragraph({ text: "PT PAL Indonesia" })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ text: "PT PAL Indonesia" })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ text: "PT PAL Indonesia" })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Jabatan", italics: true })] })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Jabatan", italics: true })] })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Jabatan", italics: true })] })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [new Paragraph({ text: "" })],
                    margins: {
                      top: convertInchesToTwip(0.7),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }), // Space for signature
                  new DocxTableCell({
                    children: [new Paragraph({ text: "" })],
                    margins: {
                      top: convertInchesToTwip(0.7),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ text: "" })],
                    margins: {
                      top: convertInchesToTwip(0.7),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
              new DocxTableRow({
                children: [
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Nama", italics: true })] })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Nama", italics: true })] })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                  new DocxTableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Nama", italics: true })] })],
                    margins: {
                      top: convertInchesToTwip(0.1),
                      bottom: convertInchesToTwip(0.1),
                      left: convertInchesToTwip(0.1),
                      right: convertInchesToTwip(0.1),
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  // Generate the document buffer
  const buffer = await Packer.toBuffer(doc);

  // Generate filename
  const filename = `Risalah_Rapat_${rapat.judul?.replaceAll(/[^a-zA-Z0-9]/g, "_") || rapat.id}_${new Date().toISOString().split("T")[0]}.docx`;

  // Return the file as a response
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
