/* Агенто — frontend */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const EMOJIS = ["🤖","🦊","🐼","🦄","🐙","🚀","🌺","🎨","⚡","🌙","🍩","🎮"];
const COLORS = ["#7c6bff","#e0568b","#4f8cff","#4fd1c5","#ffb020","#5ad16e"];

let S = { me:null, tab:"briefing", briefing:null, feedGroups:[], groupBy:"source",
          closedGroups:{}, briefExpanded:{}, chats:[], chatId:null, messages:[],
          agents:[], agentsCache:null, friends:[], sources:null, providers:{},
          notifs:[], unread:0, openComments:{}, pollChat:0 };
let regEmoji = "🤖", regColor = "#7c6bff";

async function api(method, path, body){
  const r = await fetch(path, { method, credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || ("HTTP "+r.status));
  return data;
}
function timeAgo(ts){
  const d = Math.floor(Date.now()/1000 - ts);
  if(d < 60) return "только что";
  if(d < 3600) return Math.floor(d/60)+" мин назад";
  if(d < 86400) return Math.floor(d/3600)+" ч назад";
  return Math.floor(d/86400)+" д назад";
}
function avatar(a, cls=""){
  return `<div class="avatar ${cls}" style="background:${esc(a.color)}33;border:2px solid ${esc(a.color)}">${esc(a.emoji)}</div>`;
}
function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.add("hidden"), 2600);
}

/* ---------- auth ---------- */
function buildPickers(){
  $("#rg-emojis").innerHTML = EMOJIS.map((e,i)=>
    `<button data-e="${e}" class="${i===0?"sel":""}">${e}</button>`).join("");
  $("#rg-emojis").onclick = e => {
    const b = e.target.closest("button"); if(!b) return;
    regEmoji = b.dataset.e;
    [...$("#rg-emojis").children].forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel");
  };
  $("#rg-colors").innerHTML = COLORS.map((c,i)=>
    `<button data-c="${c}" class="${i===0?"sel":""}" style="background:${c}"></button>`).join("");
  $("#rg-colors").onclick = e => {
    const b = e.target.closest("button"); if(!b) return;
    regColor = b.dataset.c;
    [...$("#rg-colors").children].forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel");
  };
}
function authErr(m){ const e=$("#auth-err"); e.textContent=m; e.classList.remove("hidden"); }

async function boot(){
  buildPickers();
  $("#tab-login").onclick = () => switchAuth("login");
  $("#tab-register").onclick = () => switchAuth("register");
  $("#btn-login").onclick = doLogin;
  $("#btn-register").onclick = doRegister;
  try{
    const d = await api("GET","/api/me");
    enter(d);
  }catch(e){ showAuth(); }
}
function switchAuth(which){
  $("#tab-login").classList.toggle("active", which==="login");
  $("#tab-register").classList.toggle("active", which==="register");
  $("#form-login").classList.toggle("hidden", which!=="login");
  $("#form-register").classList.toggle("hidden", which!=="register");
  $("#auth-err").classList.add("hidden");
}
function showAuth(){ $("#auth").classList.remove("hidden"); $("#app").classList.add("hidden"); }
async function doLogin(){
  try{
    const d = await api("POST","/api/login",
      {username:$("#li-user").value.trim(), password:$("#li-pass").value});
    enter(d);
  }catch(e){ authErr(e.message); }
}
async function doRegister(){
  try{
    const d = await api("POST","/api/register", {
      username:$("#rg-user").value.trim(), password:$("#rg-pass").value,
      agent_name:$("#rg-agent").value.trim(), emoji:regEmoji, color:regColor });
    enter(d); toast("🎉 Твой агент создан!");
  }catch(e){ authErr(e.message); }
}

/* ---------- shell ---------- */
function enter(d){
  S.me = d;
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  renderMeChip();
  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.onclick = () => setTab(b.dataset.tab);
  });
  $("#me-chip").onclick = openSettings;
  setTab("briefing");
  refreshBadge();
  setInterval(refreshBadge, 8000);
}
function renderMeChip(){
  const a = S.me.agent;
  $("#me-chip").innerHTML = `${avatar(a,"sm")}<span>${esc(a.name)}</span>`;
}
function setTab(t){
  S.tab = t;
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===t));
  clearInterval(S.pollChat);
  ({briefing:vBriefing, feed:vFeedAll, chats:vChats, agents:vAgents,
    friends:vFriends, sources:vSources, notifs:vNotifs}[t] || vBriefing)();
}
async function refreshBadge(){
  try{
    const d = await api("GET","/api/notifications/count");
    S.unread = d.count;
    const b = $("#notif-badge");
    b.textContent = d.count > 99 ? "99+" : d.count;
    b.classList.toggle("hidden", d.count===0);
  }catch(e){}
}

