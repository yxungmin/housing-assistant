/**
 * 검수 뷰어 (로컬). 두 가지를 본다.
 *  - 추출 검수: benchmark/output/*.draft.json 과 benchmark/fixtures/*.json
 *  - 신고 큐: 앱에서 온 "이 숫자 이상해요" (issue_reports). Supabase가 설정돼 있을 때만 보인다.
 *   npm run review   → http://localhost:4310
 * 화면은 의존성 없이 node:http + 인라인 HTML. M4 검수 어드민의 최소 버전.
 */
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./config";
import { Repo, type ReportStatus } from "./db/supabase";
import { fromRoot } from "./paths";

const env = loadEnv();
const repo =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? new Repo(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.PDF_BUCKET) : null;

/** 신고를 끝내는 네 가지. 값을 실제로 고치는 것은 재추출·게시가 하고, 여기서는 결과만 남긴다. */
const RESOLUTIONS: { status: Exclude<ReportStatus, "OPEN">; label: string; hint: string }[] = [
  { status: "NO_CHANGE", label: "공고문과 같음", hint: "공고문을 다시 확인했고 값이 같아요." },
  { status: "FIXED", label: "수정함", hint: "알려 주신 대로 고쳤어요. " },
  { status: "SOURCE_AMENDED", label: "공고 정정", hint: "공고가 정정되어 값이 바뀌었어요." },
  { status: "INVALID", label: "신고 아님", hint: "" },
];

const OUT = fromRoot("benchmark", "output");
const FIXTURES = fromRoot("benchmark", "fixtures");
const PORT = Number(process.env.REVIEW_PORT ?? 4310);

