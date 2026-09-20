import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 저장소 루트. npm workspaces는 스크립트를 collector/ 에서 실행하므로 상대 경로를 루트 기준으로 통일한다. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 사용자가 명령을 친 디렉터리 (npm이 INIT_CWD로 넘겨준다). 없으면 현재 디렉터리. */
export const USER_CWD = process.env.INIT_CWD ?? process.cwd();

export const fromRoot = (...p: string[]) => resolve(REPO_ROOT, ...p);
export const fromUser = (p: string) => (isAbsolute(p) ? p : resolve(USER_CWD, p));
