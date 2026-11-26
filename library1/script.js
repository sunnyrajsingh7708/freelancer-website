const FLOORS = 5, SILENT = 150, GROUP = 50;
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]; // 9:00 to 20:00
const NOTICE_TTL = 24 * 60 * 60 * 1000; // messages last 24 hours
const K = { seats: "lib-seats-v2", book: "lib-book-v2", msg: "lib-msg-v2" };
const $ = id => document.getElementById(id);
const today = new Date().toDateString();

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
  catch (e) { return def; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hh = h => String(h).padStart(2, "0") + ":00";
const clock = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

let seats, bookings, notices;

// Remove messages older than 24 hours.
function prune() {
  const before = notices.length;
  notices = notices.filter(n => Date.now() - n.time < NOTICE_TTL);
  if (notices.length !== before) save(K.msg, notices);
}
function leftText(n) {
  const mins = Math.max(1, Math.ceil((NOTICE_TTL - (Date.now() - n.time)) / 60000));
  return mins >= 60 ? "disappears in " + Math.ceil(mins / 60) + "h" : "disappears in " + mins + " min";
}

function loadAll() {
  seats = load(K.seats, null);
  if (!Array.isArray(seats) || seats.length !== FLOORS)
    seats = Array.from({ length: FLOORS }, () => ({ silent: SILENT, group: GROUP, updated: null }));
  bookings = load(K.book, []).filter(b => b.date === today);
  notices = load(K.msg, []);
  prune();
}
loadAll();

function status(free, total) {
  if (free === 0) return { cls: "full", text: "Full" };
  if (free / total <= 0.2) return { cls: "busy", text: "Almost full" };
  if (free / total <= 0.5) return { cls: "busy", text: "Filling up" };
  return { cls: "free", text: "Plenty of seats" };
}
function seatRow(label, free, total) {
  const s = status(free, total), used = (total - free) / total * 100;
  return '<div class="row ' + s.cls + '"><div class="head"><span>' + label + '</span><span class="st">' + s.text + '</span></div>' +
    '<div class="bar" role="img" aria-label="' + Math.round(used) + '% occupied"><div style="width:' + used + '%"></div></div>' +
    '<div class="sub">' + free + " of " + total + " free</div></div>";
}

function renderFloors() {
  let ts = 0, tg = 0;
  $("floors").innerHTML = seats.map((f, i) => {
    ts += f.silent; tg += f.group;
    const booked = bookings.filter(b => b.floor === i).length;
    const when = f.updated ? "Updated " + clock(f.updated) : "No updates yet";
    return '<article class="floor"><h3>Floor ' + (i + 1) + "<small>" + when + "</small></h3>" +
      seatRow("Silent seats", f.silent, SILENT) +
      seatRow("Group / discussion seats", f.group, GROUP) +
      '<div class="sub">Discussion room: ' + (HOURS.length - booked) + " of " + HOURS.length + " hours free today</div></article>";
  }).join("");
  $("totalSilent").textContent = ts;
  $("totalGroup").textContent = tg;
}

function renderBookings() {
  const sorted = bookings.slice().sort((a, b) => a.floor - b.floor || a.hour - b.hour);
  $("bookings").innerHTML = sorted.length ? sorted.map(b =>
    "<li><span>Floor " + (b.floor + 1) + " · " + hh(b.hour) + "–" + hh(b.hour + 1) +
    "<small>Booked by " + esc(b.name) + '</small></span><button data-id="' + b.id + '">Cancel</button></li>'
  ).join("") : "<li>No bookings yet today.</li>";
}

function renderNotices() {
  prune();
  $("notices").innerHTML = notices.length ? notices.slice(-20).reverse().map(n =>
    "<li><span>" + esc(n.text) + "<small>" + esc(n.name || "A student") + " · " + clock(n.time) +
    " · " + leftText(n) + "</small></span></li>"
  ).join("") : "<li>No messages in the last 24 hours.</li>";
}
function renderAll() { renderFloors(); renderBookings(); renderNotices(); }

// ----- Notifications -----
function toast(n) {
  const d = document.createElement("div");
  d.className = "toast";
  d.innerHTML = "<b>" + esc(n.name || "A student") + " says</b>" + esc(n.text);
  $("toasts").appendChild(d);
  setTimeout(() => d.remove(), 7000);
}
function pushNotice(n) {
  toast(n);
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("Library notice", { body: (n.name || "A student") + ": " + n.text }); } catch (e) {}
  }
}
$("notifyBtn").addEventListener("click", () => {
  if (!("Notification" in window)) { alert("This browser does not support notifications."); return; }
  Notification.requestPermission().then(p => {
    $("notifyBtn").textContent = p === "granted" ? "Notifications on" : "Notifications blocked";
  });
});

