import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionOutput, HousingType, VersionStatus } from "@housing/schema";

export type Provider = "LH" | "SH";

/** issue_reports.status — 앱의 lib/reports.ts와 같은 값을 쓴다 */
export type ReportStatus = "OPEN" | "NO_CHANGE" | "FIXED" | "SOURCE_AMENDED" | "INVALID";

export interface ReportRow {
  id: string;
  announcement_id: string | null;
  target_kind: "rule" | "pricing" | "schedule" | "other";
  track_index: number | null;
  item_index: number | null;
  /** 신고 당시 사용자 화면에 보이던 문장 */
  label: string | null;
  page: number | null;
  message: string | null;
  suggested: string | null;
  version: number | null;
  status: ReportStatus;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  announcements: { title: string; provider: Provider; lh_id: string } | null;
}

export interface AnnouncementRow {
  id: string;
  lh_id: string;
  provider: Provider;
  title: string;
  housing_type: HousingType;
  region_code: string;
  published_version: number | null;
  source_modified_at: string | null;
  latest_version: number | null;
}

export class Repo {
  readonly sb: SupabaseClient;
  constructor(url: string, serviceRoleKey: string, private readonly bucket: string) {
    this.sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  /** 공급기관 + 기관 내부 식별자로 찾는다 (0004_provider.sql의 유일 인덱스와 같은 기준) */
  async findByExternalId(provider: Provider, externalId: string): Promise<AnnouncementRow | null> {
    const { data, error } = await this.sb
      .from("announcements")
      .select("id, lh_id, provider, title, housing_type, region_code, published_version, source_modified_at, latest_version")
      .eq("provider", provider)
      .eq("lh_id", externalId)
      .maybeSingle();
    if (error) throw error;
    return (data as AnnouncementRow | null) ?? null;
  }

  async upsertAnnouncement(input: {
    provider: Provider;
    lh_id: string;
    title: string;
    housing_type: HousingType;
    region_code: string;
    notice_date?: string;
    apply_start?: string;
    apply_end?: string;
    pdf_url?: string;
    detail_url?: string;
    /** 공급기관이 부르는 단지 이름. 지난 회차 결과를 이을 때 쓴다 */
    complex?: string;
    images?: object[];
    /** 흩어진 집 목록 (매입임대·전세임대). 단지형 공고에는 없다 */
    units?: object[];
    source_modified_at?: string;
    lat?: number;
    lng?: number;
    transit?: Record<string, unknown>;
    market?: object;
    waiting?: object;
    commute?: object;
    /** K-apt 관리비 단가 (maintenance/kapt.ts). 못 구하면 없다 */
    maintenance?: object;
    nearby?: Record<string, unknown>[];
  }): Promise<string> {
    const { data, error } = await this.sb
      .from("announcements")
      .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "provider,lh_id" })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async uploadPdf(provider: Provider, externalId: string, version: number, bytes: Uint8Array): Promise<string> {
    const path = `${provider}/${externalId}/v${version}.pdf`;
    const { error } = await this.sb.storage.from(this.bucket).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    return this.sb.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }

