"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let KEY = null, M = null, cur = null;
const imgCache = new Map();

async function deriveKey(pw) {
  const meta = await (await fetch("data/meta.json", { cache: "no-store" })).json();
  const salt = Uint8Array.from(atob(meta.salt), c => c.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: meta.iterations, hash: "SHA-256" }, base,
                                 { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
}
async function openBin(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, KEY, buf.slice(12));
}
async function unlock(pw, remember) {
  KEY = await deriveKey(pw);
  const plain = await openBin("data/manifest.bin");  // 密码错误会在这里抛出
  M = JSON.parse(new TextDecoder().decode(plain));
  if (remember) sessionStorage.setItem("k", JSON.stringify(await crypto.subtle.exportKey("jwk", KEY)));
  $("#gate").hidden = true; $("#app").hidden = false;
  render();
}
$("#login").onsubmit = async e => {
  e.preventDefault();
  $("#gateMsg").textContent = "正在解密…";
  try { await unlock($("#pw").value, true); $("#gateMsg").textContent = ""; }
  catch { KEY = null; $("#gateMsg").textContent = "密码不正确。"; }
};
$("#logout").onclick = () => { sessionStorage.removeItem("k"); location.reload(); };
(async () => {  // 同一浏览器会话内免重复输入
  const k = sessionStorage.getItem("k");
  if (!k) return;
  try {
    KEY = await crypto.subtle.importKey("jwk", JSON.parse(k), "AES-GCM", true, ["decrypt"]);
    M = JSON.parse(new TextDecoder().decode(await openBin("data/manifest.bin")));
    $("#gate").hidden = true; $("#app").hidden = false; render();
  } catch { sessionStorage.removeItem("k"); }
})();

$$("nav a").forEach(a => a.onclick = () => {
  $$("nav a").forEach(x => x.classList.toggle("on", x === a));
  $$("main > section").forEach(s => s.hidden = s.id !== "tab-" + a.dataset.tab);
});
const stamp = l => l ? `<span class="stamp ${l}">${M.label_zh[l] || l}</span>` : `<span class="stamp error">执行错误</span>`;
const pct = x => x == null ? "—" : (100 * x).toFixed(2) + "%";

function render() {
  $("#built").textContent = "生成于 " + M.summary.built_at;
  const s = M.summary;
  $("#tab-overview").innerHTML = `
    <p class="lead">五类命令、61 条规则（B001 两版本与 R001–R060）、审核台、评估插件与安全迭代均已实现。下表全部用主办方公开的 quality / contracts 代码计分；
    “对照组”指同一事实换版式、或只改决定性事实的成组题目，组内全对才算对。</p>
    <h2>审核质量</h2>
    <table><thead><tr><th>题集</th><th>答对 / 总数</th><th>Q</th><th>对照组全对</th><th>标注证据（满分 7）</th><th>执行错误</th></tr></thead><tbody>
    ${s.scores.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.correct ?? "—"} / ${r.units ?? "—"}</td><td class="num">${r.quality == null ? "—" : (+r.quality).toFixed(4)}</td>
      <td class="num">${r.contrast ? `${r.contrast.all_correct} / ${r.contrast.groups}` : "—"}</td><td class="num">${r.annotation ?? "—"}</td><td class="num">${r.error ?? "—"}</td></tr>`).join("")}
    </tbody></table>
    <h2>过程与产品</h2>
    <table><tbody>${s.process.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${esc(p.value)}</td></tr>`).join("")}</tbody></table>
    <h2>视觉大模型裁判</h2>
    <p class="lead">主模型 <code>${esc(s.judge.model)}</code>，不可用时依次改用 <code>${esc((s.judge.fallback_models || []).join(", "))}</code>（${esc(s.judge.base_url)}）。
    ${esc(s.judge.usage)}。</p>
    <h2>本站收录</h2>
    <table><thead><tr><th>题集</th><th>收录题数</th></tr></thead><tbody>${M.datasets.map(d => `<tr><td>${esc(d.title)}</td><td class="num">${d.shown}</td></tr>`).join("")}</tbody></table>`;
  $("#set").innerHTML = M.datasets.map(d => `<option value="${d.id}">${esc(d.title)}</option>`).join("");
  const rs = [...new Set(M.units.map(u => u.rule))].sort();
  $("#rule").innerHTML = `<option value="">全部</option>` + rs.map(r => `<option>${esc(r)}</option>`).join("");
  ["#set", "#rule", "#onlyWrong", "#onlyJudge"].forEach(id => $(id).onchange = renderList);
  renderList();
  $("#tab-rules").innerHTML = Object.entries(M.rules).sort().map(([k, r]) => `
    <h2>${esc(k)} ${esc(r.title || "")}</h2><div class="quote">${esc(r.text)}</div>
    <p class="muted">判定要点：${esc(r.quote || "")}</p>
    <pre>${esc(JSON.stringify({ applicability: r.applicability, checks: r.checks }, null, 1))}</pre>`).join("");
  $("#tab-method").innerHTML = `
    <h2>流程</h2>
    <p class="lead">材料图 → 本地 OCR（PP-OCRv6）与图像分析（标签框、遮挡、条纹、纸带、作废章、连接件、图形、颜色）→ 结构化事实（字段属于哪张材料、哪张标签、是否被遮挡或作废）
    → 编译后的规则规格（适用条件三值判断 + 共享算子 + 本条参数）→ 按“特别冲突 &gt; 已证实不满足 &gt; 影响结论的未知 &gt; 全部满足”合并为 pass / reject / ambiguous，附证据框与规则原文。</p>
    <h2>为什么结论稳定</h2>
    <p class="lead">感知与判定都是确定性算法，同一输入永远同一输出；版式变化时结论不变、决定性事实变化时结论必变，由成组的对照题检验。
    视觉大模型只在算法没找到目标时兜底回答窄问题，回答按图像哈希缓存。规则设计成“看不清应判 ambiguous”的情形（模糊印章、字形相同的 O/0）不交给模型。</p>
    <h2>规则与版本</h2>
    <p class="lead">规则逻辑写在规格数据里，代码中不出现规则编号；B001 的 100 mm / 80 mm 阈值从原文提取。每条规则的产物只依赖它实际用到的代码模块，改动一个算子只重建依赖它的规则。</p>`;
}

