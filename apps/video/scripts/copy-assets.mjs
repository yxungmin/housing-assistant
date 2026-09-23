/**
 * 영상에 쓰는 로고·폰트를 앱에서 복사해 온다. 원본은 한 곳(앱)에만 둔다 —
 * 영상 쪽에 따로 두면 로고를 바꿨을 때 영상만 옛 로고로 남는다. public/은 커밋하지 않는다.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
const require = createRequire(import.meta.url);
mkdirSync(join(pub, "fonts"), { recursive: true });
copyFileSync(join(here, "..", "..", "mobile", "assets", "logo.png"), join(pub, "logo.png"));
// 1024px 투명 배경 마크 (iOS 다크 아이콘). 프로필처럼 크게 쓸 때는 512px logo.png를 늘리지 않고 이걸 쓴다
copyFileSync(join(here, "..", "..", "mobile", "assets", "icon-dark.png"), join(pub, "mark.png"));
// 흰 배경이 박힌 1024px 앱 아이콘. 투명 원본은 가장자리 반투명 픽셀이 흰 바탕에서 계단처럼 드러나 밝은 판에는 이걸 쓴다
copyFileSync(join(here, "..", "..", "mobile", "assets", "icon.png"), join(pub, "icon.png"));
const pretendard = dirname(require.resolve("pretendard/package.json"));
for (const w of ["Medium", "SemiBold", "Bold", "ExtraBold"]) {
  copyFileSync(join(pretendard, "dist", "public", "static", `Pretendard-${w}.otf`), join(pub, "fonts", `Pretendard-${w}.otf`));
}
console.log("assets → public/");
