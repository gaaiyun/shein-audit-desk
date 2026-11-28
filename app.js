"use strict";
const archive=[
 {id:"F/017",slug:"caliper",title:"刻度尺",subject:"品项代码",status:"pass",reason:"包装核对联与库存联的品项代码均为 ARC-17。",evidence:[["包装核对联","包装上的品项代码为 ARC-17。"],["库存联","库存联记载同一品项代码 ARC-17。"]]},
 {id:"F/026",slug:"swatch",title:"纸样册",subject:"入袋张数",status:"reject",reason:"收件核对联写明 8 张，装袋清单记录 6 张。",evidence:[["收件核对联","入袋张数印为 08 SHEETS。"],["装袋清单","清单印为 06 SHEETS，与收件核对联相差 2 张。"]]},
 {id:"F/039",slug:"reel",title:"线轴盘",subject:"表面处理",status:"ambiguous",reason:"领料联记载了表面处理方式，包装签上的对应字样被遮挡。",evidence:[["领料核对联","表面处理字段可以读出 SATIN。"],["包装签","覆盖条挡住字样，现有材料无法确认两份记录是否一致。"]]}
];
const states={pass:"符合",reject:"不符合",ambiguous:"待确认"};
const $=id=>document.getElementById(id);
let active=archive[0],sheet=0,boxes=true;
function button(text,handler){const el=document.createElement("button");el.type="button";el.textContent=text;el.addEventListener("click",handler);return el;}
function draw(){
 const filtered=archive.filter(item=>$("filter").value==="all"||item.status===$("filter").value);
 if(!filtered.includes(active)){active=filtered[0];sheet=0;}
 $("case-count").textContent=filtered.length+" 份";
 const list=$("case-list");list.replaceChildren();
 filtered.forEach(item=>{
  const el=button("",()=>{active=item;sheet=0;draw();if(matchMedia("(max-width:700px)").matches)$("detail").scrollIntoView({block:"start"});});
  el.className="case";el.setAttribute("aria-pressed",String(item===active));el.setAttribute("aria-label",item.title+"，"+states[item.status]+"，查看案例");
  [["span","id",item.id],["strong","",item.title],["span","brief-status",states[item.status]]].forEach(([tag,cls,val])=>{const t=document.createElement(tag);t.className=cls;t.textContent=val;el.append(t);});list.append(el);
 });
 $("case-id").textContent=active.id;$("case-title").textContent=active.title+" · "+active.subject;$("case-status").textContent=states[active.status];$("reason").textContent=active.reason;
 drawMaterial();
}
function drawMaterial(){
 const bar=$("materials");bar.replaceChildren();
 active.evidence.forEach(([title],index)=>{const el=button(title,()=>{sheet=index;drawMaterial();bar.children[index].focus({preventScroll:true});});el.setAttribute("aria-pressed",String(index===sheet));bar.append(el);});
 const [title,detail]=active.evidence[sheet];
 $("preview").src="samples/"+active.slug+"-"+(sheet+1)+".webp";$("preview").alt=active.title+"的"+title+"，"+detail;
 const roi=$("roi");roi.style.left=(sheet===0?16.2:14.7)+"%";roi.style.top="37.6%";roi.style.width=(active.slug==="swatch"?29:23)+"%";roi.style.height="12.4%";roi.hidden=!boxes;
 $("box-toggle").setAttribute("aria-pressed",String(boxes));$("evidence-title").textContent="图中证据";$("evidence-text").textContent=detail;
}
function showPage(){
 const page=["cases","results","local"].includes(location.hash.slice(1))?location.hash.slice(1):"cases";
 document.querySelectorAll("[data-view]").forEach(e=>e.hidden=e.dataset.view!==page);
 document.querySelectorAll("[data-page]").forEach(e=>{if(e.dataset.page===page)e.setAttribute("aria-current","page");else e.removeAttribute("aria-current");});
}
$("filter").addEventListener("change",()=>{sheet=0;draw();});
$("box-toggle").addEventListener("click",()=>{boxes=!boxes;drawMaterial();});
window.addEventListener("hashchange",showPage);showPage();draw();
