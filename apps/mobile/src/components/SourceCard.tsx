import { useState } from "react";
import { View } from "react-native";
import { Icon } from "./icon";
import { Card, IconTile, Sub, T } from "./ui";
import { hasSource, openSource } from "@/lib/source";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * "확실한 건 공고문이다"를 한 자리에서 말한다.
 *
 * 우리가 보여 주는 숫자는 전부 공고문에서 옮긴 것이고, 자동으로 옮긴 것은 틀릴 수 있다.
 * 그 사실을 화면 곳곳에 흐리게 흩어 두면 아무도 안 읽는다 — 숫자를 다 본 직후 한 번,
 * 원문으로 가는 길과 함께 말한다.
 *
 * 주소가 없을 때 버튼을 흉내 내지 않는다. 눌리지 않는 버튼은 "확인할 수 있다"는 거짓말이 된다.
 *
 * 길이 둘이다. 공고문 PDF가 첫째고, 그게 없어도 기관의 공고 상세 페이지는 거의 언제나 있다.
 * 둘 다 없을 때만 "기관 사이트에서 확인해 주세요"로 끝낸다.
 */
export function SourceCard({ pdfUrl, detailUrl, what }: { pdfUrl?: string; detailUrl?: string; what: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const canOpen = hasSource(pdfUrl);
  const canOpenDetail = hasSource(detailUrl);

  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <IconTile name="info" tone={canOpen ? "primary" : "gray"} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyMedium">{canOpen ? "공고문 원문 보기" : canOpenDetail ? "기관 공고 페이지 열기" : "확실한 건 공고문이에요"}</T>
        <Sub tone="3" variant="caption">
          {failed
            ? "공고문을 열지 못했어요. 기관 사이트에서 직접 확인해 주세요."
            : canOpen
              ? `${what} 공고문에서 옮긴 것이에요. 신청 전에 원본을 꼭 확인하세요.`
              : canOpenDetail
                ? `${what} 공고문에서 옮긴 것이에요. 공고문 파일이 없어 기관 공고 페이지로 열어 드려요.`
                : `${what} 공고문에서 옮긴 것이에요. 원문 주소가 아직 없어 기관 사이트에서 확인해 주세요.`}
        </Sub>
      </View>
      {canOpen || canOpenDetail ? <Icon name="right" size={18} color={colors.text4} /> : null}
    </View>
  );

  const url = canOpen ? pdfUrl : canOpenDetail ? detailUrl : undefined;
  return url ? (
    <Card onPress={() => void openSource(url).then((ok) => setFailed(!ok))}>{body}</Card>
  ) : (
    <Card>{body}</Card>
  );
}
