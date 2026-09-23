/**
 * 인스타 프로필 사진. 인스타는 프로필을 **원으로** 자른다.
 * 앱 아이콘(icon.png)은 마크가 가장자리에 가까워 원으로 자르면 모서리가 닿는다 —
 * 그래서 같은 마크를 원 안쪽 여유 있게(지름의 약 56%) 놓은 프로필 전용 이미지를 따로 뽑는다.
 *
 * 원본은 1024px을 쓴다 — 512px logo.png를 600px로 늘렸더니 가장자리가 거칠었다.
 * 밝은 판은 흰 배경이 박힌 앱 아이콘(icon.png), 어두운 판은 투명 원본(mark.png = iOS 다크 아이콘).
 * 투명 원본을 흰 바탕에 올리면 가장자리 반투명 픽셀이 계단처럼 드러난다.
 * 두 원본 모두 캔버스의 약 67%를 마크가 차지하므로 896px로 그리면 마크가 약 600px이 된다.
 */
import { AbsoluteFill, Img, staticFile } from "remotion";
import { colors } from "./brand";

export function Profile({ dark }: { dark?: boolean }) {
  return (
    <AbsoluteFill style={{ background: dark ? "#17171C" : colors.surface, alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile(dark ? "mark.png" : "icon.png")} style={{ width: 896, height: 896 }} />
    </AbsoluteFill>
  );
}
