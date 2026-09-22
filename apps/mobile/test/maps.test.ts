import { describe, expect, it } from "vitest";
import { mapTargets, type MapTarget } from "../src/lib/maps";

const place = { lat: 37.5586, lng: 126.9095, name: "서울 마포구 망원동 １" };
const APP = "com.yxungmin.housingassistant";
const byId = (id: MapTarget["id"]) => mapTargets(place, APP).find((t) => t.id === id)!;

describe("mapTargets", () => {
  it("카카오맵·네이버 지도·기본 지도 셋을 준다", () => {
    expect(mapTargets(place, APP).map((t) => t.id)).toEqual(["kakao", "naver", "system"]);
  });

  it("좌표를 그대로 넘긴다 — 이름만 넘기면 다른 곳이 잡힌다", () => {
    for (const t of mapTargets(place, APP)) {
      expect(`${t.appUrl ?? ""}${t.webUrl}`).toContain("37.5586");
      expect(`${t.appUrl ?? ""}${t.webUrl}`).toContain("126.9095");
    }
  });

  it("이름은 URL 인코딩한다 — 공백·한글이 그대로 들어가면 주소가 깨진다", () => {
    const naver = byId("naver");
    expect(naver.appUrl).not.toMatch(/[ 가-힣]/);
    expect(byId("kakao").webUrl).not.toMatch(/[ 가-힣]/);
  });

  it("네이버는 appname을 반드시 넣는다 — 없으면 앱이 열리고도 아무 일이 없다", () => {
    expect(byId("naver").appUrl).toContain(`appname=${APP}`);
  });

  it("기본 지도는 앱 스킴이 없다 — 시스템이 알아서 고른다", () => {
    expect(byId("system").appUrl).toBeUndefined();
  });

  it("앱이 없을 때 쓸 웹 주소가 모두 있다", () => {
    for (const t of mapTargets(place, APP)) expect(t.webUrl).toMatch(/^https:\/\//);
  });
});
