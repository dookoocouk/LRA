import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { AuditResult } from "./schema";

const GOLD = rgb(0.72, 0.63, 0.36);
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);

export async function generatePdf(
  decision: string,
  result: AuditResult
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { height } = page.getSize();
  let y = height - 50;
  const left = 50;
  const maxWidth = 495;

  const drawText = (
    text: string,
    opts: {
      size?: number;
      font?: typeof helvetica;
      color?: typeof BLACK;
      indent?: number;
    } = {}
  ) => {
    const {
      size = 10,
      font = helvetica,
      color = BLACK,
      indent = 0,
    } = opts;

    // Word-wrap
    const words = text.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth - indent) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      if (y < 50) {
        const newPage = pdf.addPage([595, 842]);
        y = newPage.getSize().height - 50;
        page.drawText(l, {
          x: left + indent,
          y,
          size,
          font,
          color,
        });
      } else {
        page.drawText(l, {
          x: left + indent,
          y,
          size,
          font,
          color,
        });
      }
      y -= size + 4;
    }
    y -= 4;
  };

  // Header
  drawText("London Royal Academy", {
    size: 9,
    color: GRAY,
  });
  drawText("StratOS Lite — Decision Audit", {
    size: 18,
    font: helveticaBold,
  });

  y -= 8;

  // Line
  page.drawLine({
    start: { x: left, y },
    end: { x: left + maxWidth, y },
    thickness: 1,
    color: GOLD,
  });
  y -= 20;

  // Decision
  drawText("DECISION", {
    size: 8,
    font: helveticaBold,
    color: GRAY,
  });
  drawText(decision, { size: 11 });

  y -= 8;

  // Verdict
  drawText("VERDICT", {
    size: 8,
    font: helveticaBold,
    color: GRAY,
  });
  drawText(result.verdict, {
    size: 14,
    font: helveticaBold,
    color: result.verdict === "Proceed" ? rgb(0.1, 0.6, 0.3) : result.verdict === "High Risk" ? rgb(0.8, 0.15, 0.15) : GOLD,
  });

  drawText(`Confidence: ${result.confidence_score}/100 — ${result.confidence_reason}`, {
    size: 10,
    color: GRAY,
  });

  y -= 8;

  // Fields
  const fields: [string, string][] = [
    ["Decision Type", result.decision_type],
    ["Biggest Risk", result.biggest_risk],
    ["Hidden Assumption", result.hidden_assumption],
    ["Better Question", result.better_question],
    ["30-Day Test", result.thirty_day_test],
    ["Devil's Argument", result.devils_argument],
  ];

  for (const [label, value] of fields) {
    drawText(label.toUpperCase(), {
      size: 8,
      font: helveticaBold,
      color: GRAY,
    });
    drawText(value, { size: 10 });
    y -= 4;
  }

  y -= 8;

  // Assumptions
  if (result.assumptions.length > 0) {
    drawText("ASSUMPTIONS", {
      size: 8,
      font: helveticaBold,
      color: GRAY,
    });
    for (const a of result.assumptions) {
      drawText(`• ${a}`, { size: 9, indent: 8 });
    }
    y -= 4;
  }

  // Risks
  if (result.risks_blind_spots.length > 0) {
    drawText("RISKS & BLIND SPOTS", {
      size: 8,
      font: helveticaBold,
      color: GRAY,
    });
    for (const r of result.risks_blind_spots) {
      drawText(`• ${r}`, { size: 9, indent: 8 });
    }
    y -= 4;
  }

  // Information Needed
  if (result.information_needed.length > 0) {
    drawText("INFORMATION NEEDED", {
      size: 8,
      font: helveticaBold,
      color: GRAY,
    });
    for (const i of result.information_needed) {
      drawText(`• ${i}`, { size: 9, indent: 8 });
    }
  }

  // Footer
  y = 30;
  page.drawText(
    "Supports decision thinking. Not legal or financial advice. — ai.londonra.com",
    {
      x: left,
      y,
      size: 7,
      font: helvetica,
      color: GRAY,
    }
  );

  return pdf.save();
}
