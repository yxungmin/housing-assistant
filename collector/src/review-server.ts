/**
 * 추출 결과 검수 뷰어 (로컬). benchmark/output/*.draft.json 과 benchmark/fixtures/*.json 을 표로 보여 준다.
 *   npm run review   → http://localhost:4310
 * 의존성 없이 node:http 만 쓴다. M4 검수 어드민의 최소 버전.
 */
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fromRoot } from "./paths";

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
</style></head><body>
<header><h1>공고 추출 검수</h1><select id="pick"></select><button id="reload">새로고침</button><span id="meta" class="src"></span></header>
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
document.getElementById("pick").addEventListener("change",show);document.getElementById("reload").addEventListener("click",load);
load();
</script></body></html>`;

const server = createServer((req, res) => {
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
    json(res, { error: "not found" }, 404);
  } catch (err) {
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`검수 뷰어: http://localhost:${PORT}  (초안 ${listDrafts().length}건)`);
});
