import { useState } from "react";
import { ActivityIndicator, Dimensions, Image, Modal, Pressable, ScrollView, View } from "react-native";
import { Icon } from "./icon";
import { Sub, T } from "./ui";
import { radius } from "@/theme/tokens";

/**
 * 공고 이미지를 앱 안에서 크게 본다.
 *
 * 전에는 브라우저로 넘겼는데 기관 서버가 이미지를 내려받기용으로 준다 (2026-09-22 확인):
 *   Content-Type: application/octet-stream
 *   Content-Disposition: attachment; filename="단지배치도.jpg"
 * 그래서 브라우저는 그림 대신 "이 파일을 열 수 없습니다" 안내를 띄웠다.
 *
 * 목록 썸네일은 멀쩡히 뜬다 — React Native의 이미지 로더는 이 헤더를 보지 않는다.
 * 그러니 브라우저를 부르지 않고 같은 방식으로 크게 그리면 서버 헤더와 무관하게 해결된다.
 * 앱을 벗어나지도 않고, 배치도처럼 글씨가 작은 그림은 확대해서 봐야 하므로 확대도 붙인다.
 *
 * 확대는 ScrollView의 zoom을 쓴다 — iOS에서만 동작한다. 제스처 라이브러리를 새로 넣는 것보다
 * 지금은 이쪽이 싸고, 안드로이드에서는 확대 없이 꽉 찬 그림만 보인다.
 */
export function ImageViewer({ url, label, onClose }: { url: string | null; label?: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { width, height } = Dimensions.get("window");

  return (
    <Modal visible={url !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)" }}>
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {/* 그림 바깥을 누르면 닫힌다. 그림 위에서는 확대·이동이 먼저다. */}
          <Pressable onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} accessibilityLabel="닫기" />
          {url ? (
            <Image
              source={{ uri: url }}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
              resizeMode="contain"
              style={{ width: width, height: height * 0.8 }}
            />
          ) : null}
          {loading && !failed ? <ActivityIndicator color="#FFFFFF" style={{ position: "absolute" }} /> : null}
          {failed ? (
            <View style={{ position: "absolute", paddingHorizontal: 32, gap: 6 }}>
              <T variant="bodyMedium" color="#FFFFFF" style={{ textAlign: "center" }}>그림을 불러오지 못했어요</T>
              <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>기관 서버에서 내려 간 그림일 수 있어요. 공고문 원문에서 확인해 주세요.</Sub>
            </View>
          ) : null}
        </ScrollView>

        <View style={{ position: "absolute", top: 56, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          {label ? (
            <View style={{ backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
              <T variant="label" color="#FFFFFF">{label}</T>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            hitSlop={12}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              alignItems: "center", justifyContent: "center",
              backgroundColor: pressed ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)",
            })}
          >
            <Icon name="x" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