function filtered() {
  const set = $("#set").value, rule = $("#rule").value, wrong = $("#onlyWrong").checked, judge = $("#onlyJudge").checked;
  return M.units.filter(u => u.set === set && (!rule || u.rule === rule)
    && (!wrong || u.pred.label !== u.gold.label || u.pred.applicability !== u.gold.applicability)
    && (!judge || u.steps.some(s => (s.step || "").startsWith("vision_judge") && s.answer)));
}
function renderList() {
  const list = filtered();
  const ok = list.filter(u => u.pred.label === u.gold.label && u.pred.applicability === u.gold.applicability).length;
  $("#count").textContent = `${list.length} 题 · 与答案一致 ${ok}`;
  $("#list tbody").innerHTML = list.map((u, i) => `<tr data-i="${M.units.indexOf(u)}"><td>${esc(u.rule)}</td><td>${esc(u.case || "")}</td>
    <td>${stamp(u.pred.label)}</td><td>${stamp(u.gold.label)}</td></tr>`).join("");
  $$("#list tbody tr").forEach(tr => tr.onclick = () => { $$("#list tr.sel").forEach(x => x.classList.remove("sel")); tr.classList.add("sel"); show(M.units[+tr.dataset.i]); });
}
async function img(fid) {
  if (!imgCache.has(fid)) imgCache.set(fid, openBin(`data/img/${fid}.bin`).then(b => URL.createObjectURL(new Blob([b], { type: "image/webp" }))));
  return imgCache.get(fid);
}
async function show(u) {
  cur = u;
  const r = M.rules[u.rule] || {};
  const ev = u.pred.evidence || [];
  const judge = u.steps.filter(s => (s.step || "").startsWith("vision_judge"));
  $("#detail").innerHTML = `
    <dl class="kv"><dt>规则</dt><dd>${esc(u.rule)} ${esc(r.title || "")}</dd><dt>案例</dt><dd>${esc(u.case || "")}</dd>
      <dt>结论</dt><dd>${stamp(u.pred.label)} ${esc(u.pred.applicability || "")} · ${esc(u.pred.reason_code || u.pred.error_code || "")}</dd>
      <dt>理由</dt><dd>${esc(u.pred.reason || "")}</dd>
      <dt>标准答案</dt><dd>${stamp(u.gold.label)} ${esc(u.gold.applicability)} · ${esc(u.gold.reason || "")}</dd>
      <dt>申报信息</dt><dd><code>${esc(JSON.stringify(u.metadata))}</code></dd>
      <dt>执行产物</dt><dd>${esc(u.pred.artifact_version || "")}</dd></dl>
    <h2>规则原文</h2><div class="quote">${esc(r.text || "")}</div>
    ${judge.length ? `<h2>视觉裁判</h2>${judge.map(s => `<div class="step judge">${esc(s.model || "")} · ${esc(s.question || s.status || "")} → ${esc(s.answer ?? s.detail ?? "")}${s.adopted !== undefined ? ` · 采纳：${esc(s.adopted ?? "否")}` : ""}</div>`).join("")}` : ""}
    <h2>判定依据 <span class="muted">点击定位</span></h2>
    ${ev.map((e, i) => `<div class="ev" data-i="${i}">${esc(e.fact)}${e.bbox ? "" : ' <span class="muted">· 整页</span>'}</div>`).join("") || '<p class="muted">无需图像证据（由申报信息确定）。</p>'}
    <h2>判定步骤</h2>${u.steps.filter(s => !(s.step || "").startsWith("vision_judge")).map(s => `<div class="step">${esc(s.step)} ${esc(s.status || s.result || "")} ${esc(s.reason || "")}</div>`).join("")}
    <h2>材料</h2>${u.materials.map(m => `<div class="muted">${esc(m.role)} · 第 ${m.page_index} 页</div><div class="figure" data-m="${esc(m.material_id)}" data-p="${m.page_index}"></div>`).join("")}`;
  for (const m of u.materials) {
    const fig = $(`#detail .figure[data-m="${CSS.escape(m.material_id)}"][data-p="${m.page_index}"]`);
    const el = document.createElement("img");
    el.src = await img(m.img);
    fig.appendChild(el);
  }
  boxes(-1);
  $$("#detail .ev").forEach(d => d.onclick = () => { $$("#detail .ev").forEach(x => x.classList.toggle("on", x === d)); boxes(+d.dataset.i); });
}
function boxes(focus) {
  const ev = cur.pred.evidence || [];
  $$("#detail .figure").forEach(fig => {
    $$(".box", fig).forEach(b => b.remove());
    ev.forEach((e, i) => {
      if (!e.bbox || e.material_id !== fig.dataset.m || String(e.page_index) !== fig.dataset.p) return;
      const b = document.createElement("div");
      b.className = "box" + (focus >= 0 && focus !== i ? " dim" : "");
      const [x1, y1, x2, y2] = e.bbox;
      Object.assign(b.style, { left: x1 * 100 + "%", top: y1 * 100 + "%", width: (x2 - x1) * 100 + "%", height: (y2 - y1) * 100 + "%" });
      fig.appendChild(b);
      if (focus === i) fig.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}
