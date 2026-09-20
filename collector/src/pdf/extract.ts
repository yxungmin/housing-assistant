import { extractText, getDocumentProxy } from "unpdf";

export interface PdfPage {
  page: number;
  text: string;
}

export interface PdfTextResult {
  pages: PdfPage[];
  /** 텍스트 레이어가 거의 없는 페이지 수 (스캔 PDF 의심) */
  emptyPages: number;
  /** 스캔 PDF로 판단되면 true → OCR 폴백 또는 CONFLICT */
  needsOcr: boolean;
}

const MIN_CHARS_PER_PAGE = 40;

/** PDF 바이트 → 페이지별 텍스트. 표는 pdf.js 텍스트 순서 그대로 나오므로 섹션 분리기가 처리한다. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  // pdf.js는 넘겨준 버퍼를 워커로 이전(detach)해 비워 버린다. 호출자가 bytes를 계속 쓸 수 있게 복사본을 넘긴다.
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: false });
  const pages: PdfPage[] = (text as string[]).map((t, i) => ({ page: i + 1, text: t.replace(/\s+\n/g, "\n").trim() }));
  const emptyPages = pages.filter((p) => p.text.length < MIN_CHARS_PER_PAGE).length;
  return { pages, emptyPages, needsOcr: pages.length > 0 && emptyPages / pages.length > 0.5 };
}

/**
 * OCR 폴백 자리. V0.1 M1에서 스캔 PDF 비율을 확인한 뒤 tesseract(Python 워커) 연결 여부를 정한다.
 * 연결 전까지는 needsOcr인 공고를 CONFLICT로 격리한다.
 */
export async function ocrFallback(_bytes: Uint8Array): Promise<PdfTextResult | null> {
  return null;
}