  /**
   * 새 버전을 저장한다. 트랙·그룹·룰·가격은 version_id에 매달린다.
   * published_version은 건드리지 않는다 → 검수 통과 전까지 앱은 이전 VERIFIED 버전을 본다.
   */
  async insertVersion(input: {
    announcement_id: string;
    version: number;
    status: VersionStatus;
    source_modified_at?: string;
    /** 게시를 막는 사유. 비어 있지 않으면 status는 CONFLICT다 */
    conflict_reasons: string[];
    /** 게시하되 앱에 알리는 지적 */
    checks?: string[];
    extraction: ExtractionOutput | null;
    model?: string;
    prompt_version?: string;
    raw_text_chars?: number;
  }): Promise<string> {
    const { data: ver, error } = await this.sb
      .from("announcement_versions")
      .insert({
        announcement_id: input.announcement_id,
        version: input.version,
        status: input.status,
        source_modified_at: input.source_modified_at ?? null,
        extracted_at: new Date().toISOString(),
        conflict_reasons: input.conflict_reasons,
        checks: input.checks ?? [],
        extraction_model: input.model ?? null,
        prompt_version: input.prompt_version ?? null,
        raw_text_chars: input.raw_text_chars ?? null,
        // 앱 피드(app_announcements 뷰)가 그대로 내려주는 형태. 아래 정규화 테이블과 같은 내용이다.
        extraction: input.extraction,
      })
      .select("id")
      .single();
    if (error) throw error;
    const versionId = (ver as { id: string }).id;

    if (input.extraction) {
      for (const track of input.extraction.tracks) {
        const { data: t, error: te } = await this.sb
          .from("supply_tracks")
          .insert({ version_id: versionId, name: track.name, households: track.households ?? null, unit_types: track.unit_types })
          .select("id")
          .single();
        if (te) throw te;
        const trackId = (t as { id: string }).id;
        const groupIdMap = new Map<string, string>();
        for (const g of track.rule_groups) {
          const { data: gr, error: ge } = await this.sb
            .from("rule_groups")
            .insert({ track_id: trackId, key: g.id, mode: g.mode, label: g.label })
            .select("id")
            .single();
          if (ge) throw ge;
          groupIdMap.set(g.id, (gr as { id: string }).id);
        }
        if (track.rules.length) {
          const { error: re } = await this.sb.from("eligibility_rules").insert(
            track.rules.map((r) => ({
              track_id: trackId,
              group_id: groupIdMap.get(r.group_id) ?? null,
              category: r.category,
              applies_to: r.applies_to,
              operator: r.operator,
              value: r.value,
              unit: r.unit ?? null,
              source_page: r.source.page,
              source_text: r.source.text,
              confidence: r.confidence,
              verified: false,
            })),
          );
          if (re) throw re;
        }
        if (track.pricing.length) {
          const { error: pe } = await this.sb.from("pricing").insert(
            track.pricing.map((p) => ({
              track_id: trackId,
              unit_type: p.unit_type,
              kind: p.kind,
              deposit: p.deposit ?? null,
              monthly_rent: p.monthly_rent ?? null,
              sale_price: p.sale_price ?? null,
              conversion: p.conversion ?? null,
              payment_schedule: p.payment_schedule ?? null,
              maintenance_estimate: p.maintenance_estimate ?? null,
              source_page: p.source.page,
              source_text: p.source.text,
            })),
          );
          if (pe) throw pe;
        }
      }
    }
    const { error: ue } = await this.sb.from("announcements").update({ latest_version: input.version }).eq("id", input.announcement_id);
    if (ue) throw ue;
    return versionId;
  }

  /**
   * 자동 게시. 사람 승인 없이 이 버전을 앱에 내보낸다 (0006_auto_publish.sql).
   * 사람이 하루 못 봐도 새 공고가 뜨게 하는 것이 목적이다. 사람 확인은 publish_version()이 따로 찍는다.
   */
  async autoPublish(versionId: string): Promise<void> {
    const { error } = await this.sb.rpc("auto_publish_version", { p_version_id: versionId });
    if (error) throw error;
  }