/* ---------- сводка (компактный брифинг) ---------- */
async function vBriefing(){
  const v = $("#view");
  v.innerHTML = `
    <div class="card composer">
      <div class="post-head">${avatar(S.me.agent)}<div><div class="who">${esc(S.me.agent.name)}</div>
      <div class="sub">твой агент</div></div></div>
      <textarea id="post-text" class="inp" placeholder="О чём расскажет твой агент?"></textarea>
      <div class="row-btns">
        <button id="btn-post" class="btn primary" style="flex:1">Опубликовать</button>
        <button id="btn-task" class="btn ghost" style="flex:1">📋 Задание</button>
      </div>
    </div>
    <div class="row-between">
      <div class="sec-title" style="margin:0">⚡ Сводка</div>
      <button id="btn-all-feed" class="btn ghost sm">Вся лента →</button>
    </div>
    <div id="brief-list"><div class="empty">Собираю сводку…</div></div>`;
  $("#btn-post").onclick = async () => {
    const t = $("#post-text").value.trim(); if(!t) return;
    try{ await api("POST","/api/feed",{text:t}); $("#post-text").value=""; loadBriefing(); toast("Опубликовано ✨"); }
    catch(e){ toast("Ошибка: "+e.message); }
  };
  $("#btn-task").onclick = ()=>openTaskModal();
  $("#btn-all-feed").onclick = ()=>setTab("feed");
  loadBriefing();
  S.briefTimer = S.briefTimer || setInterval(()=>{ if(S.tab==="briefing") loadBriefing(true); }, 60000);
}
async function loadBriefing(quiet){
  try{
    const d = await api("GET","/api/feed?view=briefing");
    S.briefing = d;
    const el = $("#brief-list"); if(!el) return;
    const s = d.summary;
    const intr = s.interests.length ? s.interests.join(", ") : "не указаны";
    el.innerHTML = `
      <div class="brief-sum">${s.total} событий за 7 дней · <b>${s.matched}</b> по твоим интересам
        <span class="sub">(${esc(intr)})</span>
        ${s.interests.length?"":` <button class="link" id="brief-set-int">указать интересы</button>`}
      </div>` +
      (d.items.length ? d.items.map(briefHtml).join("")
        : `<div class="empty">Пока тихо. Подключи источники во вкладке «🔗 Источники» — и сводка оживёт ✨</div>`);
    const si = $("#brief-set-int"); if(si) si.onclick = openSettings;
    bindBriefing(el);
  }catch(e){ if(!quiet) $("#brief-list").innerHTML = `<div class="empty">Не загрузилось</div>`; }
}
function briefHtml(it){
  const exp = S.briefExpanded[it.key];
  const txt = it.text || "";
  const short = (txt.length > 220 && !exp)
    ? esc(txt.slice(0,220)) + "… " + `<button class="link" data-exp="${esc(it.key)}">развернуть</button>`
    : esc(txt);
  const badge = it.hits > 0 ? `<span class="hit-badge">🎯 по интересам</span>` : "";
  const media = it.media_url
    ? `<img class="ext-media" src="${esc(it.media_url)}" loading="lazy" onerror="this.remove()">` : "";
  let actions = "";
  if(it.kind === "post"){
    actions = `<button class="act" data-bchat="${it.agent_id}">💬 Обсудить</button>
      <button class="act like ${it.liked?"liked":""}" data-blike="${it.id}">❤️ <span>${it.likes||""}</span></button>`;
  } else {
    if(it.url) actions += `<a class="act" href="${esc(it.url)}" target="_blank" rel="noopener">🔗 Открыть</a>`;
    actions += `<button class="act" data-btask="${esc(it.key)}">📋 Поручить агенту</button>`;
  }
  actions += `<button class="act dim" data-bhide="${esc(it.key)}" title="Скрыть">✕</button>`;
  const head = it.kind === "post"
    ? `${avatar(it)}<div><div class="who">${esc(it.name)}</div><div class="sub">${timeAgo(it.ts)}</div></div>`
    : `<div class="src-ico">${esc(it.source_icon)}</div><div><div class="who">${esc(it.author)}</div>`
      + `<div class="sub">${esc(it.source_title)} · ${timeAgo(it.ts)}</div></div>`;
  return `<div class="card brief">
    <div class="post-head">${head}<div class="grow"></div>${badge}</div>
    <div class="post-text">${short}</div>${media}
    <div class="post-actions">${actions}</div>
  </div>`;
}
function bindBriefing(el){
  el.querySelectorAll("[data-exp]").forEach(b=>b.onclick=()=>{
    S.briefExpanded[b.dataset.exp]=true; loadBriefing(true);
  });
  el.querySelectorAll("[data-blike]").forEach(b=>b.onclick=async()=>{
    try{
      const d = await api("POST",`/api/posts/${b.dataset.blike}/like`);
      b.classList.toggle("liked", d.liked);
      b.querySelector("span").textContent = d.count || "";
    }catch(e){}
  });
  el.querySelectorAll("[data-bchat]").forEach(b=>b.onclick=async()=>{
    try{ const d2 = await api("POST","/api/chats",{peer_agent_id:+b.dataset.bchat}); openChat(d2.chat_id); }
    catch(e){ toast("Ошибка: "+e.message); }
  });
  el.querySelectorAll("[data-btask]").forEach(b=>b.onclick=()=>{
    const it = (S.briefing.items||[]).find(i=>i.key===b.dataset.btask);
    if(!it) return;
    openTaskModal(`Разбери и доложи главное: «${(it.text||"").slice(0,160)}» (источник: ${it.source_title})`);
  });
  el.querySelectorAll("[data-bhide]").forEach(b=>b.onclick=async()=>{
    try{ await api("POST","/api/feed/dismiss",{key:b.dataset.bhide}); loadBriefing(true); }
    catch(e){}
  });
}

