/**
 * 지도 앱으로 넘기는 주소들.
 *
 * 한국 사용자는 애플 지도·구글 지도보다 카카오맵·네이버 지도를 쓴다. 특히 공공주택은
 * 주변 시세·학군·교통을 같이 보게 되는데 그건 그쪽 앱에 있다. 여기서 할 일은
 * 정확한 좌표와 이름을 넘겨 주는 것까지다.
 *
 * 앱이 깔려 있으면 앱으로, 아니면 웹으로 연다. 그래서 각 항목이 주소를 둘 들고 있다.
 * iOS는 `canOpenURL`이 Info.plist의 `LSApplicationQueriesSchemes`에 적힌 것만 true를 주므로
 * 거기에 kakaomap·nmap을 등록해 둬야 한다 (app.json).
 *
 * 네이버는 `appname`을 요구한다 — 없으면 앱이 열리고도 아무것도 안 한다.
 */

export interface MapTarget {
  id: "kakao" | "naver" | "system";
  label: string;
  /** 앱이 깔려 있을 때 쓸 주소. system은 없다 */
  appUrl?: string;
  /** 앱이 없을 때 쓸 주소 */
  webUrl: string;
}

export interface MapPlace {
  lat: number;
  lng: number;
  /** 지도에 찍힐 이름. 주소가 있으면 주소가 낫다 — 이름만으로는 다른 곳이 잡힌다 */
  name: string;
}

/** iOS에서 앱 설치 여부를 물으려면 Info.plist에 등록돼야 하는 스킴 */
export const MAP_SCHEMES = ["kakaomap", "nmap"] as const;

export function mapTargets(place: MapPlace, appId: string): MapTarget[] {
  const { lat, lng } = place;
  const name = encodeURIComponent(place.name);
  return [
    {
      id: "kakao",
      label: "카카오맵에서 열기",
      appUrl: `kakaomap://look?p=${lat},${lng}`,
      webUrl: `https://map.kakao.com/link/map/${name},${lat},${lng}`,
    },
    {
      id: "naver",
      label: "네이버 지도에서 열기",
      // appname이 없으면 앱이 열리기만 하고 아무 일도 일어나지 않는다
      appUrl: `nmap://place?lat=${lat}&lng=${lng}&name=${name}&appname=${appId}`,
      webUrl: `https://map.naver.com/p/search/${name}?c=${lng},${lat},16,0,0,0,dh`,
    },
    {
      id: "system",
      label: "기본 지도 앱에서 열기",
      webUrl: `https://maps.apple.com/?ll=${lat},${lng}&q=${name}`,
    },
  ];
}
