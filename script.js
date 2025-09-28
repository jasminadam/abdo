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
async function loadCapacities() {
  if (!ENDPOINT) {
    showStatus("⚠️ لم يتم ضبط رابط الخدمة الخلفية بعد. عدل الملف index.html وضع رابط الويب-آب.", "warn");
    submitBtn.disabled = true;
    return;
  }
  try {
    showStatus("جارِ تحميل الرغبات المتاحة...");
    const res = await fetch(ENDPOINT, { method: "GET" });
    const data = await res.json();

    if (!data.ok) throw new Error(data.reason || "تعذر التحميل");

    // Populate select
    choiceSelect.innerHTML = '<option value="" disabled selected>اختر رغبتك</option>';
    data.choices.forEach((c) => {
      const remaining = Math.max(0, Number(c.capacity) - Number(c.taken));
      const opt = document.createElement("option");
      opt.value = c.choice;
      opt.disabled = remaining <= 0;
      opt.textContent = remaining > 0 ? `${c.choice} — متبقي ${remaining}` : `${c.choice} — مكتملة`;
      choiceSelect.appendChild(opt);
    });

    submitBtn.disabled = false;
    showStatus("✔️ جاهز للتسجيل", "ok");
  } catch (err) {
    console.error(err);
    showStatus("حدث خطأ أثناء تحميل البيانات. حاول التحديث.", "err");
    submitBtn.disabled = true;
  }
}

// Submit form
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ENDPOINT) return;

  const payload = {
    name: $("#name").value.trim(),
    seat: $("#seat").value.trim(),
    choice: $("#choice").value,
  };

  if (!payload.name || !payload.seat || !payload.choice) {
    showStatus("اكمل جميع الحقول.", "warn");
    return;
  }

  submitBtn.disabled = true;
  showStatus("جارٍ الإرسال...");

  try {
    // ✅ send as x-www-form-urlencoded to avoid CORS preflight
    const body = new URLSearchParams(payload).toString();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });

    const data = await res.json();

    if (data.ok) {
      showStatus("🎉 تم تسجيل رغبتك بنجاح.", "ok");
      form.reset();
      await loadCapacities(); // refresh remaining
    } else {
      if (data.code === "FULL") {
        showStatus("❌ الرغبة مكتملة. اختر رغبة أخرى.", "err");
        await loadCapacities();
      } else if (data.code === "DUPLICATE") {
        showStatus("⚠️ رقم الجلوس مسجل من قبل.", "warn");
      } else if (data.code === "BAD_INPUT") {
        showStatus("اكمل جميع الحقول بشكل صحيح.", "warn");
      } else {
        showStatus("حدث خطأ: " + (data.reason || "غير معروف"), "err");
      }
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
