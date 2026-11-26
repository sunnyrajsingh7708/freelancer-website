const FLOORS = 5;
const SEATS_PER_FLOOR = 200;
const STORAGE_KEY = "library-seats-v1";

const floorsEl = document.getElementById("floors");
const floorSelect = document.getElementById("floorSelect");
const freeInput = document.getElementById("freeInput");
const form = document.getElementById("updateForm");
const message = document.getElementById("message");

// Load saved data, or start with every seat free.
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length === FLOORS) return saved;
  } catch (e) { /* ignore and use defaults */ }
  return Array.from({ length: FLOORS }, () => ({
    free: SEATS_PER_FLOOR,
    updated: null
  }));
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* storage may be unavailable */ }
}

let data = loadData();

function getStatus(free) {
  const ratio = free / SEATS_PER_FLOOR;
  if (free === 0) return { cls: "full", text: "Full" };
  if (ratio <= 0.2) return { cls: "busy", text: "Almost full" };
  if (ratio <= 0.5) return { cls: "busy", text: "Filling up" };
  return { cls: "free", text: "Plenty of seats" };
}

function timeAgo(ts) {
  if (!ts) return "No updates yet";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return "Updated " + mins + " min ago";
  const hrs = Math.round(mins / 60);
  return "Updated " + hrs + (hrs === 1 ? " hour ago" : " hours ago");
}

function render() {
  floorsEl.innerHTML = "";
  let totalFree = 0;

  data.forEach((floor, i) => {
    totalFree += floor.free;
    const status = getStatus(floor.free);
    const usedPct = ((SEATS_PER_FLOOR - floor.free) / SEATS_PER_FLOOR) * 100;

    const card = document.createElement("article");
    card.className = "floor " + status.cls;
    card.innerHTML =
      "<h3>Floor " + (i + 1) + "</h3>" +
      '<div class="status">' + status.text + "</div>" +
      '<div class="bar" role="img" aria-label="' + Math.round(usedPct) + '% occupied"><div style="width:' + usedPct + '%"></div></div>' +
      '<div class="meta"><span>' + floor.free + " of " + SEATS_PER_FLOOR + " seats free</span><span>" + timeAgo(floor.updated) + "</span></div>";
    floorsEl.appendChild(card);
  });

  document.getElementById("totalFree").textContent = totalFree;
  document.getElementById("totalSeats").textContent = FLOORS * SEATS_PER_FLOOR;
}

// Fill the floor dropdown.
for (let i = 1; i <= FLOORS; i++) {
  const opt = document.createElement("option");
  opt.value = i - 1;
  opt.textContent = "Floor " + i;
  floorSelect.appendChild(opt);
}

form.addEventListener("submit", function (e) {
  e.preventDefault();
  const floorIndex = Number(floorSelect.value);
  const free = Number(freeInput.value);

  if (!Number.isInteger(free) || free < 0 || free > SEATS_PER_FLOOR) {
    message.textContent = "Enter a whole number from 0 to " + SEATS_PER_FLOOR + ".";
    message.className = "message error";
    return;
  }

  data[floorIndex] = { free: free, updated: Date.now() };
  saveData();
  render();
  message.textContent = "Saved. Floor " + (floorIndex + 1) + " now shows " + free + " free seats.";
  message.className = "message";
  form.reset();
});

// Keep the "updated x min ago" text fresh.
setInterval(render, 60000);

render();