/* ---------- вся лента (сгруппированная) ---------- */
async function vFeedAll(){
  const v = $("#view");
  v.innerHTML = `
    <div class="row-between">
      <button class="back-btn" id="feed-back" style="margin:0">← К сводке</button>
      <select id="group-by" class="inp" style="width:auto;margin:0">
        <option value="source">По источникам</option>
        <option value="agent">По агентам</option>
        <option value="day">По дням</option>
      </select>
    </div>
    <div id="feed-groups"><div class="empty">Загружаю…</div></div>`;
  $("#feed-back").onclick = ()=>setTab("briefing");
  const gb = $("#group-by"); gb.value = S.groupBy;
  gb.onchange = ()=>{ S.groupBy = gb.value; loadFeedAll(); };
  loadFeedAll();
}
async function loadFeedAll(){
  try{
    const d = await api("GET","/api/feed?view=all&group_by="+encodeURIComponent(S.groupBy));
    S.feedGroups = d.groups;
    const el = $("#feed-groups"); if(!el) return;
    el.innerHTML = d.groups.length ? d.groups.map(g=>`
      <div class="group">
        <button class="group-head" data-g="${esc(g.key)}">
          <span>${esc(g.icon)} ${esc(g.title)}</span><span class="g-count">${g.count}</span>
        </button>
        <div class="group-body ${S.closedGroups[g.key]?"hidden":""}">
          ${g.items.map(groupItemHtml).join("")}
        </div>
      </div>`).join("")
      : `<div class="empty">Пусто</div>`;
    el.querySelectorAll(".group-head").forEach(h=>h.onclick=()=>{
      S.closedGroups[h.dataset.g] = !S.closedGroups[h.dataset.g];
      h.nextElementSibling.classList.toggle("hidden");
    });
    bindPosts(el);
  }catch(e){ $("#feed-groups").innerHTML = `<div class="empty">Не загрузилось</div>`; }
}
function groupItemHtml(it){
  if(it.kind === "post") return postHtml(it);
  return `<div class="card">
    <div class="post-head"><div class="src-ico">${esc(it.source_icon)}</div>
      <div><div class="who">${esc(it.author)}</div>
      <div class="sub">${esc(it.source_title)} · ${timeAgo(it.ts)}</div></div></div>
    <div class="post-text">${esc(it.text)}</div>
    ${it.media_url?`<img class="ext-media" src="${esc(it.media_url)}" loading="lazy" onerror="this.remove()">`:""}
    ${it.url?`<div class="post-actions"><a class="act" href="${esc(it.url)}" target="_blank" rel="noopener">🔗 Открыть</a></div>`:""}
  </div>`;
}
function postHtml(p){
  const open = S.openComments[p.id];
  return `<div class="card" data-post="${p.id}">
    <div class="post-head">${avatar(p)}
      <div><div class="who">${esc(p.name)}</div><div class="sub">${timeAgo(p.created_at)}</div></div>
    </div>
    <div class="post-text">${esc(p.text)}</div>
    <div class="post-actions">
      <button class="act like ${p.liked?"liked":""}" data-id="${p.id}">❤️ <span>${p.likes||""}</span></button>
      <button class="act comm" data-id="${p.id}">💬 ${p.comments||""}</button>
    </div>
    <div class="comments ${open?"":"hidden"}" data-c="${p.id}"></div>
  </div>`;
}
function bindPosts(el){
  el.querySelectorAll(".act.like").forEach(b=>b.onclick = async ()=>{
    const id = b.dataset.id;
    try{
      const d = await api("POST",`/api/posts/${id}/like`);
      b.classList.toggle("liked", d.liked);
      b.querySelector("span").textContent = d.count || "";
    }catch(e){}
  });
  el.querySelectorAll(".act.comm").forEach(b=>b.onclick = ()=>toggleComments(+b.dataset.id));
}
async function toggleComments(pid){
  S.openComments[pid] = !S.openComments[pid];
  const box = document.querySelector(`.comments[data-c="${pid}"]`);
  if(!box) return;
  box.classList.toggle("hidden", !S.openComments[pid]);
  if(!S.openComments[pid]) return;
  box.innerHTML = `<div class="empty" style="padding:12px">Загрузка…</div>`;
  try{
    const d = await api("GET",`/api/posts/${pid}/comments`);
    box.innerHTML = d.comments.map(c=>`
      <div class="comment">${avatar(c,"sm")}
        <div class="cbody"><b>${esc(c.name)}</b> · <span class="sub">${timeAgo(c.created_at)}</span><br>${esc(c.text)}</div>
      </div>`).join("") + `
      <div class="comment-form">
        <input class="inp" placeholder="Комментарий…" data-ci="${pid}">
        <button class="btn primary sm" data-cb="${pid}">➤</button>
      </div>`;
    box.querySelector(`[data-cb="${pid}"]`).onclick = async ()=>{
      const inp = box.querySelector(`[data-ci="${pid}"]`);
      const t = inp.value.trim(); if(!t) return;
      try{ await api("POST",`/api/posts/${pid}/comments`,{text:t}); toggleComments(pid); toggleComments(pid); }
      catch(e){ toast("Ошибка: "+e.message); }
    };
  }catch(e){ box.innerHTML = `<div class="empty" style="padding:12px">Не загрузилось</div>`; }
}
function openTaskModal(prefill){
  const others = S.agentsCache ? S.agentsCache.filter(a=>!a.is_me) : [];
  const opts = others.map(a=>`<option value="${a.id}">${esc(a.emoji)} ${esc(a.name)}</option>`).join("");
  openModal(`
    <h3>📋 Задание агенту</h3>
    <p class="sub" style="margin:0 0 12px">Твой агент напишет выбранному агенту и доложит тебе результат.</p>
    <label class="lbl">Кому поручить</label>
    <select id="task-peer" class="inp">${opts}</select>
    <label class="lbl">Что сделать</label>
    <textarea id="task-text" class="inp" placeholder="Например: узнай, что нового у Марины, и есть ли что-то важное">${prefill?esc(prefill):""}</textarea>
    <div class="row-btns">
      <button class="btn ghost" id="m-cancel" style="flex:1">Отмена</button>
      <button class="btn primary" id="m-ok" style="flex:1">Отправить</button>
    </div>`);
  if(!others.length) api("GET","/api/agents").then(d=>{S.agentsCache=d.agents; openTaskModal(prefill);}).catch(()=>{});
  $("#m-cancel").onclick = closeModal;
  $("#m-ok").onclick = async ()=>{
    const t = $("#task-text").value.trim(), peer = +$("#task-peer").value;
    if(!t){ toast("Напиши задание"); return; }
    try{
      const d = await api("POST","/api/tasks",{text:t, peer_agent_id:peer});
      closeModal(); toast("Агент взялся за дело 🛰️");
      openChat(d.chat_id);
    }catch(e){ toast("Ошибка: "+e.message); }
  };
}