// ----- Dropdowns -----
for (let i = 1; i <= FLOORS; i++) {
  ["seatFloor", "roomFloor"].forEach(id => {
    const o = document.createElement("option");
    o.value = i - 1; o.textContent = "Floor " + i; $(id).appendChild(o);
  });
}
HOURS.forEach(h => {
  const o = document.createElement("option");
  o.value = h; o.textContent = hh(h) + " – " + hh(h + 1); $("roomSlot").appendChild(o);
});
$("seatType").addEventListener("change", () => {
  $("seatFree").max = $("seatType").value === "silent" ? SILENT : GROUP;
});

function say(el, text, isError) { el.textContent = text; el.className = "message" + (isError ? " error" : ""); }

// ----- Update seats -----
$("seatForm").addEventListener("submit", e => {
  e.preventDefault();
  const i = Number($("seatFloor").value), type = $("seatType").value, free = Number($("seatFree").value);
  const max = type === "silent" ? SILENT : GROUP;
  if (!Number.isInteger(free) || free < 0 || free > max) { say($("seatMsg"), "Enter a whole number from 0 to " + max + ".", true); return; }
  seats[i][type] = free; seats[i].updated = Date.now();
  save(K.seats, seats); renderFloors();
  say($("seatMsg"), "Saved. Floor " + (i + 1) + " " + type + " seats free: " + free + ".");
  $("seatForm").reset();
});

// ----- Book room -----
$("roomForm").addEventListener("submit", e => {
  e.preventDefault();
  const floor = Number($("roomFloor").value), hour = Number($("roomSlot").value), name = $("roomName").value.trim();
  if (!name) { say($("roomMsg"), "Please enter your name.", true); return; }
  if (bookings.some(b => b.floor === floor && b.hour === hour)) { say($("roomMsg"), "That slot is already booked. Pick another time.", true); return; }
  bookings.push({ id: Date.now(), floor: floor, hour: hour, name: name, date: today });
  save(K.book, bookings); renderAll();
  say($("roomMsg"), "Booked: Floor " + (floor + 1) + ", " + hh(hour) + "–" + hh(hour + 1) + ".");
  $("roomForm").reset();
});
$("bookings").addEventListener("click", e => {
  const id = e.target.dataset && e.target.dataset.id;
  if (!id) return;
  bookings = bookings.filter(b => String(b.id) !== id);
  save(K.book, bookings); renderAll();
});

// ----- Message board -----
$("msgForm").addEventListener("submit", e => {
  e.preventDefault();
  const text = $("msgText").value.trim();
  if (!text) return;
  const n = { id: Date.now(), text: text, name: $("msgName").value.trim(), time: Date.now() };
  notices.push(n); save(K.msg, notices); renderNotices(); pushNotice(n);
  $("msgText").value = "";
});

// Other tabs or windows on the same device get changes live.
window.addEventListener("storage", e => {
  if (e.key === K.msg) {
    const oldIds = notices.map(n => n.id);
    loadAll();
    notices.filter(n => !oldIds.includes(n.id)).forEach(pushNotice);
  } else if (e.key === K.seats || e.key === K.book) {
    loadAll();
  } else return;
  renderAll();
});

// Every minute: refresh the page and remove messages older than 24 hours.
setInterval(renderAll, 60000);
renderAll();