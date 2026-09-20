import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionOutput, HousingType, VersionStatus } from "@housing/schema";

export interface AnnouncementRow {
  id: string;
  lh_id: string;
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

  async findByLhId(lhId: string): Promise<AnnouncementRow | null> {
    const { data, error } = await this.sb
      .from("announcements")
      .select("id, lh_id, title, housing_type, region_code, published_version, source_modified_at, latest_version")
      .eq("lh_id", lhId)
      .maybeSingle();
    if (error) throw error;
    return (data as AnnouncementRow | null) ?? null;
  }

  async upsertAnnouncement(input: {
    lh_id: string;
    title: string;
    housing_type: HousingType;
    region_code: string;
    notice_date?: string;
    apply_start?: string;
    apply_end?: string;
    pdf_url?: string;
    source_modified_at?: string;
    lat?: number;
    lng?: number;
    transit?: Record<string, unknown>;
  }): Promise<string> {
    const { data, error } = await this.sb
      .from("announcements")
      .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "lh_id" })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async uploadPdf(lhId: string, version: number, bytes: Uint8Array): Promise<string> {
    const path = `${lhId}/v${version}.pdf`;
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
    conflict_reasons: string[];
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
        extraction_model: input.model ?? null,
        prompt_version: input.prompt_version ?? null,
        raw_text_chars: input.raw_text_chars ?? null,
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
}
