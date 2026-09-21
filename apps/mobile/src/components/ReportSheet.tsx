import { useEffect, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { BottomSheet, Notice, PrimaryButton, SlideUp, Sub, T } from "./ui";
import { REPORT_STATUS_LABEL, type LocalReport } from "@/lib/reports";
import { hasSource, openSource } from "@/lib/source";
import { longDate } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius } from "@/theme/tokens";

/**
 * 항목 하나의 근거를 펼쳐 보고, 이상하면 신고한다.
 * 신고는 숫자 옆이 아니라 이 자리에 둔다 — 원문 발췌를 본 다음에 판단하게 하려고.
 * 이미 신고한 항목이면 폼 대신 처리 상태를 보여 준다.
 */
export function ReportSheet({
  visible,
  onClose,
  title,
  page,
  sourceText,
  pdfUrl,
  existing,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  page?: number;
  sourceText?: string;
  /** 있으면 원문 공고문을 그 쪽으로 열 수 있다 */
  pdfUrl?: string;
  existing?: LocalReport;
  onSubmit: (message: string, suggested?: string) => void;
}) {
  const { colors } = useTheme();
  const [message, setMessage] = useState("");
  const [suggested, setSuggested] = useState("");
  const [form, setForm] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const canOpen = hasSource(pdfUrl);

  useEffect(() => {
    if (!visible) return;
    setMessage("");
    setSuggested("");
    setForm(false);
    setOpenFailed(false);
  }, [visible]);

  const ok = message.trim().length >= 2;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: 8 }}>
        <T variant="title" style={{ fontSize: 22, lineHeight: 30 }}>{title}</T>
        {page ? <Sub tone="3" variant="caption">공고문 {page}쪽에서 가져온 내용이에요</Sub> : null}
      </View>

      {sourceText ? (
        <View style={{ backgroundColor: colors.cardSoft, borderRadius: radius.md, padding: 14 }}>
          <Sub tone="2" variant="caption">{sourceText}</Sub>
        </View>
      ) : null}

      {canOpen ? (
        <View style={{ gap: 6 }}>
          <PrimaryButton
            tone="soft"
            label={page ? `공고문 원문 ${page}쪽 열기` : "공고문 원문 열기"}
            onPress={() => void openSource(pdfUrl!, page).then((ok) => setOpenFailed(!ok))}
          />
          {openFailed ? (
            <Sub tone="3" variant="caption">공고문을 열지 못했어요. 기관 사이트에서 직접 확인해 주세요.</Sub>
          ) : page ? (
            <Sub tone="3" variant="caption">뷰어에 따라 첫 쪽부터 열리거나 내려받아질 수 있어요.</Sub>
          ) : null}
        </View>
      ) : null}

      {existing ? (
        <View style={{ gap: 10 }}>
          <Notice tone={existing.status === "OPEN" ? "info" : "primary"} icon={existing.status === "OPEN" ? "info" : "check"}>
            {REPORT_STATUS_LABEL[existing.status]}
            {existing.status === "OPEN" ? ` · ${longDate(existing.createdAt.slice(0, 10))}에 보냈어요` : ""}
          </Notice>
          {existing.resolution ? <Sub>{existing.resolution}</Sub> : null}
          {existing.status === "OPEN" ? (
            <Sub tone="3" variant="caption">
              {existing.sent ? "확인하고 결과를 알려드릴게요." : "아직 못 보냈어요. 연결되면 자동으로 보냅니다."}
            </Sub>
          ) : null}
        </View>
      ) : form ? (
        <View style={{ gap: 18 }}>
          <Field
            label="무엇이 이상한가요?"
            value={message}
            onChange={setMessage}
            placeholder="예: 보증금이 공고문과 달라요"
            autoFocus
            multiline
          />
          <Field label="공고문에 적힌 값 (선택)" value={suggested} onChange={setSuggested} placeholder="예: 4억 3,524만 원" />
          {/* 흐린 버튼을 두지 않는다. 적을 내용이 생기면 그때 버튼이 올라온다 */}
          <SlideUp visible={ok}>
            <PrimaryButton label="보내기" onPress={() => onSubmit(message, suggested)} />
          </SlideUp>
          <Sub tone="3" variant="caption">
            신고한 항목과 적어 주신 내용만 보내요. 이름·연락처 같은 개인정보는 적지 말아 주세요.
          </Sub>
        </View>
      ) : (
        <PrimaryButton tone="soft" label="이 숫자 이상해요" onPress={() => setForm(true)} />
      )}
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Sub>{label}</Sub>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.slice(0, 300))}
        placeholder={placeholder}
        placeholderTextColor={colors.line}
        autoFocus={autoFocus}
        multiline={multiline}
        selectionColor={colors.primary}
        accessibilityLabel={label}
        style={[
          {
            fontFamily: fonts.medium,
            fontSize: 16,
            lineHeight: 24,
            color: colors.text,
            backgroundColor: colors.cardSoft,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: multiline ? 88 : undefined,
            textAlignVertical: multiline ? "top" : "center",
          },
          Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
        ]}
      />
    </View>
  );
}