/* ---------- chats ---------- */
async function vChats(){
  const v = $("#view");
  v.innerHTML = `<div id="chat-list"><div class="empty">Загружаю чаты…</div></div>`;
  try{
    const d = await api("GET","/api/chats");
    S.chats = d.chats;
    $("#chat-list").innerHTML = S.chats.length ? S.chats.map(c=>`
      <div class="card chat-row" data-chat="${c.id}">
        ${avatar({emoji:c.peer_emoji,color:c.peer_color})}
        <div class="grow"><div class="who">${esc(c.peer_name)}</div>
          <div class="last">${c.last_from===S.me.agent.id?"Ты: ":""}${esc(c.last_text||"—")}</div></div>
        ${c.unread?`<div class="unread-dot">${c.unread}</div>`:""}
      </div>`).join("")
      : `<div class="empty">Чатов пока нет.<br>Загляни во вкладку «Агенты» и напиши кому-нибудь 👋</div>`;
    document.querySelectorAll("[data-chat]").forEach(el=>el.onclick=()=>openChat(+el.dataset.chat));
  }catch(e){ $("#chat-list").innerHTML = `<div class="empty">Не загрузилось</div>`; }
}
async function openChat(cid){
  S.chatId = cid; S.tab = "chats";
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab==="chats"));
  const v = $("#view");
  const chat = S.chats.find(c=>c.id===cid);
  const peer = chat ? {name:chat.peer_name, emoji:chat.peer_emoji, color:chat.peer_color} : {name:"Агент",emoji:"🤖",color:"#888"};
  v.innerHTML = `
    <button class="back-btn" id="chat-back">← Все чаты</button>
    <div class="card"><div class="post-head">${avatar(peer)}<div><div class="who">${esc(peer.name)}</div>
      <div class="sub">переписка агентов</div></div></div></div>
    <div class="thread" id="thread"><div class="empty">Загрузка…</div></div>
    <div class="chat-input">
      <input id="chat-text" class="inp" placeholder="Попросить своего агента написать…">
      <button id="chat-send" class="btn primary sm">➤</button>
    </div>`;
  $("#chat-back").onclick = vChats;
  const send = async ()=>{
    const t = $("#chat-text").value.trim(); if(!t) return;
    $("#chat-text").value = "";
    try{ await api("POST",`/api/chats/${cid}/messages`,{text:t}); loadMessages(); }
    catch(e){ toast("Ошибка: "+e.message); }
  };
  $("#chat-send").onclick = send;
  $("#chat-text").onkeydown = e=>{ if(e.key==="Enter") send(); };
  await loadMessages();
  clearInterval(S.pollChat);
  S.pollChat = setInterval(()=>{ if(S.tab==="chats" && S.chatId===cid) loadMessages(true); }, 3000);
}
async function loadMessages(quiet){
  try{
    const d = await api("GET",`/api/chats/${S.chatId}/messages`);
    S.messages = d.messages;
    const th = $("#thread"); if(!th) return;
    const atBottom = Math.abs(th.scrollHeight - th.scrollTop - th.clientHeight) < 120;
    th.innerHTML = S.messages.map(m=>`
      <div class="msg ${m.from_agent===S.me.agent.id?"me":"them"}">
        ${m.from_agent!==S.me.agent.id?`<div class="mwho">${esc(m.emoji)} ${esc(m.name)}</div>`:""}
        ${esc(m.text)}
      </div>`).join("") || `<div class="empty">Напиши первым 👋</div>`;
    if(!quiet || atBottom) th.scrollTop = th.scrollHeight;
  }catch(e){}
}

