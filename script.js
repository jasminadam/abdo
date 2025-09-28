/**
 * Frontend logic for serverless capacity signup.
 * Backend: Google Apps Script web app (doGet/doPost).
 */

const $ = (sel) => document.querySelector(sel);
const form = $("#pref-form");
const choiceSelect = $("#choice");
const statusEl = $("#status");
const submitBtn = $("#submitBtn");
const ENDPOINT = (window.APP_CONFIG && window.APP_CONFIG.ENDPOINT) || "";

// Helper to show status messages
function showStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + cls;
}

// Load capacities & remaining from backend
// silent = true → حدّث القوائم بدون ما تغيّر رسالة الحالة
async function loadCapacities(silent = false) {
  if (!ENDPOINT) {
    if (!silent) {
      showStatus("⚠️ لم يتم ضبط رابط الخدمة الخلفية بعد. عدل الملف index.html وضع رابط الويب-آب.", "warn");
    }
    submitBtn.disabled = true;
    return;
  }
  try {
    if (!silent) showStatus("جارِ تحميل الرغبات المتاحة...");
    const res = await fetch(ENDPOINT, { method: "GET" });
    const data = await res.json();

    if (!data.ok) throw new Error(data.reason || "تعذر التحميل");

    // Populate select
    const current = choiceSelect.value;
    choiceSelect.innerHTML = '<option value="" disabled selected>اختر رغبتك</option>';
    data.choices.forEach((c) => {
      const remaining = Math.max(0, Number(c.capacity) - Number(c.taken));
      const opt = document.createElement("option");
      opt.value = c.choice;
      opt.disabled = remaining <= 0;
      opt.textContent = remaining > 0 ? `${c.choice} — متبقي ${remaining}` : `${c.choice} — مكتملة`;
      choiceSelect.appendChild(opt);
    });
    // لو المستخدم لسه مكمّل تسجيل آخر، ما نرجّعش الاختيار القديم
    if (!silent) choiceSelect.value = "";

    submitBtn.disabled = false;
    if (!silent) showStatus("✔️ جاهز للتسجيل", "ok");
  } catch (err) {
    console.error(err);
    if (!silent) showStatus("حدث خطأ أثناء تحميل البيانات. حاول التحديث.", "err");
    submitBtn.disabled = true;
  }
}

// Submit form
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ENDPOINT) return;

  const name = $("#name").value.trim();
  const seat = $("#seat").value.trim();
  const choice = $("#choice").value;

  if (!name || !seat || !choice) {
    showStatus("اكمل جميع الحقول.", "warn");
    return;
  }

  submitBtn.disabled = true;
  showStatus("جارٍ الإرسال...");

  try {
    // ✅ استخدم FormData بدون أي headers لتفادي preflight
    const fd = new FormData();
    fd.append("name", name);
    fd.append("seat", seat);
    fd.append("choice", choice);

    const res = await fetch(ENDPOINT, { method: "POST", body: fd });

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (data && data.ok) {
      // اظهر رسالة النجاح وثبّتها
      showStatus("🎉 تم تسجيل رغبتك بنجاح.", "ok");
      form.reset();
      // حدّث المتبقي بصمت من غير ما تغيّر الرسالة
      await loadCapacities(true);
    } else if (data) {
      if (data.code === "FULL") {
        showStatus("❌ الرغبة مكتملة. اختر رغبة أخرى.", "err");
        await loadCapacities(true);
      } else if (data.code === "DUPLICATE") {
        showStatus("⚠️ رقم الجلوس مسجل من قبل.", "warn");
      } else if (data.code === "BAD_INPUT") {
        showStatus("اكمل جميع الحقول بشكل صحيح.", "warn");
      } else {
        showStatus("حدث خطأ: " + (data.reason || "غير معروف"), "err");
      }
    } else {
      console.error("Non-JSON response:", raw);
      showStatus("تعذر الإرسال. تحقق من اتصالك أو رابط الخدمة.", "err");
    }
  } catch (err) {
    console.error(err);
    showStatus("تعذر الإرسال. تحقق من اتصالك أو رابط الخدمة.", "err");
  } finally {
    submitBtn.disabled = false;
  }
});

// Kickoff
loadCapacities();
