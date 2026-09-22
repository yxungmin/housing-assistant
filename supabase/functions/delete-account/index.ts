/**
 * 계정 삭제.
 *
 * App Store 심사 지침 5.1.1(v): 계정을 만들 수 있는 앱은 **앱 안에서 계정 삭제를 시작할 수
 * 있어야 한다**. 고객센터로 안내하거나 웹으로 떠넘기는 것은 인정되지 않는다.
 * 그리고 이건 심사를 통과하려고 만드는 기능이 아니다 — 남의 계정을 우리가 쥐고 있을 이유가 없다.
 *
 * 왜 Edge Function인가: 사용자를 지우려면 service role 키가 필요한데, 그 키가 앱에 들어가면
 * 누구나 뽑아서 **아무 계정이나** 지울 수 있다. 키는 서버에만 둔다.
 *
 * **지울 대상은 요청 본문이 아니라 토큰에서 얻는다.** 본문의 user_id를 믿으면
 * 아무나 남의 id를 적어 보내 계정을 지울 수 있다 — 삭제는 되돌릴 수 없으므로
 * 이 한 줄이 이 함수에서 제일 중요하다.
 *
 * 함께 지워지는 것: subscriptions는 on delete cascade로 같이 사라진다.
 * receipts는 user_id가 null이 되고 행은 남는다(on delete set null) — 결제 기록은
 * 세무·정산 근거라 지우지 않지만, 누구 것인지는 남지 않는다.
 * 프로필(소득·자산)은 처음부터 서버에 없다. 기기에만 있고 앱이 지운다.
 *
 * 배포:
 *   npx supabase functions deploy delete-account
 * (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY는 Edge Function 런타임이 기본 제공한다)
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST만 받아요" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "서버 설정이 없어요" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "로그인이 필요해요" }, 401);

  // 누구인지는 토큰이 정한다. 만료·위조 토큰은 여기서 걸린다.
  const me = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: serviceKey },
  });
  if (!me.ok) return json({ error: "로그인이 만료됐어요" }, 401);
  const user = (await me.json()) as { id?: string };
  if (!user.id) return json({ error: "계정을 찾지 못했어요" }, 401);

  const del = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  // 이미 지워졌으면 성공으로 본다 — 재시도로 실패를 보여 줄 이유가 없다
  if (!del.ok && del.status !== 404) return json({ error: `삭제하지 못했어요 (${del.status})` }, 502);

  return json({ deleted: true });
});