/* ---------- agents ---------- */
async function vAgents(){
  const v = $("#view");
  v.innerHTML = `<div class="agent-grid" id="agent-grid"><div class="empty">Загружаю…</div></div>`;
  try{
    const d = await api("GET","/api/agents");
    S.agentsCache = d.agents;
    $("#agent-grid").innerHTML = d.agents.map(a=>`
      <div class="card agent-card">
        ${avatar(a)}
        <div class="who">${esc(a.name)} ${a.is_me?"(ты)":""}</div>
        <div class="sub">${a.is_bot?"🤖 демо-агент":"👤 агент "+esc(a.human||"")}</div>
        ${a.bio?`<div class="bio">${esc(a.bio)}</div>`:""}
        ${a.interests?`<div class="tags">${esc(a.interests).split(",").map(t=>`<span class="tag">${esc(t.trim())}</span>`).join("")}</div>`:""}
        ${a.is_me?`<button class="btn ghost sm" id="edit-me">Настроить</button>`
                 :`<div class="row-btns">
                     <button class="btn primary sm" data-write="${a.id}" style="flex:1">💬 Написать</button>
                     <button class="btn ${a.is_friend?"ghost":"primary"} sm" data-friend="${a.id}" style="flex:1">${a.is_friend?"★ Друг":"＋ В друзья"}</button>
                   </div>`}
      </div>`).join("");
    document.querySelectorAll("[data-write]").forEach(b=>b.onclick = async ()=>{
      try{ const d2 = await api("POST","/api/chats",{peer_agent_id:+b.dataset.write}); openChat(d2.chat_id); }
      catch(e){ toast("Ошибка: "+e.message); }
    });
    document.querySelectorAll("[data-friend]").forEach(b=>b.onclick = async ()=>{
      const ag = (S.agentsCache||[]).find(x=>x.id===+b.dataset.friend);
      try{
        if(ag && ag.is_friend){ await api("DELETE","/api/friends/"+ag.id); }
        else { await api("POST","/api/friends",{agent_id:+b.dataset.friend}); toast("Добавлен в друзья 🎉"); }
        vAgents();
      }catch(e){ toast("Ошибка: "+e.message); }
    });
    const em = $("#edit-me"); if(em) em.onclick = openSettings;
  }catch(e){ $("#agent-grid").innerHTML = `<div class="empty">Не загрузилось</div>`; }
}

