/**
 * Google Apps Script backend for capacity-limited signup + attendance.
 * Sheets:
 *  - Config: [Choice, Capacity]
 *  - Submissions: [Timestamp, Name, Seat, Choice]
 *  - Admins: [Username, Password]
 *  - Attendance: [TS, Date, Seat, Name, Choice, Admin]
 */

const SHEET_ID = "1TgwqE0aY2eBMbcIUS99y-JgrGju8WEMcKLjN9S93Omk";

function getSheets_(){
  const ss  = SpreadsheetApp.openById(SHEET_ID);
  const cfg = ss.getSheetByName("Config") || ss.insertSheet("Config");
  const sub = ss.getSheetByName("Submissions") || ss.insertSheet("Submissions");
  const adm = ss.getSheetByName("Admins") || ss.insertSheet("Admins");
  const att = ss.getSheetByName("Attendance") || ss.insertSheet("Attendance");

  if (cfg.getLastRow() === 0) cfg.getRange(1,1,1,2).setValues([["Choice","Capacity"]]);
  if (sub.getLastRow() === 0) sub.getRange(1,1,1,4).setValues([["Timestamp","Name","Seat","Choice"]]);
  if (adm.getLastRow() === 0) adm.getRange(1,1,1,2).setValues([["Username","Password"]]);
  if (att.getLastRow() === 0) att.getRange(1,1,1,6).setValues([["TS","Date","Seat","Name","Choice","Admin"]]);

  return { ss, cfg, sub, adm, att };
}

function _readConfig_(cfg){
  const rng  = cfg.getDataRange().getValues();
  const rows = rng.slice(1).filter(r => r[0] !== "" && r[1] !== "");
  return rows.map(r => ({ choice: String(r[0]).trim(), capacity: Number(r[1]) || 0 }));
}

function _countTaken_(sub, choice){
  const lastRow = sub.getLastRow();
  if (lastRow < 2) return 0;
  const values = sub.getRange(2,1,lastRow-1,4).getValues();
  let c = 0;
  for (const row of values) if (String(row[3]).trim() === choice) c++;
  return c;
}

function _seatExists_(sub, seat){
  const lastRow = sub.getLastRow();
  if (lastRow < 2) return false;
  const values = sub.getRange(2,1,lastRow-1,4).getValues();
  for (const row of values) if (String(row[2]).trim() === seat) return true;
  return false;
}

function _findBySeat_(sub, seat){
  const lastRow = sub.getLastRow();
  if (lastRow < 2) return null;
  const values = sub.getRange(2,1,lastRow-1,4).getValues();
  for (const row of values){
    if (String(row[2]).trim() === seat) {
      return { name:String(row[1]).trim(), seat:String(row[2]).trim(), choice:String(row[3]).trim() };
    }
  }
  return null;
}

function _isAdmin_(adm, user, pass){
  const lastRow = adm.getLastRow();
  if (lastRow < 2) return false;
  const values = adm.getRange(2,1,lastRow-1,2).getValues();
  for (const row of values){
    if (String(row[0]).trim() === user && String(row[1]).trim() === pass) return true;
  }
  return false;
}

// OPTIONS preflight
function doOptions(e){ return ContentService.createTextOutput(""); }