function listDrafts() {
  const items: { id: string; kind: "draft" | "fixture"; file: string; mtime: number }[] = [];
  if (existsSync(OUT)) {
    for (const f of readdirSync(OUT)) {
      if (f.endsWith(".draft.json")) items.push({ id: f.replace(".draft.json", ""), kind: "draft", file: join(OUT, f), mtime: statMtime(join(OUT, f)) });
    }
  }
  if (existsSync(FIXTURES)) {
    for (const f of readdirSync(FIXTURES)) {
      if (f.endsWith(".json")) items.push({ id: f.replace(".json", ""), kind: "fixture", file: join(FIXTURES, f), mtime: statMtime(join(FIXTURES, f)) });
    }
  }
  // 초안 먼저, 그 다음 정답 fixture. 같은 종류 안에서는 id 순.
  return items.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

function statMtime(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function json(res: import("node:http").ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>공고 추출 검수</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1a1d21;--muted:#6b7280;--border:#e5e7eb;--primary:#03a24a;--warn:#d97706;--bad:#dc2626}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;background:var(--bg);color:var(--text)}
header{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:12px 20px;background:var(--card);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:2}
header h1{font-size:16px;margin:0;white-space:nowrap}header select,header button{font:inherit;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff}header select{flex:1;min-width:220px;max-width:100%}
main{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;padding:16px 20px;max-width:1500px}
.card{overflow-x:auto}
@media(max-width:1100px){main{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px}
.card h2{font-size:15px;margin:0 0 10px}.card h3{font-size:14px;margin:16px 0 6px;color:var(--muted)}
.kv{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;font-size:13px}.kv b{color:var(--muted);font-weight:500}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:500;white-space:nowrap}td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;background:#eef2f7;color:#374151}
.badge.ok{background:#e6f6ec;color:#15803d}.badge.warn{background:#fef3c7;color:#92400e}.badge.bad{background:#fee2e2;color:#991b1b}
.src{color:var(--muted);font-size:12px}.page{cursor:pointer;color:var(--primary);text-decoration:underline dotted}
pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;background:#fafafa;border:1px solid var(--border);border-radius:8px;padding:10px;max-height:70vh;overflow:auto}
.notes li{margin-bottom:6px}.empty{color:var(--muted);padding:40px;text-align:center}
.rep{border-left:3px solid var(--warn);padding-left:12px;margin-bottom:18px}
.rep.done{border-left-color:var(--border)}
.rep .msg{background:#fafafa;border:1px solid var(--border);border-radius:8px;padding:10px;margin:8px 0}
.acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}
.acts button{font:inherit;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
.acts button:hover{background:#f3f4f6}
.acts input{font:inherit;flex:1;min-width:200px;padding:6px 10px;border:1px solid var(--border);border-radius:8px}
</style></head><body>
<header><h1>공고 검수</h1><select id="pick"></select><button id="reload">새로고침</button><button id="tabHealth">상태</button><button id="tabReports">신고 큐</button><span id="meta" class="src"></span></header>
<main><section id="content"><div class="empty">초안을 고르세요</div></section><aside><div class="card"><h2 id="srcTitle">원문 페이지</h2><div class="src" id="srcHint">표의 쪽수를 누르면 그 페이지 원문이 여기 나옵니다 (npm run inspect -- &lt;pdf&gt; --text 로 저장된 경우)</div><pre id="srcText" hidden></pre></div></aside></main>
<script>
const won=n=>n==null?"":Number(n).toLocaleString("ko-KR");
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let current=null;
async function load(){
  const list=await (await fetch("/api/list")).json();
  const pick=document.getElementById("pick");const prev=pick.value;
  pick.innerHTML=list.map(x=>\`<option value="\${x.kind}:\${x.id}">\${x.id} · \${x.kind==="draft"?"초안":"정답"} · \${x.title??""}</option>\`).join("");
  if(list.length===0){document.getElementById("content").innerHTML='<div class="empty">benchmark/output/*.draft.json 이 없습니다. npm run inspect -- benchmark/pdfs/001.pdf --extract</div>';return}
  pick.value=[...pick.options].some(o=>o.value===prev)?prev:pick.options[0].value;
  show();
}
async function show(){
  const [kind,id]=document.getElementById("pick").value.split(":");
  const d=await (await fetch(\`/api/item?kind=\${kind}&id=\${id}\`)).json();current={id,data:d};
  const g=d.gold;const issues=d._auto_check_issues??[];
  document.getElementById("meta").textContent=\`\${d._model??""} \${d.pdf??""}\`;
  let h=\`<div class="card"><h2>\${esc(g.title)} <span class="badge">\${esc(g.housing_type)}</span></h2>
  <div class="kv"><b>주소</b><span>\${esc(g.address??"-")}</span><b>공고일</b><span>\${esc(g.schedule.notice_date??"-")}</span><b>접수</b><span>\${esc(g.schedule.apply_start??"?")} ~ \${esc(g.schedule.apply_end??"?")}</span><b>당첨자 발표</b><span>\${esc(g.schedule.winner_announce??"-")}</span><b>입주 예정</b><span>\${esc(g.schedule.move_in??"-")}</span>
  <b>자동 검증</b><span>\${issues.length?\`<span class="badge bad">\${issues.length}건</span> \${issues.map(esc).join(" / ")}\`:'<span class="badge ok">통과</span>'}</span></div></div>\`;
  for(const t of g.tracks){
    const gmode=Object.fromEntries((t.rule_groups??[]).map(x=>[x.id,x]));
    h+=\`<div class="card"><h2>\${esc(t.name)} <span class="badge">\${t.households??"?"}세대</span></h2>
    <h3>주택형</h3><table><tr><th>주택형</th><th>전용면적</th><th>세대수</th></tr>\${(t.unit_types??[]).map(u=>\`<tr><td>\${esc(u.name)}</td><td class="num">\${u.exclusive_area_m2??""}</td><td class="num">\${u.households??""}</td></tr>\`).join("")}</table>
    <h3>자격 룰 (\${t.rules.length})</h3><table><tr><th>그룹</th><th>category</th><th>조건</th><th>적용 대상</th><th>신뢰도</th><th>근거</th></tr>
    \${t.rules.map(r=>{const gr=gmode[r.group_id];const ap=Object.entries(r.applies_to??{}).map(([k,v])=>k+"="+JSON.stringify(v)).join(", ");
      return \`<tr><td><span class="badge \${gr?.mode==="any_of"?"warn":""}">\${esc(r.group_id)}\${gr?" · "+esc(gr.mode):""}</span><div class="src">\${esc(gr?.label??"")}</div></td><td>\${esc(r.category)}</td><td><b>\${esc(r.operator)}</b> \${esc(JSON.stringify(r.value))} <span class="src">\${esc(r.unit??"")}</span></td><td class="src">\${esc(ap||"전체")}</td><td class="num">\${r.confidence}</td><td class="src"><span class="page" data-p="\${r.source.page}">p.\${r.source.page}</span> \${esc(r.source.text.slice(0,90))}</td></tr>\`}).join("")}</table>
    <h3>임대조건 (\${t.pricing.length})</h3><table><tr><th>주택형</th><th>계층</th><th>구분</th><th>보증금</th><th>월임대료</th><th>분양가</th><th>전환</th><th>관리비</th><th>근거</th></tr>
    \${t.pricing.map(p=>\`<tr><td>\${esc(p.unit_type)}</td><td>\${esc(p.tier??"")}</td><td>\${esc(p.kind)}</td><td class="num">\${won(p.deposit)}</td><td class="num">\${won(p.monthly_rent)}</td><td class="num">\${won(p.sale_price)}</td><td class="src">\${p.conversion?\`↑\${(p.conversion.rate*100).toFixed(1)}%\${p.conversion.rate_down!=null?" ↓"+(p.conversion.rate_down*100).toFixed(1)+"%":""}\${p.conversion.max_deposit?" 최대 "+won(p.conversion.max_deposit):""}\${p.conversion.min_deposit?" 최소 "+won(p.conversion.min_deposit):""}\`:""}</td><td class="num">\${won(p.maintenance_estimate)}</td><td class="src"><span class="page" data-p="\${p.source.page}">p.\${p.source.page}</span></td></tr>\`).join("")}</table></div>\`;
  }
  if(g.notes?.length) h+=\`<div class="card"><h2>구조화하지 못한 조건 (notes)</h2><ul class="notes">\${g.notes.map(n=>"<li>"+esc(n)+"</li>").join("")}</ul></div>\`;
  document.getElementById("content").innerHTML=h;
  document.querySelectorAll(".page").forEach(el=>el.addEventListener("click",()=>showPage(Number(el.dataset.p))));
}
async function showPage(p){
  const r=await fetch(\`/api/text?id=\${current.id}&page=\${p}\`);const t=document.getElementById("srcText");
  document.getElementById("srcTitle").textContent=\`원문 p.\${p}\`;
  if(!r.ok){t.hidden=true;document.getElementById("srcHint").textContent="원문 텍스트가 없습니다. npm run inspect -- benchmark/pdfs/"+current.id+".pdf --text 로 저장하세요.";return}
  document.getElementById("srcHint").textContent="";t.hidden=false;t.textContent=await r.text();
}

// ── 신고 큐 ───────────────────────────────────────────────────────────
const RES=[["NO_CHANGE","공고문과 같음"],["FIXED","수정함"],["SOURCE_AMENDED","공고 정정"],["INVALID","신고 아님"]];
const KIND={rule:"자격 조건",pricing:"임대조건",schedule:"일정",other:"기타"};
const STATUS={OPEN:"확인 중",NO_CHANGE:"공고문과 같음",FIXED:"수정함",SOURCE_AMENDED:"공고 정정",INVALID:"신고 아님"};
let view="drafts";

function reportCard(r){
  const done=r.status!=="OPEN";
  const where=(r.page?" · p."+r.page:"")+(r.track_index!=null?" · 트랙 "+r.track_index+" 항목 "+r.item_index:"");
  let h='<div class="rep'+(done?" done":"")+'">';
  h+='<div><span class="badge '+(done?"ok":"warn")+'">'+esc(STATUS[r.status]||r.status)+'</span> <span class="src">'+esc((r.created_at||"").slice(0,10))+'</span></div>';
  h+='<div style="margin-top:4px"><b>'+esc(r.label||"(대상 없음)")+'</b> <span class="src">'+esc(KIND[r.target_kind]||r.target_kind)+where+'</span></div>';
  h+='<div class="src">'+esc(r.announcements?r.announcements.provider+" · "+r.announcements.title:(r.announcement_id||""))+'</div>';
  h+='<div class="msg">'+esc(r.message||"(내용 없음)")+(r.suggested?'<div class="src">공고문에 적힌 값: '+esc(r.suggested)+'</div>':"")+'</div>';
  if(done) h+=r.resolution?'<div class="src">→ '+esc(r.resolution)+'</div>':"";
  else{
    h+='<div class="acts"><input class="res" data-id="'+esc(r.id)+'" placeholder="사용자에게 보일 한 줄 (비우면 기본 문구)">';
    for(const x of RES) h+='<button data-id="'+esc(r.id)+'" data-st="'+x[0]+'">'+x[1]+'</button>';
    h+='</div>';
  }
  return h+'</div>';
}

async function showReports(){
  const c=document.getElementById("content");
  const r=await (await fetch("/api/reports")).json();
  if(!r.configured){
    c.innerHTML='<div class="card"><h2>신고 큐</h2><div class="src">Supabase가 설정되지 않았습니다. .env에 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 넣으면 앱에서 온 신고가 여기 쌓입니다.<br>그 전까지 신고는 사용자 기기에 남아 있다가 연결되면 올라옵니다.</div></div>';
    return;
  }
  if(r.error){c.innerHTML='<div class="card"><h2>신고 큐</h2><div class="src">읽기 실패: '+esc(r.error)+'</div></div>';return}
  const open=r.reports.filter(x=>x.status==="OPEN"), done=r.reports.filter(x=>x.status!=="OPEN");
  let h='<div class="card"><h2>확인 중 '+open.length+'건</h2>'+(open.length?open.map(reportCard).join(""):'<div class="src">확인할 신고가 없습니다.</div>')+'</div>';
  if(done.length) h+='<div class="card"><h2>처리함 '+done.length+'건</h2>'+done.map(reportCard).join("")+'</div>';
  c.innerHTML=h;
  c.querySelectorAll(".acts button").forEach(b=>b.addEventListener("click",async()=>{
    const input=c.querySelector('.res[data-id="'+b.dataset.id+'"]');
    b.disabled=true;
    const res=await fetch("/api/reports/resolve",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({id:b.dataset.id,status:b.dataset.st,resolution:input?input.value:""})});
    if(!res.ok){alert("처리 실패: "+await res.text());b.disabled=false;return}
    showReports();refreshCount();
  }));
}

/**
 * 상태판. "신뢰가 깨지고 있는가"를 먼저 보여 준다 — 방치하면 서비스의 전제가 무너지는 것들이다.
 * 좋은 숫자는 회색, 손대야 하는 숫자만 색을 쓴다. 전부 색이면 아무것도 눈에 안 띈다.
 */
async function showHealth(){
  const h=await (await fetch("/api/health")).json();
  const c=document.getElementById("content");
  if(!h.configured){c.innerHTML='<div class="empty">Supabase가 설정되지 않아 상태를 볼 수 없어요<br><span class="src">.env에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY</span></div>';return;}
  if(h.error){c.innerHTML='<div class="card"><h2>상태</h2><div class="src">'+esc(h.error)+'</div></div>';return;}

  const tone=(v,warnAt)=>v===0?"":v>=warnAt?"bad":"warn";
  const days=h.oldestOpenDays;
  const st=h.byStatus||{};
  const total=Object.values(st).reduce((a,b)=>a+b,0);
  const unread=st.UNVERIFIED||0;
  const pct=total?Math.round(unread/total*100):0;
  const ago=h.lastExtractedAt?Math.floor((Date.now()-Date.parse(h.lastExtractedAt))/86400000):null;
  const cost=h.extractedThisMonth*1079;

  const row=(label,value,badge,hint)=>'<tr><td>'+label+'</td><td class="num">'+value+
    (badge?' <span class="badge '+badge+'">손대야 함</span>':'')+'</td><td class="src">'+(hint||"")+'</td></tr>';

  c.innerHTML=
   '<div class="card"><h2>신뢰</h2><table>'+
      row("확인 중인 신고", h.reportsOpen+"건", tone(h.reportsOpen,1), h.reportsOpen?"신고 큐에서 처리":"쌓인 것 없음")+
      row("가장 오래 묵은 신고", days===null?"—":days+"일", days===null?"":(days>=3?"bad":days>=1?"warn":""), "사용자는 그동안 답을 못 받고 있다")+
      row("게시 보류 (CONFLICT)", h.conflicts+"건", tone(h.conflicts,1), "숫자를 믿을 수 없어 막힌 공고. 앱에 안 보인다")+
      row("지적 달린 채 게시", h.withChecks+"건", h.withChecks?"warn":"", "checks가 앱에 그대로 노출된다")+
      row("조건을 못 읽은 공고", unread+"건 / "+total+"건 ("+pct+"%)", pct>=30?"bad":pct>=15?"warn":"", "매칭·계산을 못 하는 공고")+
   '</table></div>'+
   '<div class="card"><h2>수집</h2><table>'+
      row("마지막 추출", ago===null?"없음":(ago===0?"오늘":ago+"일 전"), ago===null?"warn":(ago>=7?"warn":""), "며칠째 조용하면 파이프라인을 본다")+
      row("이번 달 추출", h.extractedThisMonth+"건", "", "번들에서 옮긴 것은 제외")+
      row("이번 달 추출비(추정)", cost.toLocaleString("ko-KR")+"원", "", "1건 1,079원 기준 · 실제 청구액은 콘솔에서")+
   '</table></div>'+
   '<div class="card"><h2>게시 상태</h2><table>'+
      row("사람이 대조함 (VERIFIED)", (st.VERIFIED||0)+"건","","")+
      row("자동 검증만 (AUTO)", (st.AUTO||0)+"건","","")+
      row("못 읽음 (UNVERIFIED)", unread+"건","","")+
   '</table></div>';
}

async function refreshCount(){
  try{
    const r=await (await fetch("/api/reports")).json();
    if(!r.configured||!r.reports) return;
    const n=r.reports.filter(x=>x.status==="OPEN").length;
    if(view!=="reports") document.getElementById("tabReports").textContent=n?"신고 큐 "+n:"신고 큐";
  }catch(e){/* 무시 */}
}

// 화면 셋을 한 자리에서 오간다. 탭 프레임워크를 쓸 만한 규모가 아니다.
function goto(next){
  view=next;
  document.getElementById("pick").style.display=view==="drafts"?"":"none";
  document.getElementById("tabReports").textContent=view==="reports"?"추출 검수로":"신고 큐";
  document.getElementById("tabHealth").textContent=view==="health"?"추출 검수로":"상태";
  if(view==="reports")showReports();
  else if(view==="health")showHealth();
  else show();
  refreshCount();
}
document.getElementById("tabReports").addEventListener("click",()=>goto(view==="reports"?"drafts":"reports"));
document.getElementById("tabHealth").addEventListener("click",()=>goto(view==="health"?"drafts":"health"));
document.getElementById("pick").addEventListener("change",show);
document.getElementById("reload").addEventListener("click",()=>{if(view==="reports")showReports();else if(view==="health")showHealth();else load();refreshCount()});
load();refreshCount();
</script></body></html>`;

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 100_000) reject(new Error("요청이 너무 크다"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(HTML);
    }
    if (url.pathname === "/api/list") {
      return json(
        res,
        listDrafts().map((d) => {
          let title = "";
          try {
            title = JSON.parse(readFileSync(d.file, "utf8")).gold?.title ?? "";
          } catch {
            /* ignore */
          }
          return { id: d.id, kind: d.kind, title };
        }),
      );
    }
    if (url.pathname === "/api/item") {
      const id = url.searchParams.get("id") ?? "";
      const kind = url.searchParams.get("kind") ?? "draft";
      const item = listDrafts().find((d) => d.id === id && d.kind === kind);
      if (!item) return json(res, { error: "not found" }, 404);
      return json(res, JSON.parse(readFileSync(item.file, "utf8")));
    }
    if (url.pathname === "/api/text") {
      const id = (url.searchParams.get("id") ?? "").replace(/[^0-9A-Za-z_-]/g, "");
      const page = Number(url.searchParams.get("page"));
      const file = join(OUT, `${id}.txt`);
      if (!existsSync(file)) return json(res, { error: "no text" }, 404);
      const all = readFileSync(file, "utf8");
      const m = new RegExp(`=== p\\.${page} ===\\n([\\s\\S]*?)(?=\\n\\n=== p\\.\\d+ ===|$)`).exec(all);
      res.writeHead(m ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
      return res.end(m ? m[1] : "");
    }
    // ── 상태판 ───────────────────────────────────────────────────────
    if (url.pathname === "/api/health") {
      if (!repo) return json(res, { configured: false });
      try {
        return json(res, { configured: true, ...(await repo.health()) });
      } catch (err) {
        return json(res, { configured: true, error: err instanceof Error ? err.message : String(err) });
      }
    }
    // ── 신고 큐 ───────────────────────────────────────────────────────
    if (url.pathname === "/api/reports") {
      if (!repo) return json(res, { configured: false, reports: [] });
      try {
        return json(res, { configured: true, reports: await repo.listReports() });
      } catch (err) {
        return json(res, { configured: true, reports: [], error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (url.pathname === "/api/reports/resolve" && req.method === "POST") {
      if (!repo) return json(res, { error: "Supabase 미설정" }, 400);
      const body = JSON.parse((await readBody(req)) || "{}") as { id?: string; status?: string; resolution?: string };
      const choice = RESOLUTIONS.find((r) => r.status === body.status);
      if (!body.id || !choice) return json(res, { error: "id와 status가 필요하다" }, 400);
      // 한 줄을 비워 두면 그 상태의 기본 문구를 쓴다. 사용자 신고 내역에 그대로 보이므로 빈 채로 두지 않는다.
      await repo.resolveReport(body.id, choice.status, body.resolution?.trim() || choice.hint);
      return json(res, { ok: true });
    }
    json(res, { error: "not found" }, 404);
  } catch (err) {
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`검수 뷰어: http://localhost:${PORT}  (초안 ${listDrafts().length}건, 신고 큐 ${repo ? "켬" : "꺼짐 — SUPABASE_URL/SERVICE_ROLE_KEY 없음"})`);
});
