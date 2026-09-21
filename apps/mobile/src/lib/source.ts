/**
 * 원문 공고문 열기.
 *
 * 근거로 "p.15"라고 적어 놓고 15쪽을 열 수 없으면 근거 표시가 장식이 된다.
 * PDF 주소에 #page=N을 붙이면 크롬·안드로이드 뷰어는 그 쪽으로 가지만 iOS 기본 뷰어는 무시하고 첫 쪽을 연다.
 * 주소가 무엇이냐에 따라서도 갈린다 (2026-09-21 확인):
 *  - 수집기가 올린 Supabase Storage 주소는 application/pdf라 브라우저에서 열리고 #page가 먹는다. 실제 운영 경로.
 *  - 기관 사이트 주소는 그렇지 않을 수 있다. SH 첨부는 octet-stream + Content-Disposition: attachment라 내려받아진다.
 * 그래서 화면에서도 "열린다"까지만 약속하고 그 아래 한 줄로 알린다.
 */
import { Linking } from "react-native";

export const hasSource = (pdfUrl?: string): boolean => !!pdfUrl && /^https?:\/\//.test(pdfUrl);

export function sourceUrl(pdfUrl: string, page?: number): string {
  return page && page > 0 ? `${pdfUrl}#page=${page}` : pdfUrl;
}

/** 실패하면 false. 호출한 화면이 안내 문구를 보여 준다. */
export async function openSource(pdfUrl: string, page?: number): Promise<boolean> {
  try {
    await Linking.openURL(sourceUrl(pdfUrl, page));
    return true;
  } catch {
    return false;
  }
}