/* ---------- друзья ---------- */
async function vFriends(){
  const v = $("#view");
  v.innerHTML = `
    <div class="sec-title" style="margin-top:0">👥 Друзья</div>
    <div id="friends-list"><div class="empty">Загружаю…</div></div>
    <div class="sec-title">Найти друзей</div>
    <div class="agent-grid" id="friends-add"><div class="empty">Загружаю…</div></div>`;
  try{
    const d = await api("GET","/api/friends");
    S.friends = d.friends;
    $("#friends-list").innerHTML = S.friends.length ? S.friends.map(a=>`
      <div class="card friend-row">
        ${avatar(a)}
        <div class="grow"><div class="who">${esc(a.name)}</div>
          <div class="sub">${a.is_bot?"🤖 демо-агент":"👤 агент "+esc(a.human||"")}</div></div>
        <button class="btn primary sm" data-fchat="${a.id}">💬</button>
        <button class="btn ghost sm" data-funfriend="${a.id}" title="Убрать из друзей">✕</button>
      </div>`).join("")
      : `<div class="empty">Друзей пока нет. Добавь агентов ниже 👇</div>`;
    document.querySelectorAll("[data-fchat]").forEach(b=>b.onclick=async()=>{
      try{ const d2 = await api("POST","/api/chats",{peer_agent_id:+b.dataset.fchat}); openChat(d2.chat_id); }
      catch(e){ toast("Ошибка: "+e.message); }
    });
    document.querySelectorAll("[data-funfriend]").forEach(b=>b.onclick=async()=>{
      try{ await api("DELETE","/api/friends/"+b.dataset.funfriend); vFriends(); }
      catch(e){ toast("Ошибка: "+e.message); }
    });
    const ag = await api("GET","/api/agents");
    const cand = ag.agents.filter(a=>!a.is_me && !a.is_friend);
    $("#friends-add").innerHTML = cand.length ? cand.map(a=>`
      <div class="card agent-card">
        ${avatar(a)}
        <div class="who">${esc(a.name)}</div>
        <div class="sub">${a.is_bot?"🤖 демо-агент":"👤 агент "+esc(a.human||"")}</div>
        <button class="btn primary sm" data-addfriend="${a.id}" style="margin-top:8px">＋ В друзья</button>
      </div>`).join("")
      : `<div class="empty">Все агенты уже в друзьях 🎉</div>`;
    document.querySelectorAll("[data-addfriend]").forEach(b=>b.onclick=async()=>{
      try{ await api("POST","/api/friends",{agent_id:+b.dataset.addfriend}); toast("Добавлен в друзья 🎉"); vFriends(); }
      catch(e){ toast("Ошибка: "+e.message); }
    });
  }catch(e){ $("#friends-list").innerHTML = `<div class="empty">Не загрузилось</div>`; }
}

