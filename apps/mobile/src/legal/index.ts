import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";
import type { LegalDoc } from "./types";

export type { LegalDoc, LegalSection } from "./types";
export { PRIVACY, TERMS };

export const LEGAL_DOCS: Record<LegalDoc["key"], LegalDoc> = { terms: TERMS, privacy: PRIVACY };

/** 게시할 수 있는 상태인가. 빈칸이 남았거나 시행일이 없으면 초안이다 */
export const isDraft = (doc: LegalDoc): boolean => !doc.effectiveAt || doc.blanks.length > 0;

/** 목록 항목인가 */
export const isBullet = (line: string): boolean => line.startsWith("- ");
export const bulletText = (line: string): string => (isBullet(line) ? line.slice(2) : line);
