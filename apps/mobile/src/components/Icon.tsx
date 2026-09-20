import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "check" | "alert" | "x" | "left" | "right" | "heart" | "heart-filled" | "more" | "bell"
  | "home" | "bookmark" | "user" | "house" | "delete" | "map-pin" | "info";

interface Props {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** 선 아이콘 (시안과 같은 경로). 색은 항상 토큰에서 받는다. */
export function Icon({ name, size = 20, color, strokeWidth = 2 }: Props) {
  const common = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "check" && <Path d="M20 6 9 17l-5-5" {...common} />}
      {name === "alert" && (
        <>
          <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...common} />
          <Path d="M12 9v4M12 17h.01" {...common} />
        </>
      )}
      {name === "x" && <Path d="M18 6 6 18M6 6l12 12" {...common} />}
      {name === "left" && <Path d="m15 18-6-6 6-6" {...common} />}
      {name === "right" && <Path d="m9 18 6-6-6-6" {...common} />}
      {(name === "heart" || name === "heart-filled") && (
        <Path
          d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
          {...common}
          fill={name === "heart-filled" ? color : "none"}
        />
      )}
      {name === "more" && (
        <>
          <Circle cx="12" cy="12" r="1" {...common} />
          <Circle cx="19" cy="12" r="1" {...common} />
          <Circle cx="5" cy="12" r="1" {...common} />
        </>
      )}
      {name === "bell" && (
        <>
          <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" {...common} />
          <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" {...common} />
        </>
      )}
      {name === "home" && (
        <>
          <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...common} />
          <Path d="M9 22V12h6v10" {...common} />
        </>
      )}
      {name === "bookmark" && <Path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" {...common} />}
      {name === "user" && (
        <>
          <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" {...common} />
          <Circle cx="12" cy="7" r="4" {...common} />
        </>
      )}
      {name === "house" && (
        <>
          <Path d="M3 10.5 12 3l9 7.5" {...common} />
          <Path d="M5 9.5V21h14V9.5" {...common} />
          <Path d="M10 21v-6h4v6" {...common} />
        </>
      )}
      {name === "delete" && (
        <>
          <Path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" {...common} />
          <Path d="m18 9-6 6M12 9l6 6" {...common} />
        </>
      )}
      {name === "map-pin" && (
        <>
          <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" {...common} />
          <Circle cx="12" cy="10" r="3" {...common} />
        </>
      )}
      {name === "info" && (
        <>
          <Circle cx="12" cy="12" r="10" {...common} />
          <Path d="M12 16v-4M12 8h.01" {...common} />
        </>
      )}
      {false && <Rect />}
    </Svg>
  );
}
