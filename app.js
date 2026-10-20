"use strict";

const SENSOR_DEFS = [
  { key: "p90da", token: "PEDALE_90_D_AMONT", label: "P90 ขวา ต้นทาง", ref: "IdPeriph 67" },
  { key: "p90ga", token: "PEDALE_90_G_AMONT", label: "P90 ซ้าย ต้นทาง", ref: "IdPeriph 65" },
  { key: "p90dv", token: "PEDALE_90_D_AVAL", label: "P90 ขวา ปลายทาง", ref: "IdPeriph 68" },
  { key: "p90gv", token: "PEDALE_90_G_AVAL", label: "P90 ซ้าย ปลายทาง", ref: "IdPeriph 66" },
  { key: "p45a", token: "PEDALE_45_AMONT", label: "P45 ต้นทาง", ref: "IdPeriph 69" },
  { key: "p45v", token: "PEDALE_45_AVAL", label: "P45 ปลายทาง", ref: "IdPeriph 70" }
];

const PLAZAS = { M081P01: "บางใหญ่", M081P02: "นครชัยศรี", M081P03: "ศีรษะทอง", M081P04: "นครปฐมฝั่งตะวันออก", M081P05: "นครปฐมฝั่งตะวันตก", M081P06: "ท่ามะกา", M081P07: "ท่าม่วง", M081P08: "กาญจนบุรี" };

const BUTTON_LABELS = {
  C_TOUCHE_CLASSE_1: "เลือก Class 1", C_TOUCHE_CLASSE_2: "เลือก Class 2", C_TOUCHE_CLASSE_3: "เลือก Class 3", C_TOUCHE_CLASSE_4: "เลือก Class 4",
  C_TOUCHE_ESPECES: "ชำระเงินสด", C_TOUCHE_RECU: "พิมพ์ใบเสร็จ", C_TOUCHE_VALIDER: "ยืนยัน (Valider)", C_TOUCHE_ANNUL: "ยกเลิก (Cancel)",
  C_TOUCHE_DP: "เลือกด่านต้นทาง", C_TOUCHE_INPUT_PLATE: "คีย์ป้ายทะเบียน", C_TOUCHE_NO_PLATE: "รถไม่มีป้ายทะเบียน", C_TOUCHE_TOWING: "รถลากจูง",
  C_TOUCHE_EXEMPT: "ยกเว้น (Exempt)", C_TOUCHE_FP: "สั่งสัญญาณไฟ", C_TOUCHE_FLECHE_VERTE: "เปิดไฟเขียว", C_TOUCHE_CROIX_ROUGE: "เปิดกากบาทแดง",
  C_TOUCHE_EMERGENCY: "ฉุกเฉิน (Emergency)", C_TOUCHE_ALA: "เปิดจอ Alarm", C_TOUCHE_SIMU_PASS: "จำลอง Passage", C_TOUCHE_SIMU_PRES: "จำลอง Presence",
  C_TOUCHE_PRISE_SERVICE: "เปิดกะ (BOJ)", C_TOUCHE_FIN_SERVICE: "ปิดกะ (EOJ)", C_TOUCHE_OUVERTURE: "เปิดเลน", C_TOUCHE_FERMETURE: "ปิดเลน"
};

const state = { file: null, lines: [], transactions: [], selectedIndex: -1, activeTab: "diagnosis" };

const el = Object.fromEntries([
  "fileInput", "fileMeta", "exportButton", "dropTarget", "dropOverlay", "emptyState", "analysisView",
  "trxCount", "criticalCount", "warningCount", "apiStatus", "timeRange", "transactionSearch",
  "severityFilter", "transactionList", "diagnosisTab", "timelineTab", "flowTab", "simulatorTab", "rawTab", "searchTab",
  "globalSearch", "searchButton", "searchSummary", "searchResults", "playSimBtn"
].map(id => [id, document.getElementById(id)]));

