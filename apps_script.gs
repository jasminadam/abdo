/**
 * Google Apps Script backend for capacity-limited signup.
 * Sheets:
 *  - Config: columns [Choice, Capacity]
 *  - Submissions: columns [Timestamp, Name, Seat, Choice]
 */

const SHEET_ID = "CHANGE_ME_TO_YOUR_SHEET_ID";

function getSheets_(){
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const cfg = ss.getSheetByName("Config") || ss.insertSheet("Config");
  const sub = ss.getSheetByName("Submissions") || ss.insertSheet("Submissions");

  // Ensure headers
  if(cfg.getLastRow() === 0){
    cfg.getRange(1,1,1,2).setValues([["Choice","Capacity"]]);
  }
  if(sub.getLastRow() === 0){
    sub.getRange(1,1,1,4).setValues([["Timestamp","Name","Seat","Choice"]]);
  }
  return { ss, cfg, sub };
}

function _readConfig_(cfg){
  const rng = cfg.getDataRange().getValues();
  const rows = rng.slice(1).filter(r => r[0] !== "" && r[1] !== "");
  return rows.map(r => ({ choice: String(r[0]).trim(), capacity: Number(r[1]) || 0 }));
}

function _countTaken_(sub, choice){
  const lastRow = sub.getLastRow();
  if(lastRow < 2) return 0;
  const values = sub.getRange(2,1,lastRow-1,4).getValues();
  let c = 0;
  for(const row of values){
    if(String(row[3]).trim() === choice) c++;
  }
  return c;
}

function _seatExists_(sub, seat){
  const lastRow = sub.getLastRow();
  if(lastRow < 2) return false;
  const values = sub.getRange(2,1,lastRow-1,4).getValues();
  for(const row of values){
    if(String(row[2]).trim() === seat) return true;
  }
  return false;
}

function _corsHeaders_(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function doOptions(e){
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(_corsHeaders_());
}

function doGet(e){
  try{
    const { cfg, sub } = getSheets_();
    const config = _readConfig_(cfg).filter(c => c.choice.length > 0);
    const choices = config.map(c => ({
      choice: c.choice,
      capacity: c.capacity,
      taken: _countTaken_(sub, c.choice)
    }));
    const out = JSON.stringify({ ok:true, choices });
    return ContentService.createTextOutput(out)
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(_corsHeaders_());
  }catch(err){
    const out = JSON.stringify({ ok:false, reason:String(err) });
    return ContentService.createTextOutput(out)
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(_corsHeaders_());
  }
}

function doPost(e){
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const body = JSON.parse(e.postData.contents || "{}");
    const name = String(body.name || "").trim();
    const seat = String(body.seat || "").trim();
    const choice = String(body.choice || "").trim();

    if(!name || !seat || !choice){
      return _json_({ ok:false, code:"BAD_INPUT", reason:"missing fields" });
    }

    const { cfg, sub } = getSheets_();
    const config = _readConfig_(cfg);
    const target = config.find(c => c.choice === choice);
    if(!target){
      return _json_({ ok:false, code:"NO_SUCH_CHOICE", reason:"choice not found" });
    }

    if(_seatExists_(sub, seat)){
      return _json_({ ok:false, code:"DUPLICATE", reason:"seat already used" });
    }

    const taken = _countTaken_(sub, choice);
    if(taken >= Number(target.capacity)){
      return _json_({ ok:false, code:"FULL", reason:"choice capacity full" });
    }

    // Append row
    const ts = new Date();
    sub.appendRow([ts, name, seat, choice]);

    return _json_({ ok:true });
  }catch(err){
    return _json_({ ok:false, code:"ERROR", reason:String(err) });
  }finally{
    lock.releaseLock();
  }
}

function _json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(_corsHeaders_());
}