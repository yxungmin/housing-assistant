import Svg, { Path, Rect } from "react-native-svg";

/**
 * 구독 시트 머리의 그림. 월 1,900원이 커피 한 잔보다 싸다는 걸 말로 하기 전에 보여 준다.
 *
 * 아이콘이 아니라 삽화라 `components/icon`에 넣지 않았다 — 24px 격자에서 읽히게 만든 것과
 * 96px에서 한 번 보게 만든 것은 다른 물건이다. 색은 ASSET 아이콘과 같은 팔레트를 쓴다.
 */
export function CoffeeMark({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* 김 */}
      <Path d="M39 21c-3.4-3.4 3.4-5.6 0-9" stroke="#83E7B4" strokeWidth={3.4} strokeLinecap="round" />
      <Path d="M48 18c-3.4-3.4 3.4-5.6 0-9" stroke="#2ED27C" strokeWidth={3.4} strokeLinecap="round" />
      <Path d="M57 21c-3.4-3.4 3.4-5.6 0-9" stroke="#83E7B4" strokeWidth={3.4} strokeLinecap="round" />

      {/* 뚜껑 */}
      <Rect x={25} y={30} width={46} height={5} rx={2.5} fill="#2ED27C" />
      <Rect x={21} y={35} width={54} height={11} rx={5.5} fill="#17B66B" />

      {/* 컵 */}
      <Path d="M25 48h46l-5.2 34.4A6 6 0 0 1 59.9 88H36.1a6 6 0 0 1-5.9-5.6L25 48Z" fill="#DDF8EA" />
      {/* 홀더 */}
      <Path d="M27.2 58h41.6l-2.3 16H29.5l-2.3-16Z" fill="#2ED27C" />
      {/* 홀더 위의 집 — 이 커피값이 무엇을 위한 것인지. 작게 넣으면 점으로 뭉개져서 홀더를 키웠다 */}
      <Path d="m40.7 67 6.6-5.4a1.1 1.1 0 0 1 1.4 0l6.6 5.4v4.8a1.2 1.2 0 0 1-1.2 1.2H41.9a1.2 1.2 0 0 1-1.2-1.2V67Z" fill="#FFFFFF" />
      <Rect x={45.9} y={68.4} width={4.2} height={4.6} rx={1.2} fill="#17B66B" />
    </Svg>
  );
}