// --------- ฟังก์ชันกระโดดไปบรรทัด LOG ดิบ (Click to Jump) ---------
window.jumpToLine = function(lineNumber) {
  switchTab("raw"); 
  setTimeout(() => {
    const target = document.querySelector(`.log-line[data-line="${lineNumber}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.backgroundColor = '#ffeb3b';
      target.style.color = '#000';
      target.style.fontWeight = 'bold';
      target.style.transition = 'all 0.5s';
      
      setTimeout(() => {
        target.style.backgroundColor = '';
        target.style.color = '';
        target.style.fontWeight = '';
      }, 2500);
    }
  }, 100);
};

function toggleSim(id, action, cls = 'active') { const e = document.getElementById(id); if (e) e.classList[action](cls); }
function setSimText(id, txt) { const e = document.getElementById(id); if (e) e.textContent = txt; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char])); }

function fixThaiEncoding(str) {
  if (!str) return str;
  if (!str.includes("à¸") && !str.includes("Ã")) return str;
  try { const bytes = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF; return new TextDecoder("utf-8").decode(bytes); } catch { return str; }
}

function lineTime(text) {
  const match = text.match(/\b(\d{2}:\d{2}:\d{2}-\d{3})>/);
  if (match) return match[1];
  const ihm = text.match(/\b\d{2}\/\d{2}\/\d{4}\s+(\d{2}:\d{2}:\d{2}):(\d{2})\b/);
  return ihm ? `${ihm[1]}-${ihm[2]}0` : "-";
}

function isoTime(value) { return value ? (String(value).match(/T(\d{2}:\d{2}:\d{2})\.(\d{3})/) ? `${RegExp.$1}-${RegExp.$2}` : String(value)) : "-"; }
function plazaLabel(code) { return code ? `${PLAZAS[code] || "ไม่ทราบชื่อด่าน"} (${code})` : "ไม่พบข้อมูล"; }
function timeToMs(value) { const m = value && value.match(/(\d{2}):(\d{2}):(\d{2})-(\d{3})/); return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4] : null; }
function tripDuration(entry, exit) {
  if (!entry || !exit) return "-";
  const start = new Date(entry).getTime(), end = new Date(exit).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
  const minutes = Math.round((end - start) / 60000);
  return Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที` : `${minutes} นาที`;
}

// แก้บั๊ก ErrorCode 0 ตรงนี้ ดักเฉพาะ 1-9 ขึ้นไป
function isErrorLine(line) { 
  return /ERR_[A-Z0-9_]+|Refus DoubleCycle|WebStatus"\s*:\s*"(?!Normal)|ErrorCode\s*:\s*(?!0\b)[1-9]\d*/i.test(line) || 
         /Impression\s+KO/i.test(line) || 
         Boolean(line.match(/ANOMALIE:\s*\[\s*([^\]]+)\]/i)?.[1].trim().toUpperCase() !== "CONS_0000"); 
}

function decodeLog(buffer) { const u = new TextDecoder("utf-8").decode(buffer); const b = (u.match(/\uFFFD/g) || []).length; return (b === 0 || /[\u0E00-\u0E7F]/.test(u) || b / Math.max(u.length, 1) < 0.0001) ? u : (function(){try{return new TextDecoder("windows-874").decode(buffer);}catch{return u;}})(); }
function makeTransaction(startIndex, partial = false) { return { startIndex, endIndex: startIndex, passageStartIndex: startIndex, partial, id: null, isOverlapped: false }; }

function splitTransactions(lines) {
  const transactions = [];
  let current = null;
  let isObBlocked = false;
  let isPassageBlocked = false;
  let pendingClose = false;

  lines.forEach((line, index) => {
    const isStart = /BOUCLE_PRESENCE\s+-\s+PH_ON/i.test(line);
    const isNumTrxMatch = line.match(/NumTrx\D*(\d+)/i) || line.match(/AP_StartTransaction\s+\[\s*New NumTRX\s*:\s*(\d+)\s*\]/i);

    if (/ETAT_SEP_OPTIQUE\s+nv_etat:1/i.test(line)) isObBlocked = true;
    if (/ETAT_SEP_OPTIQUE\s+nv_etat:0/i.test(line) || /Fin separateur/i.test(line)) isObBlocked = false;
    if (/BOUCLE_PASSAGE\s+nv_etat:1/i.test(line)) isPassageBlocked = true;
    if (/BOUCLE_PASSAGE\s+nv_etat:0/i.test(line)) isPassageBlocked = false;

    if (isStart) {
      if (current) {
        current.endIndex = index - 1;
        if (isObBlocked || isPassageBlocked) {
          current.partial = true;
          current.isOverlapped = true;
        }
        transactions.push(analyzeTransaction(current, lines));
      }
      current = makeTransaction(index);
      pendingClose = false; 
    } else if (!current && (isNumTrxMatch || /Debut passage/i.test(line) || /DeductionData/i.test(line))) {
      current = makeTransaction(Math.max(0, index - 50), true);
    }

    if (current) {
      if (isNumTrxMatch && !current.id) current.id = isNumTrxMatch[1].trim();
      
      if (/CPT Incremente trafic total/i.test(line)) pendingClose = true;

      if (pendingClose && /BOUCLE_PASSAGE\s+nv_etat:0/i.test(line)) {
        current.endIndex = Math.min(index + 5, lines.length - 1);
        transactions.push(analyzeTransaction(current, lines));
        current = null;
        pendingClose = false;
      }
    }
  });

  if (current) { current.endIndex = lines.length - 1; current.partial = true; transactions.push(analyzeTransaction(current, lines)); }
  return transactions;
}

function extractButton(line) {
  const seq = line.match(/IHM_MSG\s+Touche\s+(C_TOUCHE_[A-Z0-9_]+)/i);
  if (seq) return seq[1].toUpperCase();
  const ihm = line.match(/codetouche\s+([A-Z][A-Z0-9_]*?)_\d+/i);
  if (!ihm) return null;
  const aliases = { CASH: "C_TOUCHE_ESPECES", VLD: "C_TOUCHE_VALIDER", CLASSE_1: "C_TOUCHE_CLASSE_1", CLASSE_2: "C_TOUCHE_CLASSE_2", CLASSE_3: "C_TOUCHE_CLASSE_3", CLASSE_4: "C_TOUCHE_CLASSE_4" };
  return aliases[ihm[1].toUpperCase()] || `C_TOUCHE_${ihm[1].toUpperCase()}`;
}

function extractTripData(lines) {
  let previous = "", trip = null;
  for (const line of lines) {
    if ((/DeductionData/i.test(line) || /TX_DeductionData/i.test(previous)) && line.includes("{")) {
      try { const parsed = JSON.parse(line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1)); if (parsed.TripID && (parsed.TripInfo || parsed.Plate1 !== undefined)) trip = parsed; } catch {}
    } else if (/TripDataSender.*{|TripDataInquiry.*{/i.test(previous)) {
       try { const parsed = JSON.parse(line.slice(line.indexOf("{"))); if (parsed.EntranceInfo?.[0] || parsed.TripInfo?.[0]) trip = parsed; } catch {}
    }
    previous = line;
  }
  if (!trip) {
    const text = lines.join("\n");
    const field = name => text.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`, "i"))?.[1] || "";
    if (field("TripID") || field("Plate1")) {
      trip = { Plate1: field("Plate1"), Plate2: field("Plate2"), Province: field("Province"), VehicleClass: field("VehicleClass"), TollFee: field("TollFee"), PaymentType: field("PaymentType"), TripInfo: [{ EntranceDetectionTime: field("DetectionTime") || field("EntranceDetectionTime"), EntrancePlazaNumber: field("PlazaNumber") || field("EntrancePlazaNumber"), ExitDetectionTime: field("PictureTime") || field("ExitDetectionTime") }], PaymentInfo: [{ PaymentMethod: field("PaymentMethod"), PaymentTime: field("PaymentTime"), PaymentAmount: field("PaymentAmount") }] };
    }
  }
  if (!trip) return null;
  const route = trip.TripInfo?.[0] || trip.EntranceInfo?.[0] || {};
  const routeOut = trip.TripInfo?.[0] || trip.ExitInfo?.[0] || {};
  const payment = trip.PaymentInfo?.[0] || {};
  return {
    plate: [fixThaiEncoding(trip.Plate1 || route.Plate1 || routeOut.Plate1), fixThaiEncoding(trip.Plate2 || route.Plate2 || routeOut.Plate2)].filter(Boolean).join(" ") || "ไม่พบทะเบียน",
    province: fixThaiEncoding(trip.Province || route.Province || routeOut.Province) || "ไม่ระบุ",
    entryPlaza: route.EntrancePlazaNumber || route.PlazaNumber || "", exitPlaza: routeOut.ExitPlazaNumber || routeOut.PlazaNumber || "",
    entryTime: route.EntranceDetectionTime || route.DetectionTime || "", exitTime: routeOut.ExitDetectionTime || routeOut.PictureTime || "",
    paymentTime: payment.PaymentTime || "", paymentMethod: payment.PaymentMethod || trip.PaymentType || "",
    paymentAmount: payment.PaymentAmount || trip.TollFee || "", vehicleClass: trip.VehicleClass || ""
  };
}

function analyzeTransaction(base, allLines) {
  const lines = allLines.slice(base.startIndex, base.endIndex + 1);
  const text = lines.join("\n");
  const counts = Object.fromEntries(SENSOR_DEFS.map(s => [s.key, 0]));
  const sensorEvents = [], buttons = [];

  lines.forEach((line, offset) => {
    SENSOR_DEFS.forEach(sensor => { if (new RegExp(`${sensor.token}\\s+nv_etat:1`, "i").test(line)) { counts[sensor.key] += 1; sensorEvents.push({ sensor, time: lineTime(line), line, lineNumber: base.startIndex + offset + 1 }); } });
    const buttonCode = extractButton(line);
    if (buttonCode) buttons.push({ code: buttonCode, label: BUTTON_LABELS[buttonCode] || buttonCode.replace("C_TOUCHE_", ""), time: lineTime(line), line, lineNumber: base.startIndex + offset + 1 });
  });

  const endMatch = text.match(/Envoi fin passage[^\n]*Classe\s+(\d+),\s+NbEssieux\s+(\d+)/i);
  const msgMatch = text.match(/NumTrx\D*(\d+)\s+Classe:\s*(\d+)\s+Tarif:\s*(\d+)/i);
  const journey = extractTripData(lines);
  const presenceLine = lines.find(line => /BOUCLE_PRESENCE\s+-\s+PH_ON/i.test(line));
  const errorLines = lines.map((line, offset) => ({ line, lineNumber: base.startIndex + offset + 1 })).filter(item => isErrorLine(item.line));

  const analyzed = {
    ...base, lines, counts, sensorEvents, buttons, journey, errorLines,
    directionEvents: [...text.matchAll(/Ordre\s+([^:\n]+)\s*:\s*Sens\s+(\d+)/gi)].map(m => ({ order: m[1].trim(), sense: +m[2] })),
    startTime: presenceLine ? lineTime(presenceLine) : (journey?.exitTime ? isoTime(journey.exitTime) : lineTime(lines[0])),
    endTime: lineTime(lines[lines.length - 1]),
    classNumber: journey?.vehicleClass || msgMatch?.[2] || endMatch?.[1] || "-",
    tariff: journey?.paymentAmount || msgMatch?.[3] || "-", axles: endMatch?.[2] || "-", findings: [], events: []
  };
  analyzed.findings = diagnose(analyzed);
  analyzed.severity = analyzed.findings.some(f => f.level === "critical") ? "critical" : analyzed.findings.some(f => f.level === "warning") ? "warning" : "normal";
  analyzed.events = buildEvents(analyzed);
  return analyzed;
}

function diagnose(trx) {
  const findings = [];
  const max = Math.max(...Object.values(trx.counts)), min = Math.min(...Object.values(trx.counts)), logText = trx.lines.join("\n");
  
  if (trx.isOverlapped) {
    findings.push({ level: "critical", title: "รถซ้อนคัน (Overlapped)!", detail: "คันนี้เหยียบ Presence เข้ามาในขณะที่คันหน้ายังพ้นช่องทางไม่สมบูรณ์ อาจทำให้การตัดเงินและการนับเพลาสับสน!" });
  }

  const hasPassageOn = /BOUCLE_PASSAGE\s+nv_etat:1/i.test(logText);
  const hasPassageOff = /BOUCLE_PASSAGE\s+nv_etat:0/i.test(logText);
  if (hasPassageOn && !hasPassageOff) {
    findings.push({ level: "critical", title: "Loop Passage ค้าง! (ไม่คืนค่า OFF)", detail: "รถทับ Loop Passage ไปแล้ว แต่ไม่มีสัญญาณคืนค่า (OFF) ตามมา เลนจะค้างและไม่เปิดรับรถคันถัดไป!" });
  }

  const hasApiSuccess = /"Successfully"/i.test(logText);
  if (hasApiSuccess) {
    findings.push({ level: "normal", title: "API ยืนยันการตัดยอด ✅", detail: "ระบบส่วนกลาง (MTC) ตอบกลับ Successfully (รับชำระเงินเรียบร้อย)" });
  } else if (trx.journey && !hasApiSuccess) {
    findings.push({ level: "warning", title: "API ไม่ตอบ Successfully", detail: "มีการส่งข้อมูล Deduction แต่ไม่มีการตอบกลับยืนยันความสำเร็จจากส่วนกลาง" });
  }

  if (/CPT Incremente trafic total/i.test(logText)) {
    findings.push({ level: "normal", title: "ลงสถิติสำเร็จ ✅", detail: "Hardware เคลียร์ข้อมูลช่องทางและลงสถิติเรียบร้อย" });
  } else if (trx.partial && !trx.isOverlapped) {
    findings.push({ level: "warning", title: "ข้อมูลแหว่ง (ไม่พบจุดจบ TRX)", detail: "ไม่พบคำสั่ง CPT Incremente... อาจจะตัด Log มาไม่ครบ" });
  }

  if (/AS_KEYIN_PLATE/i.test(logText)) {
    findings.push({ level: "warning", title: "พนักงานใช้ระบบคีย์ป้ายเอง (API 2)", detail: "API 1 ตรวจไม่พบข้อมูลต้นทาง หรือกล้องอ่านป้ายไม่ได้ พนักงานจึงคีย์ป้ายเพื่อใช้ API 2 ในการค้นหา" });
  }

  if (max > 0 && min === 0) findings.push({ level: "critical", title: "เซนเซอร์บอด", detail: `ไม่พบสัญญาณ: ${SENSOR_DEFS.filter(s => trx.counts[s.key] === 0).map(s => s.label).join(", ")}` });
  
  const badDir = trx.directionEvents.filter(e => e.sense !== 1);
  if (badDir.length) findings.push({ level: "critical", title: "รถถอยหลัง", detail: badDir.map(e => `Ordre ${e.order}: Sens ${e.sense}`).join("; ") });
  
  const orders90 = [...logText.matchAll(/PER_SimplificationOrdrePedales \(90\) Simplification <([^>]+)>/gi)].map(m => m[1]);
  const orders45 = [...logText.matchAll(/PER_SimplificationOrdrePedales \(45\) Simplification <([^>]+)>/gi)].map(m => m[1]);
  
  if (orders90.includes("2413")) {
    findings.push({ level: "critical", title: "รถถอยหลัง (Treadle 90)", detail: "พบโค้ด <2413> ล้อเหยียบย้อนศร" });
  } else if (orders90.some(o => o !== "1324" && o !== "2413")) {
    findings.push({ level: "warning", title: "Treadle 90 แพทเทิร์นแปลก", detail: `ลำดับการเหยียบล้อหลักผิดปกติ พบโค้ด <${[...new Set(orders90)].join(", ")}>` });
  }

  if (orders45.includes("1234")) {
    findings.push({ level: "normal", title: "วิเคราะห์ Class รถ (Treadle 45)", detail: "พบโค้ด <1234> ประเมินว่าเป็นรถเล็ก (Class 1)" });
  } else if (orders45.includes("1324")) {
    findings.push({ level: "normal", title: "วิเคราะห์ Class รถ (Treadle 45)", detail: "พบโค้ด <1324> ประเมินว่าเป็นรถใหญ่ (Class 2 ขึ้นไป)" });
  } else if (orders45.some(o => o !== "1234" && o !== "1324")) {
    findings.push({ level: "warning", title: "Treadle 45 แพทเทิร์นแปลก", detail: `ลำดับการเหยียบล้อเฉียงผิดปกติ พบโค้ด <${[...new Set(orders45)].join(", ")}>` });
  }
  
  if (trx.errorLines.length) {
    // แก้บั๊ก ErrorCode 0 (ไม่ให้กวาดเอา 0 มาโชว์)
    const codes = [...new Set(trx.errorLines.flatMap(item => item.line.match(/ERR_[A-Z0-9_]+|Refus DoubleCycle|ANOMALIE:\s*\[[^\]]+\]|Impression\s+KO|ErrorCode\s*:\s*(?!0\b)[1-9]\d*|WebStatus"\s*:\s*"(?!Normal)[^"]+"/gi) || []))];
    if (codes.length > 0) {
      findings.push({ level: "critical", title: "พบ Error หรือปฏิเสธคำสั่ง", detail: `ข้อผิดพลาด: ${codes.join(", ")}` });
    } else {
      findings.push({ level: "critical", title: "พบข้อผิดพลาด", detail: "พบ Error ที่ส่งผลกระทบต่อ Transaction (ตรวจสอบใน LOG ดิบ)" });
    }
  }

  if (/Impression\s+KO/i.test(logText)) findings.push({ level: "critical", title: "เครื่องพิมพ์ Error (Cutter)", detail: "สถานะ Impression KO ใบมีดอาจติด" });
  if (/DCP\s+LectureReponseImpression/i.test(logText) && !/DRT\s+IMPRESSION\s+OK/i.test(logText)) findings.push({ level: "warning", title: "เครื่องพิมพ์ค้าง", detail: "รอกระดาษ" });
  
  return findings;
}

function buildEvents(trx) {
  const events = [];
  if (trx.journey?.entryTime) events.push({ label: `ด่านเข้า: ${plazaLabel(trx.journey.entryPlaza)}`, level: "normal", time: isoTime(trx.journey.entryTime), line: `ทะเบียน ${trx.journey.plate}`, lineNumber: trx.startIndex - 0.2 });
  if (trx.journey?.exitTime) events.push({ label: `กล้องด่านออก: ${plazaLabel(trx.journey.exitPlaza)}`, level: "normal", time: isoTime(trx.journey.exitTime), line: `ทะเบียน ${trx.journey.plate}`, lineNumber: trx.startIndex - 0.1 });

  trx.lines.forEach((line, offset) => {
    let label = null, level = "normal", buttonCode = extractButton(line);
    const lineNumber = trx.startIndex + offset + 1;
    
    if (/PEDALE_(90|45)_[A-Z_]+\s+nv_etat:(1|0)/i.test(line)) {
      let tId = null;
      if (line.includes("PEDALE_90_G_AMONT")) tId = 'simP90G_AM';
      else if (line.includes("PEDALE_90_D_AMONT")) tId = 'simP90D_AM';
      else if (line.includes("PEDALE_90_G_AVAL")) tId = 'simP90G_AV';
      else if (line.includes("PEDALE_90_D_AVAL")) tId = 'simP90D_AV';
      else if (line.includes("PEDALE_45_AMONT")) tId = 'simP45_AM';
      else if (line.includes("PEDALE_45_AVAL")) tId = 'simP45_AV';
      if (tId) events.push({ isRaw: true, sensorTarget: tId, sensorState: /nv_etat:1/i.test(line), time: lineTime(line), lineNumber });
    }

    if (buttonCode) { label = `พนักงาน: ${BUTTON_LABELS[buttonCode] || buttonCode}`; if (/ANNUL|EMERGENCY|SIMU|ALA/.test(buttonCode)) level = "warning"; }
    else if (/AP_StartTransaction\s+\[\s*New NumTRX\s*:\s*(\d+)\s*\]/i.test(line)) label = `ระบบสร้าง Transaction เลขที่ ${line.match(/New NumTRX\s*:\s*(\d+)/i)?.[1]}`;
    else if (/WS - Send API1 TripDataSender/i.test(line)) label = "ถามป้ายทะเบียนอัตโนมัติ (API 1)";
    else if (/AS_Display_EntryPlaza API:\s*1/i.test(line)) label = "ดึงข้อมูลจาก API 1 สำเร็จ (แสดงหน้า Entry)";
    else if (/AS_KEYIN_PLATE/i.test(line)) { label = "ระบบเปิดหน้าต่างคีย์ป้ายทะเบียนเอง"; level = "warning"; }
    else if (/Plate saisi pour API2:\s*(.+)/i.test(line)) { label = `พนักงานกรอกทะเบียน: ${line.match(/Plate saisi pour API2:\s*(.+)/i)[1]}`; level = "warning"; }
    else if (/AS_REQUEST_PlazaApi2|WS - Send API2 TripDataInquiry/i.test(line)) label = "ค้นหาด้วยป้ายที่กรอก (API 2)";
    else if (/Entry plaza select:\s*(.+)/i.test(line)) label = `ระบบเลือกรหัสด่านต้นทาง: ${line.match(/Entry plaza select:\s*(.+)/i)[1]}`;
    else if (/AS_CalculateTollFare/i.test(line)) label = "คำนวณค่าผ่านทาง (Calculate Toll Fare)";
    else if (/AS_TrtEndTransaction/i.test(line)) label = "พนักงานทำรายการเสร็จสิ้น (เตรียมส่ง API 3)";
    else if (/WS - Send API3 DeductionData/i.test(line)) label = "ส่งข้อมูลตัดยอดเงิน (API 3)";
    else if (/"Successfully"/i.test(line)) label = "💰 API ยืนยันตัดเงินสำเร็จ (Software Cut-off)";
    else if (/BOUCLE_PRESENCE\s+-\s+PH_ON/i.test(line)) label = "รถเข้า Loop Presence";
    else if (/BOUCLE_PRESENCE\s+-\s+PH_OFF/i.test(line)) label = "รถออกจาก Loop Presence";
    else if (/BOUCLE_PASSAGE\s+nv_etat:1/i.test(line)) label = "รถทับ Loop Passage (ON)";
    else if (/BOUCLE_PASSAGE\s+nv_etat:0/i.test(line)) label = "✅ รถพ้น Loop Passage (Loop OFF สำเร็จ)";
    else if (/ETAT_SEP_OPTIQUE\s+nv_etat:1/i.test(line)) label = "รถบังม่านแสง";
    else if (/Fin separateur/i.test(line)) label = "รถพ้นม่านแสง (ตัดจบข้อมูลล้อรถ)";
    else if (/PER_MsgNvEtatPedales(90|45).*ordre\s+<([^>]+)>/i.test(line)) {
      const match = line.match(/PER_MsgNvEtatPedales(90|45).*ordre\s+<([^>]+)>/i);
      label = `Treadle ${match[1]} สเต็ปล้อ: <${match[2]}>`;
    }
    else if (/PER_SimplificationOrdrePedales \(90\) Simplification <([^>]+)>/i.test(line)) label = `ประมวลผลล้อ 90 (ลำดับ: <${line.match(/<([^>]+)>/)[1]}>)`;
    else if (/PER_SimplificationOrdrePedales \(45\) Simplification <([^>]+)>/i.test(line)) label = `ประมวลผลล้อ 45 (ลำดับ: <${line.match(/<([^>]+)>/)[1]}>)`;
    else if (/Envoi fin passage.*Classe\s+(\d+),\s+NbEssieux\s+(\d+)/i.test(line)) label = `ส่งข้อมูลสรุปช่องทาง (Class: ${line.match(/Classe\s+(\d+)/i)[1]}, เพลา: ${line.match(/NbEssieux\s+(\d+)/i)[1]})`;
    else if (/periph\s+48\s+new_etat\s+2/i.test(line)) label = "สั่งไม้กั้นเปิด (ยกขึ้น)";
    else if (/periph\s+48\s+new_etat\s+1/i.test(line)) label = "ไม้กั้นปิดสนิท (ยกลง)";
    else if (/DRT\s+IMPRESSION\s+OK/i.test(line)) label = "พิมพ์ใบเสร็จสำเร็จ";
    else if (/CPT Incremente trafic total/i.test(line)) label = "✅ ปิดรายการลงสถิติ (Physical Cut-off)";

    if (label) events.push({ label, level, time: lineTime(line), line, lineNumber });
  });

  return events.sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0));
}

// --------- ระบบจำลองสถานะเลน (Simulator) ---------
let simTimer = null;
let currentSimTrx = null;

function resetSimulator() {
  clearInterval(simTimer);
  if (el.playSimBtn) { el.playSimBtn.disabled = false; el.playSimBtn.textContent = "▶ เล่นภาพจำลอง (Play)"; }
  setSimText('simTimeDisplay', "--:--:--"); setSimText('simActionDisplay', "รอคำสั่ง..."); setSimText('simIhmAction', "-");
  
  toggleSim('simPresence', 'remove'); toggleSim('simPassage', 'remove');
  toggleSim('simOB', 'add'); toggleSim('simALB', 'remove', 'open'); 
  ['simP90G_AM', 'simP45_AM', 'simP90D_AM', 'simP90G_AV', 'simP45_AV', 'simP90D_AV'].forEach(id => toggleSim(id, 'remove'));
}

function playSimulation() {
  const trx = currentSimTrx;
  if (!trx || !trx.events || trx.events.length === 0) return;
  
  resetSimulator();
  if (el.playSimBtn) { el.playSimBtn.disabled = true; el.playSimBtn.textContent = "กำลังเล่น (Playing...)"; }
  
  let eventIdx = 0;
  simTimer = setInterval(() => {
    if (eventIdx >= trx.events.length) {
      clearInterval(simTimer);
      if (el.playSimBtn) { el.playSimBtn.disabled = false; el.playSimBtn.textContent = "↻ เล่นอีกครั้ง (Replay)"; }
      setSimText('simActionDisplay', "🏁 สิ้นสุดการจำลอง");
      return;
    }

    const ev = trx.events[eventIdx];
    
    if (ev.isRaw) {
      toggleSim(ev.sensorTarget, ev.sensorState ? 'add' : 'remove');
    } else {
      setSimText('simTimeDisplay', ev.time);
      setSimText('simActionDisplay', ev.label);
      const logLine = ev.line.toLowerCase();
      
      if (ev.label.includes("พนักงาน") || ev.label.includes("API") || logLine.includes("ihm")) setSimText('simIhmAction', ev.label);
      if (logLine.includes("boucle_presence - ph_on")) toggleSim('simPresence', 'add');
      if (logLine.includes("boucle_presence - ph_off")) toggleSim('simPresence', 'remove');
      if (logLine.includes("boucle_passage nv_etat:1")) toggleSim('simPassage', 'add');
      if (logLine.includes("boucle_passage nv_etat:0")) toggleSim('simPassage', 'remove');
      if (logLine.includes("etat_sep_optique nv_etat:1")) toggleSim('simOB', 'remove'); 
      if (logLine.includes("etat_sep_optique nv_etat:0") || logLine.includes("fin separateur")) toggleSim('simOB', 'add');
      if (logLine.includes("new_etat 2")) toggleSim('simALB', 'add', 'open');
      if (logLine.includes("new_etat 1")) toggleSim('simALB', 'remove', 'open');
    }
    eventIdx++;
  }, 150);
}

if (el.playSimBtn) el.playSimBtn.addEventListener('click', playSimulation);

// ----------------------------------------------------

async function loadFile(files) {
  if (!files || files.length === 0) return;
  try {
    const fileArray = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));
    if(el.fileMeta) el.fileMeta.textContent = `กำลังอ่าน ${fileArray.length} ไฟล์...`;
    
    let allLines = [], totalSize = 0, fileNames = [];
    for (const file of fileArray) {
      const text = decodeLog(await file.arrayBuffer()).replace(/\r\n?/g, "\n");
      allLines = allLines.concat(text.split("\n"));
      totalSize += file.size; fileNames.push(file.name);
    }

    state.file = { name: fileNames.length > 1 ? `${fileNames.length} ไฟล์` : fileNames[0], size: totalSize };
    state.lines = allLines;
    state.transactions = splitTransactions(state.lines);
    state.selectedIndex = state.transactions.findIndex(t => t.severity === "critical");
    if (state.selectedIndex < 0) state.selectedIndex = state.transactions.length ? 0 : -1;

    if (el.emptyState) el.emptyState.classList.add("hidden"); 
    if (el.analysisView) el.analysisView.classList.remove("hidden");
    if (el.exportButton) el.exportButton.disabled = false;
    if (el.fileMeta) el.fileMeta.textContent = `${state.file.name} • ${state.lines.length.toLocaleString("th-TH")} บรรทัด`;
    renderSummary(); renderTransactionList(); renderSelected();
  } catch (err) {
    alert("ระบบพังตอนเปิดไฟล์ว่ะโชติ: " + err.message);
    console.error(err);
  }
}

function renderSummary() {
  const trxs = state.transactions;
  if(el.trxCount) el.trxCount.textContent = trxs.length;
  if(el.criticalCount) el.criticalCount.textContent = trxs.filter(t => t.severity === "critical").length;
  if(el.warningCount) el.warningCount.textContent = trxs.filter(t => t.severity === "warning").length;
  if(el.apiStatus) el.apiStatus.textContent = `${trxs.filter(t => t.journey).length}/${trxs.length}`;
}

function renderTransactionList() {
  if(!el.transactionList) return;
  const query = el.transactionSearch ? el.transactionSearch.value.trim().toLowerCase() : "";
  const filter = el.severityFilter ? el.severityFilter.value : "all";
  const rows = state.transactions.map((trx, index) => ({ trx, index })).filter(({ trx }) => {
    const searchable = [trx.id, trx.journey?.plate, trx.journey?.province, PLAZAS[trx.journey?.entryPlaza]].join(" ").toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (filter === "all" || trx.severity === filter);
  });

  el.transactionList.innerHTML = rows.length ? rows.map(({ trx, index }) => `
    <button class="transaction-row ${index === state.selectedIndex ? "active" : ""}" data-index="${index}" type="button">
      <span class="severity-bar"></span>
      <span><span class="trx-title">${escapeHtml(trx.journey?.plate || `Trx ${trx.id || "ไม่มีเลข"}`)}${trx.partial ? ' <small style="color:red;">(แหว่ง)</small>' : ''}${trx.isOverlapped ? ' <small style="color:darkorange;">(รถซ้อน)</small>' : ''}</span><span class="trx-meta">Trx ${escapeHtml(trx.id || "-")}</span></span>
      <span class="status-badge ${trx.severity}">${({ critical: "ผิดปกติ", warning: "ควรเช็ค", normal: "ปกติ" })[trx.severity]}</span>
    </button>`).join("") : '<div class="empty-message">ไม่พบข้อมูล</div>';
}

function renderSelected() {
  const trx = state.transactions[state.selectedIndex];
  if (!trx) return;
  currentSimTrx = trx; resetSimulator();
  renderDiagnosis(trx); renderTimeline(trx); renderFlowChart(trx); renderRaw(trx);
}

function renderDiagnosis(trx) {
  if(!el.diagnosisTab) return;
  const maxCount = Math.max(...Object.values(trx.counts));
  const sensorRows = SENSOR_DEFS.map(s => `<tr><td>${s.label}</td><td>${s.token}</td><td class="${maxCount > 0 && trx.counts[s.key] === 0 ? "count-bad" : trx.counts[s.key] < maxCount ? "count-warn" : ""}">${trx.counts[s.key]}</td></tr>`).join("");
  const j = trx.journey;

  el.diagnosisTab.innerHTML = `
    <div class="detail-header"><div><h2>${escapeHtml(j?.plate || `Trx ${trx.id || "-"}`)}</h2><p>${escapeHtml(trx.startTime)} - ${escapeHtml(trx.endTime)}</p></div><span class="status-badge ${trx.severity}">${trx.severity}</span></div>
    ${j ? `<div class="vehicle-summary"><div class="plate-block"><span>ทะเบียน</span><strong>${escapeHtml(j.plate)}</strong><small>${escapeHtml(j.province)}</small></div><div class="route-flow"><div class="route-stop"><span>ด่านเข้า</span><strong>${escapeHtml(plazaLabel(j.entryPlaza))}</strong></div><div class="route-line"><span>${escapeHtml(tripDuration(j.entryTime, j.exitTime))}</span></div><div class="route-stop"><span>ด่านออก</span><strong>${escapeHtml(plazaLabel(j.exitPlaza))}</strong></div></div></div>` : ''}
    <div class="facts"><div class="fact"><span>CLASS</span><strong>${escapeHtml(trx.classNumber)}</strong></div><div class="fact"><span>เพลา</span><strong>${escapeHtml(trx.axles)}</strong></div><div class="fact"><span>ค่าผ่านทาง</span><strong>${escapeHtml(trx.tariff)} บ.</strong></div></div>
    <h3 class="section-title">ปุ่มที่กด</h3><div class="operator-actions">${trx.buttons.map(b => `<div class="operator-action"><time>${escapeHtml(b.time)}</time><strong>${escapeHtml(b.label)}</strong></div>`).join("") || "ไม่มีการกด"}</div>
    <h3 class="section-title">ข้อวิเคราะห์ (Diagnosis)</h3>${trx.findings.map(f => `<div class="finding ${f.level}"><div class="finding-mark"></div><div class="finding-body"><strong>${escapeHtml(f.title)}</strong><p>${escapeHtml(f.detail)}</p></div></div>`).join("")}
    <h3 class="section-title">เซนเซอร์</h3><table class="sensor-table"><thead><tr><th>อุปกรณ์</th><th>LOG</th><th>ครั้ง</th></tr></thead><tbody>${sensorRows}</tbody></table>`;
}

function renderTimeline(trx) {
  const displayEvents = trx.events.filter(e => !e.isRaw);
  if(el.timelineTab) el.timelineTab.innerHTML = `<div class="timeline">${displayEvents.map(e => `<div class="event ${e.level} clickable-event" onclick="jumpToLine(${e.lineNumber})"><div class="event-time">${escapeHtml(e.time)}</div><div class="event-dot"></div><div class="event-text"><strong>${escapeHtml(e.label)}</strong><code>${escapeHtml(e.line)}</code></div></div>`).join("")}</div>`;
}

function renderFlowChart(trx) {
  const container = el.flowTab;
  if (!container) return;
  const displayEvents = trx.events.filter(e => !e.isRaw);
  if (!displayEvents.length) { container.innerHTML = '<div class="empty-message">ไม่พบข้อมูลลำดับขั้นตอน</div>'; return; }

  let html = `<h3 class="section-title">Sequence of Events (API & Hardware Flow)</h3><table class="sensor-table" style="width: 100%; border-collapse: collapse;"><thead><tr><th style="text-align: left; padding: 8px;">เวลา</th><th style="text-align: left; padding: 8px;">หมวดหมู่</th><th style="text-align: left; padding: 8px;">รายละเอียดเหตุการณ์</th></tr></thead><tbody>`;
  displayEvents.forEach(e => {
    let category = "ระบบทั่วไป";
    if (e.label.includes("พนักงาน")) category = "🙋 พนักงาน (IHM)";
    else if (e.label.includes("API")) category = "🌐 ระบบศูนย์กลาง (API)";
    else if (e.label.includes("ไม้กั้น") || e.label.includes("พิมพ์ใบเสร็จ")) category = "🚧 อุปกรณ์ (Hardware)";
    else if (e.label.includes("Loop") || e.label.includes("ม่านแสง") || e.label.includes("Treadle") || e.label.includes("เพลา")) category = "🚗 เซนเซอร์รถ";

    html += `<tr class="event-row ${e.level} clickable-event" onclick="jumpToLine(${e.lineNumber})" style="border-bottom: 1px solid #ddd;"><td style="padding: 8px; font-family: monospace; white-space: nowrap;">${escapeHtml(e.time)}</td><td style="padding: 8px; white-space: nowrap;"><strong>${category}</strong></td><td style="padding: 8px;">${escapeHtml(e.label)} <small style="display:block; opacity: 0.5;">${escapeHtml(e.line)}</small></td></tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

// --------- ฟีเจอร์: ช่องค้นหาภายใน LOG ดิบ ---------
function renderRaw(trx) {
  if(!el.rawTab) return;
  
  let html = `
    <div class="pane-toolbar" style="margin-bottom:15px; padding:0; border:none; background:transparent;">
      <input id="localRawSearch" type="search" placeholder="🔍 พิมพ์ค้นหาเฉพาะใน LOG คันนี้ (พิมพ์แล้วกรองทันที)..." style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--line); font-family:monospace;">
    </div>`;
    
  html += `<div class="log-view" id="rawLogContainer">` + trx.lines.map((line, offset) => {
    const lineNumber = trx.startIndex + offset + 1;
    const isNoise = /TIMER VIE|Empile elt indcom|LgMsg\s+\d+\s+<lf>Z<cr>|Recv AckNeutre|Add OpElem:\s*500|DepilerOpElem NbrMsgPile:\s*0|Send Pipe Msg \w+ Lane \d+ Lg \d+ \/ \d+|Reveil \d+ Evts|Reception Msg Com_Ls|DepilerMsg \w+ Evts/i.test(line);
    const style = isNoise ? ' style="opacity: 0.25; font-size: 0.9em;"' : '';
    return `<div class="log-line" data-line="${lineNumber}" ${style}><span class="log-number">${lineNumber}</span><span class="log-content">${escapeHtml(line)}</span></div>`;
  }).join("") + `</div>`;
  
  el.rawTab.innerHTML = html;

  // ผูก Event ให้พิมพ์แล้วค้นหาในหน้านี้ทันที
  const searchInput = document.getElementById('localRawSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const term = e.target.value.toLowerCase();
      const lines = el.rawTab.querySelectorAll('.log-line');
      lines.forEach(lineEl => {
        if (lineEl.textContent.toLowerCase().includes(term)) {
          lineEl.style.display = 'flex';
          if (term) lineEl.style.background = 'rgba(8, 124, 120, 0.15)'; // สาดสีเขียวอ่อนๆ เวลาค้นเจอ
          else lineEl.style.background = '';
        } else {
          lineEl.style.display = 'none';
        }
      });
    });
  }
}

function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  ["diagnosis", "timeline", "flow", "simulator", "raw", "search"].forEach(n => {
    const tabEl = document.getElementById(`${n}Tab`);
    if(tabEl) tabEl.classList.toggle("hidden", n !== name);
  });
}

function performGlobalSearch() {
  if(!el.globalSearch || !el.searchResults) return;
  const query = el.globalSearch.value.trim().toLowerCase();
  if (!query) return el.searchResults.innerHTML = "";
  const matches = state.lines.map((line, i) => ({ line, lineNumber: i + 1 })).filter(item => item.line.toLowerCase().includes(query)).slice(0, 1000);
  if(el.searchSummary) el.searchSummary.textContent = `พบ ${matches.length} รายการ`;
  
  // Render search results
  el.searchResults.innerHTML = `<div class="log-view">` + matches.map(item => {
    return `<div class="log-line hit" data-line="${item.lineNumber}"><span class="log-number">${item.lineNumber}</span><span class="log-content">${escapeHtml(item.line)}</span></div>`;
  }).join("") + `</div>`;
}

if(el.fileInput) el.fileInput.addEventListener("change", e => loadFile(e.target.files));
if(el.transactionSearch) el.transactionSearch.addEventListener("input", renderTransactionList);
if(el.severityFilter) el.severityFilter.addEventListener("change", renderTransactionList);
if(el.transactionList) el.transactionList.addEventListener("click", e => { const row = e.target.closest(".transaction-row"); if (row) { state.selectedIndex = +row.dataset.index; renderTransactionList(); renderSelected(); } });
const tabsContainer = document.querySelector(".tabs");
if(tabsContainer) tabsContainer.addEventListener("click", e => { const tab = e.target.closest(".tab"); if (tab) switchTab(tab.dataset.tab); });
if(el.searchButton) el.searchButton.addEventListener("click", performGlobalSearch);
if(el.globalSearch) el.globalSearch.addEventListener("keydown", e => { if (e.key === "Enter") performGlobalSearch(); });
["dragenter", "dragover", "dragleave", "drop"].forEach(evt => document.addEventListener(evt, e => e.preventDefault()));
document.addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files.length) loadFile(e.dataTransfer.files); });