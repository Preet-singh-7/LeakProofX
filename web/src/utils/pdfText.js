import * as pdfjsLib from 'pdfjs-dist';

// Runs entirely in the browser — same reasoning as papers' PDF upload
// (see server-side assertValidPdf): the server never sees or parses PDF
// bytes for question-bank purposes either. This only produces plain text
// for a human to review and split into questions; what actually reaches
// the backend afterward is structured JSON through the existing
// POST /questions validation, same as if it were typed by hand.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n\n');
}

// Splits on a line that starts with a number followed by '.' or ')' — e.g.
// "1. What is..." or "2) Explain..." — a common exam numbering pattern.
// A starting point for the admin to edit, not a full automated parse:
// every draft is reviewed and adjustable before anything is submitted.
export function splitIntoQuestions(text) {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const questions = [];
  let current = '';
  for (const line of lines) {
    if (/^\d+[.)]\s+/.test(line)) {
      if (current) questions.push(current.trim());
      current = line.replace(/^\d+[.)]\s+/, '');
    } else {
      current += (current ? ' ' : '') + line;
    }
  }
  if (current) questions.push(current.trim());
  return questions;
}