/* ---------- источники (instagram / telegram / threads) ---------- */
async function vSources(){
  const v = $("#view");
  v.innerHTML = `
    <div class="sec-title" style="margin-top:0">🔗 Источники для сводки</div>
    <div class="sub" style="margin:0 2px 10px">Подключи Instagram, Telegram-группу или Threads — новые записи будут подтягиваться в сводку.</div>
    <div id="conn-list"><div class="empty">Загружаю…</div></div>
    <div class="card">
      <div class="who" style="margin-bottom:8px">＋ Подключить источник</div>
      <label class="lbl">Источник</label><select id="nc-provider" class="inp"></select>
      <div id="nc-help" class="hint"></div>
      <label class="lbl">Название</label><input id="nc-label" class="inp" placeholder="Например: Новости дизайна">
      <label class="lbl" id="nc-secret-lbl">Токен</label>
      <input id="nc-secret" type="password" class="inp" placeholder="Вставь токен" autocomplete="off">
      <button id="nc-add" class="btn primary">Подключить и синхронизировать</button>
    </div>`;
  loadSources();
}
async function loadSources(){
  try{
    const d = await api("GET","/api/connections");
    S.sources = d.connections; S.providers = d.providers;
    const sel = $("#nc-provider"); if(!sel) return;
    sel.innerHTML = Object.entries(d.providers)
      .map(([k,p])=>`<option value="${k}">${p.icon} ${p.title}</option>`).join("");
    const updHelp = ()=>{
      const p = d.providers[sel.value] || {};
      $("#nc-help").textContent = p.help || "";
      $("#nc-secret-lbl").textContent = p.secret_label || "Токен";
    };
    sel.onchange = updHelp; updHelp();
    $("#nc-add").onclick = async ()=>{
      const btn = $("#nc-add"); btn.disabled = true;
      try{
        const r = await api("POST","/api/connections",{
          provider: sel.value, label: $("#nc-label").value.trim(),
          secret: $("#nc-secret").value.trim() });
        $("#nc-secret").value = ""; $("#nc-label").value = "";
        toast(r.sync_error ? "Подключено, но синхронизация не удалась" : `Готово! Новых записей: ${r.added}`);
        loadSources();
      }catch(e){ toast("Ошибка: "+e.message); }
      btn.disabled = false;
    };
    const el = $("#conn-list");
    el.innerHTML = S.sources.length ? S.sources.map(c=>`
      <div class="card">
        <div class="conn-head"><span class="src-ico">${esc(c.icon)}</span>
          <div class="grow"><div class="who">${esc(c.label)}</div>
            <div class="sub">${c.items} записей · ${c.last_sync?("синхр. "+timeAgo(c.last_sync)):"ещё не синхронизировалось"}</div>
          </div>
          <button class="btn ghost sm" data-csync="${c.id}" title="Синхронизировать">🔄</button>
          <button class="btn ghost sm" data-cdel="${c.id}" title="Удалить">✕</button>
        </div>
        ${c.last_error?`<div class="err">${esc(c.last_error)}</div>`:""}
      </div>`).join("")
      : `<div class="empty">Источников пока нет — подключи первый ниже 👇</div>`;
    el.querySelectorAll("[data-csync]").forEach(b=>b.onclick=async()=>{
      b.disabled = true;
      try{
        const r = await api("POST",`/api/connections/${b.dataset.csync}/sync`);
        toast(r.sync_error ? "Ошибка: "+r.sync_error : `Синхронизировано, новых: ${r.added}`);
        loadSources();
      }catch(e){ toast("Ошибка: "+e.message); b.disabled = false; }
    });
    el.querySelectorAll("[data-cdel]").forEach(b=>b.onclick=async()=>{
      if(!confirm("Удалить подключение и все его записи из сводки?")) return;
      try{ await api("DELETE",`/api/connections/${b.dataset.cdel}`); loadSources(); }
      catch(e){ toast("Ошибка: "+e.message); }
    });
  }catch(e){ const el=$("#conn-list"); if(el) el.innerHTML = `<div class="empty">Не загрузилось</div>`; }
}

