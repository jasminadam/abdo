/**
 * Frontend logic for serverless capacity signup + admin.
 */

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const form        = $("#pref-form");
const choiceSelect= $("#choice");
const statusEl    = $("#status");
const submitBtn   = $("#submitBtn");
const statsEl     = $("#stats");
const ENDPOINT    = (window.APP_CONFIG && window.APP_CONFIG.ENDPOINT) || "";

const adminOpen   = $("#adminOpen");
const dlg         = $("#adminDialog");
const adminLoginForm = $("#adminLoginForm");
const adminPanel  = $("#adminPanel");
const adminLoginBtn = $("#adminLoginBtn");
const adminLoginMsg = $("#adminLoginMsg");
const adminMsg    = $("#adminMsg");
const searchInput = $("#searchInput");
const attDate     = $("#attDate");
const refreshSubs = $("#refreshSubs");
const subsTable   = $("#subsTable");
const saveAttendance = $("#saveAttendance");

let adminCreds = null;
let allSubs = [];

// Toast
function toast(msg, type="ok"){
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="icon">${type==="ok"?"✅":"⚠️"}</span><span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 2800);
}

// Inline status
function showStatus(msg, cls = ""){
  statusEl.textContent = msg;
  statusEl.className = "status " + cls;
}

// Validators
const arabicNameRE = /^[\u0600-\u06FF\s]+$/;
const seatRE       = /^[0-9]{1,10}$/;

// Load choices & stats
async function loadCapacities(silent = false){
  if(!ENDPOINT){
    if(!silent) showStatus("⚠️ لم يتم ضبط رابط الخدمة الخلفية بعد. عدل ENDPOINT.", "warn");
    submitBtn.disabled = true; return;
  }
  try{
    if(!silent) showStatus("جارِ تحميل الرغبات المتاحة...");
    const res = await fetch(ENDPOINT + "?action=choices", { method: "GET" });
    const data = await res.json();
    if(!data.ok) throw new Error(data.reason || "تعذر التحميل");

    choiceSelect.innerHTML = '<option value="" disabled selected>اختر رغبتك</option>';
    data.choices.forEach(c=>{
      const remaining = Math.max(0, Number(c.capacity)-Number(c.taken));
      const opt = document.createElement("option");
      opt.value = c.choice;
      opt.disabled = remaining<=0;
      opt.textContent = remaining>0 ? `${c.choice} — متبقي ${remaining}` : `${c.choice} — مكتملة`;
      choiceSelect.appendChild(opt);
    });

    renderStats(data.choices);
    submitBtn.disabled = false;
    if(!silent) showStatus("✔️ جاهز للتسجيل", "ok");
  }catch(err){
    console.error(err);
    if(!silent) showStatus("حدث خطأ أثناء تحميل البيانات. حاول التحديث.", "err");
    submitBtn.disabled = true;
  }
}

function renderStats(choices){
  const total = choices.reduce((s,c)=> s + Number(c.taken||0), 0);
  const blocks = [
    `<div class="stat"><div class="label">إجمالي المسجلين</div><div class="value">${total}</div></div>`
  ];
  choices.forEach(c=>{
    const remaining = Math.max(0, Number(c.capacity)-Number(c.taken));
    blocks.push(
      `<div class="stat">
        <div class="label">${c.choice}</div>
        <div class="value">${remaining} <span class="label">متبقي</span></div>
      </div>`
    );
  });
  statsEl.innerHTML = blocks.join("");
}

// Submit
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(!ENDPOINT) return;

  const name  = $("#name").value.trim();
  const seat  = $("#seat").value.trim();
  const choice= $("#choice").value;

  if(!arabicNameRE.test(name)){ toast("⚠️ الاسم بالعربية فقط.", "err"); showStatus("الاسم بالعربية فقط.", "warn"); return; }
  if(!seatRE.test(seat)){ toast("⚠️ رقم الجلوس أرقام إنجليزية فقط.", "err"); showStatus("رقم الجلوس أرقام إنجليزية فقط.", "warn"); return; }
  if(!choice){ toast("اختر الرغبة.", "err"); return; }

  submitBtn.disabled = true;
  showStatus("جارٍ الإرسال...");

  try{
    const fd = new FormData();
    fd.append("mode","signup");
    fd.append("name",name);
    fd.append("seat",seat);
    fd.append("choice",choice);

    const res = await fetch(ENDPOINT, { method:"POST", body:fd });
    const raw = await res.text();
    let data; try{ data = JSON.parse(raw); }catch{ data=null; }

    if(data && data.ok){
      toast("تم التسجيل بنجاح ✅","ok");
      showStatus("🎉 تم تسجيل رغبتك بنجاح.", "ok");
      form.reset();
      await loadCapacities(true);
    }else if(data){
      if(data.code==="FULL"){ toast("الرغبة مكتملة.","err"); await loadCapacities(true); }
      else if(data.code==="DUPLICATE"){ toast("رقم الجلوس مسجل من قبل.","err"); }
      else if(data.code==="BAD_INPUT"){ toast("اكمل جميع الحقول بشكل صحيح.","err"); }
      else { toast("حدث خطأ: "+(data.reason||"غير معروف"),"err"); }
    }else{
      console.error("Non-JSON:", raw);
      toast("تعذر الإرسال. تأكد من الرابط.","err");
    }
  }catch(err){
    console.error(err);
    toast("خطأ بالشبكة.","err");
  }finally{
    submitBtn.disabled = false;
  }
});

// Admin dialog
adminOpen.addEventListener("click", ()=> { dlg.showModal(); });

// Login via POST
adminLoginBtn.addEventListener("click", async (ev)=>{
  ev.preventDefault();
  const user = $("#adminUser").value.trim();
  const pass = $("#adminPass").value.trim();
  adminLoginMsg.textContent = "جار التحقق...";
  try{
    const fd = new FormData();
    fd.append("mode","login");
    fd.append("user", user);
    fd.append("pass", pass);
    const res = await fetch(ENDPOINT, { method:"POST", body:fd });
    const data = await res.json();

    if(data && data.ok){
      adminCreds = { user, pass };
      adminLoginForm.hidden = true;
      adminPanel.hidden = false;
      adminLoginMsg.textContent = "";
      if(!attDate.value){
        const today = new Date();
        attDate.value = today.toISOString().slice(0,10);
      }
      await loadSubmissions();
    }else{
      adminLoginMsg.textContent = "بيانات الدخول غير صحيحة.";
      adminLoginMsg.className = "status err";
    }
  }catch(e){
    adminLoginMsg.textContent = "تعذر التحقق.";
    adminLoginMsg.className = "status err";
  }
});

refreshSubs.addEventListener("click", ()=> loadSubmissions());

searchInput.addEventListener("input", ()=>{
  renderSubsTable(filterSubs(allSubs, searchInput.value));
});

function filterSubs(list, q)