  /**
   * 신뢰가 깨지고 있는지 한눈에 보는 값들.
   *
   * 이 넷은 우리만 볼 수 있고, 방치하면 서비스의 전제가 무너진다 —
   * 신고가 쌓이는데 아무도 안 보거나, CONFLICT로 게시가 막힌 공고를 모르거나,
   * 조건을 못 읽은 공고가 늘어나는 것을 모르면 "정확하다"는 약속이 조용히 거짓이 된다.
   *
   * 전부 우리 DB의 사실이라 여기서 센다. 분석 도구로 보내면 같은 숫자의 출처가 둘이 되고,
   * 둘이 어긋날 때 어느 쪽을 믿을지가 문제가 된다.
   */
  async health(): Promise<{
    reportsOpen: number;
    oldestOpenDays: number | null;
    conflicts: number;
    withChecks: number;
    byStatus: Record<string, number>;
    lastExtractedAt: string | null;
    extractedThisMonth: number;
  }> {
    const count = async (table: string, apply: (q: any) => any): Promise<number> => {
      const { count: c, error } = await apply(this.sb.from(table).select("*", { count: "exact", head: true }));
      if (error) throw error;
      return c ?? 0;
    };

    const reportsOpen = await count("issue_reports", (q) => q.eq("status", "OPEN"));
    const conflicts = await count("announcement_versions", (q) => q.eq("status", "CONFLICT"));

    // 가장 오래된 "확인 중" 신고. 며칠 묵었는지가 곧 우리가 얼마나 방치했는지다.
    const { data: oldest } = await this.sb
      .from("issue_reports").select("created_at").eq("status", "OPEN")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    const oldestOpenDays = oldest
      ? Math.floor((Date.now() - Date.parse((oldest as { created_at: string }).created_at)) / 86_400_000)
      : null;

    // 게시된 공고의 상태 분포 + 지적이 달린 채 나간 것
    const { data: feed, error: feedErr } = await this.sb.from("app_announcements").select("status, checks");
    if (feedErr) throw feedErr;
    const rows = (feed ?? []) as { status: string; checks: unknown[] | null }[];
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const withChecks = rows.filter((r) => Array.isArray(r.checks) && r.checks.length > 0).length;

    const { data: last } = await this.sb
      .from("announcement_versions").select("extracted_at")
      .not("extracted_at", "is", null).order("extracted_at", { ascending: false }).limit(1).maybeSingle();
    const lastExtractedAt = (last as { extracted_at: string } | null)?.extracted_at ?? null;

    // 이번 달 추출 건수. 번들에서 옮긴 것(prompt_version=bundle-import)은 돈이 안 들었으므로 뺀다.
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const extractedThisMonth = await count("announcement_versions", (q) =>
      q.gte("extracted_at", monthStart.toISOString()).neq("prompt_version", "bundle-import"),
    );

    return { reportsOpen, oldestOpenDays, conflicts, withChecks, byStatus, lastExtractedAt, extractedThisMonth };
  }

  /** 검수 큐: "이 숫자 이상해요" 신고. 확인 중인 것을 먼저, 그 안에서는 오래된 것부터 본다. */
  async listReports(opts: { open?: boolean; limit?: number } = {}): Promise<ReportRow[]> {
    let q = this.sb
      .from("issue_reports")
      .select("id, announcement_id, target_kind, track_index, item_index, label, page, message, suggested, version, status, resolution, resolved_at, created_at, announcements(title, provider, lh_id)")
      .order("created_at", { ascending: true })
      .limit(opts.limit ?? 200);
    if (opts.open) q = q.eq("status", "OPEN");
    const { data, error } = await q;
    if (error) throw error;
    return (data as unknown as ReportRow[]) ?? [];
  }

  /**
   * 신고 처리. 값을 실제로 고치는 것은 재추출·버전 게시가 하고, 여기서는 사용자에게 보일 결과만 남긴다.
   * resolution은 앱의 신고 내역에 그대로 보인다.
   */
  async resolveReport(id: string, status: Exclude<ReportStatus, "OPEN">, resolution: string): Promise<void> {
    const { error } = await this.sb
      .from("issue_reports")
      .update({ status, resolution: resolution.trim() || null, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  /** 지역·유형이 맞는 푸시 구독자 토큰 (service role 전용 읽기) */
  async pushTargets(regionCode: string, housingType: HousingType): Promise<string[]> {
    const { data, error } = await this.sb
      .from("push_subscriptions")
      .select("expo_token")
      .contains("regions", [regionCode])
      .contains("housing_types", [housingType]);
    if (error) throw error;
    return (data as { expo_token: string }[]).map((d) => d.expo_token);
  }

  /** 죽은 토큰(DeviceNotRegistered)을 지운다. 계속 보내면 Expo가 계정을 제한한다 */
  async removePushTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    const { error } = await this.sb.from("push_subscriptions").delete().in("expo_token", tokens);
    if (error) throw error;
  }
}
