import { useRef, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Image, Modal, Pressable, ScrollView, View } from "react-native";
import { Icon } from "./icon";
import { Sub, T } from "./ui";
import { radius } from "@/theme/tokens";

export interface ViewerImage {
  url: string;
  kind?: string;
}

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
 *
 * 한 공고에 위치도·조감도·배치도가 같이 오므로 좌우로 넘겨 본다. 한 장 보고 닫았다
 * 다시 여는 건 같은 것을 비교하는 동작이 아니다.
 *
 * 확대는 ScrollView의 zoom을 쓴다 — iOS에서만 동작한다. 제스처 라이브러리를 새로 넣는 것보다
 * 지금은 이쪽이 싸고, 안드로이드에서는 확대 없이 꽉 찬 그림만 보인다.
 */
export function ImageViewer({
  images,
  index,
  onClose,
}: {
  images: ViewerImage[];
  /** null이면 닫힌 상태 */
  index: number | null;
  onClose: () => void;
}) {
  const { width, height } = Dimensions.get("window");
  const [at, setAt] = useState(index ?? 0);
  const listRef = useRef<FlatList<ViewerImage>>(null);
  const open = index !== null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      onShow={() => setAt(index ?? 0)}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)" }}>
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          initialScrollIndex={index ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(img) => img.url}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <Page image={item} width={width} height={height} onClose={onClose} />}
        />

        <View style={{ position: "absolute", top: 56, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          {images[at]?.kind ? (
            <View style={{ backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
              <T variant="label" color="#FFFFFF">{images[at]!.kind}</T>
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

        {/* 몇 장 중 몇 번째인지. 점을 쓰면 다섯 장을 넘어갈 때 셀 수 없다 */}
        {images.length > 1 ? (
          <View style={{ position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center" }}>
            <View style={{ backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
              <T variant="label" color="#FFFFFF">{at + 1} / {images.length}</T>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** 한 장. 확대·이동은 이 안에서만 일어나고, 축소 상태에서는 좌우 넘김이 먹는다. */
function Page({ image, width, height, onClose }: { image: ViewerImage; width: number; height: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  return (
    <ScrollView
      style={{ width }}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    >
      <Pressable onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} accessibilityLabel="닫기" />
      <Image
        source={{ uri: image.url }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        resizeMode="contain"
        style={{ width, height: height * 0.8 }}
      />
      {loading && !failed ? <ActivityIndicator color="#FFFFFF" style={{ position: "absolute" }} /> : null}
      {failed ? (
        <View style={{ position: "absolute", paddingHorizontal: 32, gap: 6 }}>
          <T variant="bodyMedium" color="#FFFFFF" style={{ textAlign: "center" }}>그림을 불러오지 못했어요</T>
          <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>기관 서버에서 내려 간 그림일 수 있어요. 공고문 원문에서 확인해 주세요.</Sub>
        </View>
      ) : null}
    </ScrollView>
  );
}