function doGet(e){
  try{
    const { cfg, sub } = getSheets_();
    const action = (e && e.parameter && e.parameter.action) || "choices";

    if (action === "choices"){
      const config  = _readConfig_(cfg).filter(c => c.choice.length > 0);
      const choices = config.map(c => ({ choice:c.choice, capacity:c.capacity, taken:_countTaken_(sub, c.choice) }));
      return _json_({ ok:true, choices });
    }

    if (action === "submissions"){
      // robust: جرّب getLastRow ثم fallback إلى getDataRange
      let values = [];
      const lastRow = sub.getLastRow();
      if (lastRow >= 2){
        values = sub.getRange(2,1,lastRow-1,4).getValues();
      } else {
        const rng = sub.getDataRange().getValues();
        values = rng.length > 1 ? rng.slice(1) : [];
      }
      // شيل الصفوف الفارغة فقط
      const rows = values.filter(r =>
        String(r[1]).trim() !== "" || String(r[2]).trim() !== "" || String(r[3]).trim() !== ""
      );
      const submissions = rows.map(r=>({
        ts: r[0],
        name: String(r[1]).trim(),
        seat: String(r[2]).trim(),
        choice: String(r[3]).trim()
      }));
      return _json_({ ok:true, submissions });
    }

    // التحقق الحقيقي للأدمن يتم في doPost(mode=login)
    if (action === "login"){
      return _json_({ ok:false, reason:"use POST mode=login" });
    }

    return _json_({ ok:false, reason:"Unknown action" });
  }catch(err){
    return _json_({ ok:false, reason:String(err) });
  }
}

function doPost(e){
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const { cfg, sub, adm, att } = getSheets_();

    const mode = (e && e.parameter && e.parameter.mode) || (
      e && e.postData && e.postData.type && String(e.postData.type).indexOf("application/json") !== -1 ? "signup" : "signup"
    );

    if (mode === "login"){
      const user = String((e.parameter && e.parameter.user) || "").trim();
      const pass = String((e.parameter && e.parameter.pass) || "").trim();
      const ok = _isAdmin_(adm, user, pass);
      return _json_({ ok });
    }

    if (mode === "attendance"){
      const user  = String((e.parameter && e.parameter.user) || "");
      const pass  = String((e.parameter && e.parameter.pass) || "");
      const date  = String((e.parameter && e.parameter.date) || "");
      const seats = String((e.parameter && e.parameter.seats) || "");
      if (!user || !pass || !date || !seats) return _json_({ ok:false, reason:"missing params" });
      if (!_isAdmin_(adm, user, pass)) return _json_({ ok:false, reason:"auth failed" });

      const list = seats.split(",").map(s=>s.trim()).filter(Boolean);
      const tsNow = new Date();
      const rows = [];
      for (const seat of list){
        const rec = _findBySeat_(sub, seat);
        if (rec){
          rows.push([tsNow, date, rec.seat, rec.name, rec.choice, user]);
        }
      }
      if (rows.length>0){
        att.getRange(att.getLastRow()+1, 1, rows.length, 6).setValues(rows);
      }
      return _json_({ ok:true, saved:rows.length });
    }

    // default: signup
    let name="", seat="", choice="";
    const isJSON = !!(e && e.postData && e.postData.type &&
                      String(e.postData.type).indexOf("application/json") !== -1);
    if (isJSON) {
      const body = JSON.parse((e.postData && e.postData.contents) || "{}");
      name   = String(body.name  || "").trim();
      seat   = String(body.seat  || "").trim();
      choice = String(body.choice|| "").trim();
    } else {
      name   = String((e.parameter && e.parameter.name)   || "").trim();
      seat   = String((e.parameter && e.parameter.seat)   || "").trim();
      choice = String((e.parameter && e.parameter.choice) || "").trim();
    }

    if (!name || !seat || !choice) return _json_({ ok:false, code:"BAD_INPUT", reason:"missing fields" });

    const config = _readConfig_(cfg);
    const target = config.find(c => c.choice === choice);
    if (!target) return _json_({ ok:false, code:"NO_SUCH_CHOICE", reason:"choice not found" });

    if (_seatExists_(sub, seat)) return _json_({ ok:false, code:"DUPLICATE", reason:"seat already used" });

    const taken = _countTaken_(sub, choice);
    if (taken >= Number(target.capacity)) return _json_({ ok:false, code:"FULL", reason:"choice capacity full" });

    sub.appendRow([new Date(), name, seat, choice]);
    return _json_({ ok:true });
  }catch(err){
    return _json_({ ok:false, code:"ERROR", reason:String(err) });
  }finally{
    lock.releaseLock();
  }
}

function _json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
