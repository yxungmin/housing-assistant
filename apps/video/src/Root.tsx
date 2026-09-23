import { Composition, Still } from "remotion";
import { REEL } from "./brand";
import { Profile } from "./Profile";
import { Reel, reelDuration, type ReelProps } from "./Reel";
import sample from "./sample.json";

export function Root() {
  return (
    <>
      {/* 길이는 대본의 마지막 장면에서 정한다 — 장면이 4개인 대본과 5개인 대본의 길이가 다르다 */}
      <Composition
        id="Reel"
        component={Reel}
        width={REEL.width}
        height={REEL.height}
        fps={REEL.fps}
        durationInFrames={reelDuration(sample as ReelProps, REEL.fps)}
        defaultProps={sample as ReelProps}
        calculateMetadata={({ props }) => ({ durationInFrames: reelDuration(props, REEL.fps) })}
      />
      <Still id="Profile" component={Profile} width={1080} height={1080} defaultProps={{ dark: false }} />
      <Still id="ProfileDark" component={Profile} width={1080} height={1080} defaultProps={{ dark: true }} />
    </>
  );
}
