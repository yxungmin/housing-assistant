import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { Icon } from "./icon";
import { ImageViewer } from "./ImageViewer";
import { Card, SectionTitle, Sub, T } from "./ui";
import type { NoticeImage } from "@/data/announcements";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

/**
 * 기관이 공고에 올린 이미지 (위치도·단지조감도).
 *
 * 우리가 만든 그림이 아니라 기관이 이미지 파일로 올려 둔 것이다. 그 차이를 화면에서 말한다 —
 * 조건·금액은 우리가 공고문에서 읽어 옮긴 것이고, 이 그림은 기관이 준 것 그대로다.
 * 섞어 놓으면 "이 앱이 그린 조감도"로 읽히고, 그러면 틀렸을 때 책임 소재가 흐려진다.
 *
 * 평면도는 여기 없다. 기관이 이미지로 주는 건 위치도·조감도까지고 평면도는 공고문 PDF 안에 있다.
 * 없는 걸 있는 척하지 않고, 대신 공고문을 여는 길을 그 아래 SourceCard가 맡는다.
 *
 * 누르면 브라우저가 아니라 앱 안의 뷰어로 크게 띄운다 (`ImageViewer`). 기관 서버가 이미지를
 * 내려받기용 헤더로 주기 때문에 브라우저로 넘기면 그림 대신 "열 수 없습니다"가 떴다.
 *
 * 주소는 기관 서버를 그대로 가리킨다. 우리 저장소로 옮기는 건 Supabase를 붙일 때 한다.
 * 그래서 끊기는 경우가 있고, 못 불러온 그림은 자리를 비워 두는 대신 목록에서 뺀다 —
 * 깨진 이미지 아이콘은 "이 앱이 고장났다"로 읽힌다.
 */
export function NoticeImages({ images }: { images?: NoticeImage[] }) {
  const { colors } = useTheme();
  const [broken, setBroken] = useState<string[]>([]);
  const [open, setOpen] = useState<NoticeImage | null>(null);
  const shown = (images ?? []).filter((i) => !broken.includes(i.url));
  const kinds = [...new Set(shown.map((i) => i.kind).filter(Boolean))].join(" · ");
  if (shown.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {/* 제목을 실제 들어 있는 것으로 짓는다 ("위치도·조감도"). 고정 문구를 쓰면
          들어 있는 게 하나뿐일 때도 여러 종류인 척하게 된다 */}
      <SectionTitle>{kinds || "단지 이미지"}</SectionTitle>
      <Card style={{ gap: 12, paddingHorizontal: 0 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.md, paddingHorizontal: space.lg }}
        >
          {shown.map((img) => (
            <Pressable
              key={img.url}
              onPress={() => setOpen(img)}
              accessibilityRole="button"
              accessibilityLabel={`${img.kind} 크게 보기`}
              style={{ width: 240, gap: 8 }}
            >
              <Image
                source={{ uri: img.url }}
                onError={() => setBroken((b) => (b.includes(img.url) ? b : [...b, img.url]))}
                resizeMode="cover"
                style={{ width: 240, height: 160, borderRadius: radius.md, backgroundColor: colors.surface }}
              />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <T variant="bodyMedium" style={{ fontSize: 14 }}>{img.kind || "이미지"}</T>
                <Icon name="right" size={14} color={colors.text4} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <Sub tone="3" variant="caption" style={{ paddingHorizontal: space.lg }}>
          기관이 공고에 올린 이미지예요. 눌러서 크게 볼 수 있어요.
        </Sub>
      </Card>
      <ImageViewer url={open?.url ?? null} label={open?.kind} onClose={() => setOpen(null)} />
    </View>
  );
}
