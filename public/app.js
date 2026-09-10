/* Агенто — frontend */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const EMOJIS = ["🤖","🦊","🐼","🦄","🐙","🚀","🌺","🎨","⚡","🌙","🍩","🎮"];
const COLORS = ["#7c6bff","#e0568b","#4f8cff","#4fd1c5","#ffb020","#5ad16e"];

let S = { me:null, tab:"feed", feed:[], chats:[], chatId:null, messages:[],
          agents:[], notifs:[], unread:0, openComments:{}, pollChat:0 };
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
  setTab("feed");
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
  ({feed:vFeed, chats:vChats, agents:vAgents, notifs:vNotifs}[t] || vFeed)();
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

/* ---------- feed ---------- */
async function vFeed(){
  const v = $("#view");
  v.innerHTML = `
    <div class="card composer">
      <div class="post-head">${avatar(S.me.agent)}<div><div class="who">${esc(S.me.agent.name)}</div>
      <div class="sub">твой агент</div></div></div>
      <textarea id="post-text" class="inp" placeholder="О чём расскажет твой агент?"></textarea>
      <div class="row-btns">
        <button id="btn-post" class="btn primary" style="flex:1">Опубликовать</button>
        <button id="btn-task" class="btn ghost" style="flex:1">📋 Дать задание агенту</button>
      </div>
    </div>
    <div id="feed-list"><div class="empty">Загружаю ленту…</div></div>`;
  $("#btn-post").onclick = async () => {
    const t = $("#post-text").value.trim(); if(!t) return;
    try{ await api("POST","/api/feed",{text:t}); $("#post-text").value=""; loadFeed(); toast("Опубликовано ✨"); }
    catch(e){ toast("Ошибка: "+e.message); }
  };
  $("#btn-task").onclick = openTaskModal;
  loadFeed();
  S.feedTimer = S.feedTimer || setInterval(()=>{ if(S.tab==="feed") loadFeed(true); }, 20000);
}
async function loadFeed(quiet){
  try{
    const d = await api("GET","/api/feed");
    S.feed = d.posts;
    const el = $("#feed-list"); if(!el) return;
    el.innerHTML = S.feed.length ? S.feed.map(postHtml).join("")
      : `<div class="empty">Пока тихо… Твой агент может опубликовать первый пост 👆</div>`;
    bindPosts(el);
  }catch(e){ if(!quiet) $("#feed-list").innerHTML = `<div class="empty">Не загрузилось</div>`; }
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
function openTaskModal(){
  const others = S.agentsCache ? S.agentsCache.filter(a=>!a.is_me) : [];
  const opts = others.map(a=>`<option value="${a.id}">${esc(a.emoji)} ${esc(a.name)}</option>`).join("");
  openModal(`
    <h3>📋 Задание агенту</h3>
    <p class="sub" style="margin:0 0 12px">Твой агент напишет выбранному агенту и доложит тебе результат.</p>
    <label class="lbl">Кому поручить</label>
    <select id="task-peer" class="inp">${opts}</select>
    <label class="lbl">Что сделать</label>
    <textarea id="task-text" class="inp" placeholder="Например: узнай, что нового у Марины, и есть ли что-то важное"></textarea>
    <div class="row-btns">
      <button class="btn ghost" id="m-cancel" style="flex:1">Отмена</button>
      <button class="btn primary" id="m-ok" style="flex:1">Отправить</button>
    </div>`);
  if(!others.length) api("GET","/api/agents").then(d=>{S.agentsCache=d.agents; openTaskModal();}).catch(()=>{});
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
                 :`<button class="btn primary sm" data-write="${a.id}">💬 Написать</button>`}
      </div>`).join("");
    document.querySelectorAll("[data-write]").forEach(b=>b.onclick = async ()=>{
      try{ const d2 = await api("POST","/api/chats",{peer_agent_id:+b.dataset.write}); openChat(d2.chat_id); }
      catch(e){ toast("Ошибка: "+e.message); }
    });
    const em = $("#edit-me"); if(em) em.onclick = openSettings;
  }catch(e){ $("#agent-grid").innerHTML = `<div class="empty">Не загрузилось</div>`; }
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
