/**
 * 원문 공고문 열기.
 *
 * 근거로 "p.15"라고 적어 놓고 15쪽을 열 수 없으면 근거 표시가 장식이 된다.
 * PDF 주소에 #page=N을 붙이면 크롬·안드로이드 뷰어는 그 쪽으로 가지만 iOS 기본 뷰어는 무시하고 첫 쪽을 연다.
 * 주소가 무엇이냐에 따라서도 갈린다 (2026-09-21 확인):
 *  - 수집기가 올린 Supabase Storage 주소는 application/pdf라 브라우저에서 열리고 #page가 먹는다. 실제 운영 경로.
 *  - 기관 사이트 주소는 그렇지 않을 수 있다. SH 첨부는 octet-stream + Content-Disposition: attachment라 내려받아진다.
 * 그래서 화면에서도 "열린다"까지만 약속하고 그 아래 한 줄로 알린다.
 *
 * 앱 안에서 연다 (`expo-web-browser`). 기본 브라우저로 넘기면 앱을 벗어나고, 돌아오려면
 * 앱 전환을 해야 해서 근거를 확인하다 흐름이 끊긴다. 인앱 브라우저는 SFSafariViewController(iOS)·
 * Custom Tabs(Android)라 PDF를 그 자리에서 띄우고 "완료"로 바로 돌아온다.
 *
 * 다만 **내려받기를 없애 주지는 못한다.** 서버가 Content-Disposition: attachment로 주면
 * (SH 첨부가 그렇다) 뷰어가 아니라 파일로 받는다. 그건 서버가 정하는 것이라 앱에서 못 바꾼다 —
 * 수집기가 PDF를 우리 Storage(application/pdf)에 올리면 그 주소부터는 바로 열린다.
 */
import { Linking, Platform } from "react-native";

const native = Platform.OS === "ios" || Platform.OS === "android";
// expo 모듈은 네이티브 전역이 있어야 로드된다. 정적 import를 두면 테스트(vitest)와
// 웹 번들이 이 파일만 import해도 터진다 — notifications.ts와 같은 방식으로 미룬다.
const webBrowser = () => import("expo-web-browser");

export const hasSource = (pdfUrl?: string): boolean => !!pdfUrl && /^https?:\/\//.test(pdfUrl);

export function sourceUrl(pdfUrl: string, page?: number): string {
  return page && page > 0 ? `${pdfUrl}#page=${page}` : pdfUrl;
}

/** 실패하면 false. 호출한 화면이 안내 문구를 보여 준다. */
export async function openSource(pdfUrl: string, page?: number): Promise<boolean> {
  const url = sourceUrl(pdfUrl, page);
  if (native) {
    try {
      const WebBrowser = await webBrowser();
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
      return true;
    } catch {
      // 인앱 브라우저를 못 띄우면 기본 방식으로 넘긴다. 못 여는 것보다 앱을 벗어나는 편이 낫다.
    }
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