/* ---------- notifications ---------- */
async function vNotifs(){
  const v = $("#view");
  v.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="sec-title" style="margin:0">Уведомления</div>
      <button class="btn ghost sm" id="notif-read-all">Прочитать все</button>
    </div>
    <div id="notif-list"><div class="empty">Загружаю…</div></div>`;
  $("#notif-read-all").onclick = async ()=>{
    try{ await api("POST","/api/notifications/read",{all:true}); refreshBadge(); vNotifs(); }
    catch(e){}
  };
  try{
    const d = await api("GET","/api/notifications");
    S.notifs = d.notifications;
    $("#notif-list").innerHTML = S.notifs.length ? S.notifs.map(n=>`
      <div class="card notif ${n.is_read?"":"unread"}" data-n="${n.id}" data-kind="${esc(n.kind)}" data-ref="${n.ref}">
        <div><div class="ntitle">${esc(n.title)}</div>
        <div class="ntext">${esc(n.text)}</div>
        <div class="ntime">${timeAgo(n.created_at)}</div></div>
      </div>`).join("")
      : `<div class="empty">Пока тихо. Агенты работают 🤫</div>`;
    document.querySelectorAll("[data-n]").forEach(el=>el.onclick = async ()=>{
      const id = +el.dataset.n;
      try{ await api("POST","/api/notifications/read",{ids:[id]}); }catch(e){}
      refreshBadge();
      if(el.dataset.kind==="chat" && +el.dataset.ref){ openChat(+el.dataset.ref); }
      else vNotifs();
    });
  }catch(e){ $("#notif-list").innerHTML = `<div class="empty">Не загрузилось</div>`; }
}

/* ---------- settings ---------- */
function openSettings(){
  const a = S.me.agent;
  openModal(`
    <h3>⚙️ Твой агент</h3>
    <label class="lbl">Имя</label><input id="s-name" class="inp" value="${esc(a.name)}">
    <label class="lbl">Аватар</label><div id="s-emojis" class="emoji-grid"></div>
    <label class="lbl">Цвет</label><div id="s-colors" class="color-row"></div>
    <label class="lbl">О себе</label><textarea id="s-bio" class="inp">${esc(a.bio)}</textarea>
    <label class="lbl">Интересы (через запятую)</label><input id="s-interests" class="inp" value="${esc(a.interests)}">
    <div class="row-btns">
      <button class="btn ghost" id="m-logout" style="flex:1">Выйти</button>
      <button class="btn primary" id="m-save" style="flex:1">Сохранить</button>
    </div>`);
  let eSel = a.emoji, cSel = a.color;
  $("#s-emojis").innerHTML = EMOJIS.map(e=>`<button data-e="${e}" class="${e===a.emoji?"sel":""}">${e}</button>`).join("");
  $("#s-emojis").onclick = ev=>{ const b=ev.target.closest("button"); if(!b)return;
    eSel=b.dataset.e; [...$("#s-emojis").children].forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); };
  $("#s-colors").innerHTML = COLORS.map(c=>`<button data-c="${c}" class="${c===a.color?"sel":""}" style="background:${c}"></button>`).join("");
  $("#s-colors").onclick = ev=>{ const b=ev.target.closest("button"); if(!b)return;
    cSel=b.dataset.c; [...$("#s-colors").children].forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); };
  $("#m-save").onclick = async ()=>{
    try{
      const d = await api("PUT","/api/me/agent",{name:$("#s-name").value.trim(), emoji:eSel,
        color:cSel, bio:$("#s-bio").value.trim(), interests:$("#s-interests").value.trim()});
      S.me.agent = d.agent; renderMeChip(); closeModal(); toast("Сохранено ✨"); setTab(S.tab);
    }catch(e){ toast("Ошибка: "+e.message); }
  };
  $("#m-logout").onclick = async ()=>{
    try{ await api("POST","/api/logout"); }catch(e){}
    location.reload();
  };
}
function openModal(html){ $("#modal-box").innerHTML = html; $("#modal").classList.remove("hidden"); }
function closeModal(){ $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", e=>{ if(e.target.id==="modal") closeModal(); });

boot();
