(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const groupLinks = Array.from(document.querySelectorAll("[data-origin]"));
  const groupNames = new Set(groupLinks.map((el) => el.dataset.origin));
  let database;
  let pending;
  let selected;
  let currentExample = 0;
  let currentImage = 0;
  let scores;
  const indexes=new Map();
  let indexPage=0;
  const perPage=10;
  const roleNames={package_photos:"包装图",product_photos:"商品图",certificate_pages:"证明页",
    tag_photos:"附签图",instruction_pages:"说明页",instruction_photos:"说明图",label_photos:"标签图"};
  function roles(row) {
    return (row.material_roles || []).map((role)=>roleNames[role] || role).join("、");
  }
  async function showIndex() {
    const set=selected;
    if (!set || !byId("unit-index").open || !set.index) return;
    const url=publicAsset(set.index);
    if(!url)return;
    byId("index-status").textContent="正在读取题号目录…";
    if (!indexes.has(set.id)) indexes.set(set.id,fetch(url).then(async(response)=>{
      if(!response.ok)throw Error("unavailable index");
      const rows=await response.json();
      if(!Array.isArray(rows))throw Error("invalid index");
      return rows;
    }));
    let entries;
    try{entries=await indexes.get(set.id);}
    catch{indexes.delete(set.id);if(selected===set)byId("index-status").textContent="题号目录读取失败，请收起后重试。";return;}
    if(selected!==set || !byId("unit-index").open)return;
    const query=byId("index-filter").value.trim().toLowerCase();
    const hits=entries.filter((r)=>!query || [r.number,r.rule_id,roles(r),...(r.material_roles||[])].join(" ").toLowerCase().includes(query));
    const pages=Math.max(1,Math.ceil(hits.length/perPage));
    indexPage=Math.min(indexPage,pages-1);
    byId("index-status").textContent="共 "+entries.length+" 个审核单元，匹配 "+hits.length+" 个。";
    byId("index-page").textContent=(indexPage+1)+" / "+pages;
    byId("index-prev").disabled=indexPage===0;byId("index-next").disabled=indexPage+1===pages;
    const tbody=byId("index-body");tbody.replaceChildren();
    hits.slice(indexPage*perPage,(indexPage+1)*perPage).forEach((r)=>{
      const tr=document.createElement("tr");
      for(const val of [r.number,r.rule_id,roles(r)||"未列明"]){
        const td=document.createElement("td");td.textContent=val;tr.append(td);
      }
      const td=document.createElement("td");
      if(Number.isInteger(r.case_index) && set.cases && set.cases[r.case_index]){
        const open=document.createElement("button");open.type="button";open.textContent="查看题目";
        open.setAttribute("aria-label","查看 "+r.number+" 的题目");
        open.addEventListener("click",()=>{selectExample(r.case_index);byId("unit-index").open=false;byId("example-title").scrollIntoView({block:"center"});});
        td.append(open);
      }else{td.textContent="仅目录";}
      tr.append(td);tbody.append(tr);
    });
  }
  function publicAsset(path) {
    if (typeof path !== "string" || !path || /^[a-z]+:|^[\\/]|[\\?#%]/i.test(path)) return null;
    const parts = path.split("/");
    if (parts.some((p) => !p || p === "." || p === "..")) return null;
    return "public-catalog/" + parts.map(encodeURIComponent).join("/");
  }
  function option(value, label) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
  }
  function catalogRoute(group, id = "") {
    return "#sets/" + group + (id ? "/" + encodeURIComponent(id) : "");
  }
  function selectedRoute() {
    const [page, group, rawId] = location.hash.slice(1).split("/");
    let id = "";
    if (rawId) { try { id = decodeURIComponent(rawId); } catch { id = ""; } }
    return {page, group: groupNames.has(group) || group === "scores" ? group : "project", id};
  }
  function drawScores() {
    const target=byId("scores-body"), source=byId("score-source").value;
    target.replaceChildren();
    const ratio=(correct,total) => Number.isInteger(correct) && Number.isInteger(total) && total > 0 ? correct+" / "+total : "—";
    scores.filter((row) => !source || row.source === source).forEach((row) => {
      const tr=document.createElement("tr"), th=document.createElement("th");
      const title=document.createElement("strong"), origin=document.createElement("span");
      th.scope="row";title.textContent=row.name;origin.textContent=[row.source,row.status].filter(Boolean).join(" · ");
      th.append(title,origin);
      if(row.note) {
        const more=document.createElement("details"), label=document.createElement("summary"), note=document.createElement("p");
        label.textContent="说明";note.textContent=row.note;more.append(label,note);th.append(more);
      }
      tr.append(th);
      [[row.correct,row.units],[row.group_correct,row.groups],[row.target_correct,row.targets]].forEach(([n,d]) => {
        const td=document.createElement("td");td.textContent=ratio(n,d);tr.append(td);
      });
      target.append(tr);
    });
  }
  async function loadScores() {
    byId("catalog-work").hidden=true;
    if (!scores) {
      byId("catalog-message").textContent="正在读取各集成绩…";
      try {
        const reply=await fetch("public-catalog/scores.json?v="+encodeURIComponent(byId("scores-section").dataset.revision));
        if (!reply.ok) throw Error("missing scores");
        const data=await reply.json();
        if (!Array.isArray(data.records)) throw Error("invalid scores");
        scores=data.records;
        byId("scores-time").textContent=data.as_of ? " 更新于 "+data.as_of+"。" : "";
        byId("score-source").replaceChildren(option("","全部来源"),
          ...Array.from(new Set(scores.map((r)=>r.source))).map((src)=>option(src,src)));
      } catch { if(selectedRoute().group==="scores")byId("catalog-message").textContent="成绩读取失败，请刷新页面重试。";return; }
    }
    if (selectedRoute().page!=="sets" || selectedRoute().group!=="scores")return;
    byId("catalog-message").textContent="";byId("scores-section").hidden=false;drawScores();
  }
  async function load() {
    if (selectedRoute().page !== "sets") return;
    const isScores=selectedRoute().group==="scores";
    byId("scores-section").hidden=true;
    if(isScores) {
      groupLinks.forEach((link)=>link.removeAttribute("aria-current"));
      byId("scores-link").setAttribute("aria-current","true");
      await loadScores();return;
    }
    byId("scores-link").removeAttribute("aria-current");
    if (!database) {
      byId("catalog-message").textContent = "正在读取题集目录…";
      if (!pending) pending = fetch("public-catalog/catalog.json").then((r) => {
        if (!r.ok) throw Error("catalog unavailable");
        return r.json();
      }).then((data) => {
        if (!Array.isArray(data.sets)) throw Error("invalid catalog");
        database = data.sets;
      });
      try { await pending; }
      catch { pending = null; byId("catalog-message").textContent = "目录读取失败，请刷新页面重试。"; return; }
    }
    const {page, group, id} = selectedRoute();
    if (page !== "sets" || group==="scores") return;
    const sets = database.filter((set) => set.group === group);
    groupLinks.forEach((link) => {
      if (link.dataset.origin === group) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    byId("catalog-work").hidden = !sets.length;
    byId("catalog-message").textContent = sets.length ? "" : "此分类暂无公开题集。";
    if (!sets.length) return;
    const chosen = sets.find((set) => set.id === id) || sets[0];
    if (chosen !== selected) { currentExample=0;currentImage=0;indexPage=0;byId("unit-index").open=false;byId("index-filter").value="";byId("index-body").replaceChildren(); }
    selected = chosen;
    byId("set-count").textContent = sets.length + " 套";
    byId("set-list").replaceChildren();
    byId("set-picker").replaceChildren();
    sets.forEach((set) => {
      const row = document.createElement("a");
      row.href = catalogRoute(group, set.id);
      row.className = "set-row";
      if (set === selected) row.setAttribute("aria-current","true");
      const title = document.createElement("strong"), count = document.createElement("span");
      title.textContent = set.title; count.textContent = set.units + " 个审核单元";
      row.append(title, count); byId("set-list").append(row);
      byId("set-picker").append(option(set.id, set.title));
    });
    byId("set-picker").value = selected.id;
    byId("collection-title").textContent = selected.title;
    const examples = selected.cases || [];
    byId("collection-count").textContent = "原题集 " + selected.units + " 个审核单元" + (examples.length ? "　/　网页可阅 " + examples.length + " 题" : "");
    byId("collection-scope").textContent = selected.description || "";
    const indexUrl=publicAsset(selected.index);
    byId("unit-index").hidden=!indexUrl;
    if(indexUrl)byId("index-file").href=indexUrl;else byId("index-file").removeAttribute("href");
    const dl = byId("collection-download"), path = publicAsset(selected.download);
    dl.hidden = !path;
    if (path) {
      dl.href=path;
      dl.textContent=selected.downloadLabel || (selected.full_inputs ? "下载全部输入" :
        (Number.isInteger(selected.download_units) ? "下载 "+selected.download_units+" 题节选" : "下载公开包"));
    }
    else dl.removeAttribute("href");
    byId("reader").hidden = !examples.length;
    if (!examples.length) return;
    byId("example-picker").replaceChildren(...examples.map((item, i) => option(i, (i+1) + ". " + item.title)));
    renderExample();
  }
  function renderExample() {
    const list = selected.cases, example = list[currentExample];
    byId("example-picker").value = String(currentExample);
    byId("prev-example").disabled = currentExample === 0;
    byId("next-example").disabled = currentExample === list.length - 1;
    byId("example-title").textContent = example.title;
    byId("example-text").textContent = example.description || "";
    byId("answer-view").open = false;
    byId("answer-view").hidden = !example.answer;
    byId("sample-answer").textContent = example.answer || "";
    const images = Array.isArray(example.images) ? example.images : (example.image ? [{path:example.image,alt:example.alt}] : []);
    const media = images.filter((entry) => publicAsset(entry.path));
    byId("catalog-figure").hidden = !media.length;
    const tabs = byId("sample-tabs"); tabs.replaceChildren(); tabs.hidden = media.length < 2;
    if (!media.length) { byId("sample-image").removeAttribute("src"); return; }
    if (currentImage >= media.length) currentImage = 0;
    const selectPicture = (n) => {
      currentImage = n;
      const obj = media[n], link = publicAsset(obj.path);
      byId("sample-full").href = link;
      byId("sample-full").setAttribute("aria-label", "查看第 " + (n+1) + " 份材料原图");
      byId("sample-image").src = link;
      byId("sample-image").alt = obj.alt || example.title + " · 材料 " + (n + 1);
      byId("sample-caption").textContent = (obj.alt || example.title) + " · 点击图片可查看原图";
      Array.from(tabs.children).forEach((tab, i) => tab.setAttribute("aria-pressed", String(i === n)));
    };
    media.forEach((entry, n) => {
      const tab = document.createElement("button");
      tab.type = "button";tab.textContent = entry.label || "材料 " + (n+1);
      tab.addEventListener("click", () => selectPicture(n));tabs.append(tab);
    }); selectPicture(currentImage);
  }
  function selectExample(index) { currentExample = index; currentImage = 0; renderExample(); }
  byId("set-picker").addEventListener("change", (e) => location.hash = catalogRoute(selected.group, e.target.value));
  byId("score-source").addEventListener("change", drawScores);
  byId("unit-index").addEventListener("toggle",showIndex);
  byId("index-filter").addEventListener("input",()=>{indexPage=0;showIndex();});
  byId("index-prev").addEventListener("click",()=>{indexPage-=1;showIndex();});
  byId("index-next").addEventListener("click",()=>{indexPage+=1;showIndex();});
  byId("example-picker").addEventListener("change", (e) => selectExample(Number(e.target.value)));
  byId("prev-example").addEventListener("click", () => selectExample(currentExample - 1));
  byId("next-example").addEventListener("click", () => selectExample(currentExample + 1));
  window.addEventListener("hashchange", load); load();
})();
