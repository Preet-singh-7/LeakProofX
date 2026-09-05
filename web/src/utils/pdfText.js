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

// The plain-number variant requires whitespace (or start-of-text)
// immediately before the digits — not just "not another digit" — so it
// doesn't false-positive on a reference code like "(25CAT-721)" or
// "(E17984)" in a document's header, where the digits are preceded by a
// letter or hyphen rather than real separation.
const QUESTION_MARKER = /\bQ\d+\b|(?<=^|\s)\d+[.)](?=\s)/g;
const DIFFICULTY_TAG = /\[(EASY|MEDIUM|HARD)\]/i;
const MARKS_TAG = /(\d+)\s*marks?\b/i;
const ANSWER_SECTION = /\bANSWER\s*(?:\/\s*KEY\s*POINTS?)?\s*:/i;

// Splits on a question-number marker — "Q12", "12.", or "12)" all count —
// found anywhere in the text, not just at the start of a line. PDF text
// extraction (extractPdfText above) often collapses real line breaks into
// plain spaces, since pdf.js just concatenates each text run rather than
// preserving layout, so a "start of line" split misses markers that don't
// happen to land after one of the arbitrary breaks that survive.
//
// For each resulting chunk, also pulls out a "[EASY|MEDIUM|HARD]" tag and
// an "N marks" tag when present, and drops anything from an
// "ANSWER" / "ANSWER / KEY POINTS:" marker onward — common in a real
// question bank export, but that's answer content, not the question.
// Still just a starting point: every draft is shown for review and edit
// before anything is submitted.
export function splitIntoQuestions(text) {
  const indices = [...text.matchAll(QUESTION_MARKER)].map((m) => m.index);
  const rawChunks = indices.length === 0 ? [text] : indices.map((start, i) => text.slice(start, indices[i + 1] ?? text.length));

  return rawChunks
    .map((chunk) => {
      let body = chunk.replace(/^\s*(Q\d+|\d+[.)])\s*/, '').trim();

      const answerIdx = body.search(ANSWER_SECTION);
      if (answerIdx !== -1) body = body.slice(0, answerIdx).trim();

      const difficultyMatch = body.match(DIFFICULTY_TAG);
      if (difficultyMatch) body = body.replace(difficultyMatch[0], '').trim();

      const marksMatch = body.match(MARKS_TAG);
      if (marksMatch) body = body.replace(marksMatch[0], '').trim();

      return {
        text: body.replace(/\s{2,}/g, ' ').trim(),
        difficulty: difficultyMatch ? difficultyMatch[1].toUpperCase() : undefined,
        marks: marksMatch ? Number(marksMatch[1]) : undefined,
      };
    })
    .filter((q) => q.text.length > 0);
}
