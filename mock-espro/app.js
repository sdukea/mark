/**
 * Mock ESPro marks-entry page.
 *
 * This simulates the structural quirks of a typical legacy, server-rendered
 * university ERP so the extension can be built and tested against something
 * realistic before we have the real ESPro DOM:
 *   - Plain HTML table, no SPA framework, rows rendered once at "load".
 *   - Non-semantic ASP.NET-WebForms-style control IDs/names.
 *   - Identifier (USN) is plain text content, not a data-* attribute — the
 *     extension has to read it the way it would have to on a real system.
 *   - Client-side pagination (only the current page's rows exist usefully;
 *     others are present but not what faculty is looking at).
 *   - One student already has a mark (tests overwrite protection).
 *   - One duplicate USN across two rows (tests DUPLICATE_ESPRO).
 *   - One row with a missing/blank USN (tests malformed-row handling).
 *   - Native 'input'/'change' events drive the UI, the way a jQuery-based
 *     legacy app would listen — no framework-specific value setter needed.
 */

const MAX_MARKS = 20;
const PAGE_SIZE = 8;

const STUDENTS = [
  { usn: "1DT21CS001", name: "Aditi Sharma", existingMark: "" },
  { usn: "1DT21CS002", name: "Rohan Mehta", existingMark: "" },
  { usn: "1DT21CS003", name: "Sneha Iyer", existingMark: "" },
  { usn: "1DT21CS004", name: "Karthik Reddy", existingMark: "" },
  { usn: "1DT21CS005", name: "Priya Nair", existingMark: "15" },
  { usn: "1DT21CS006", name: "Arjun Rao", existingMark: "" },
  { usn: "1DT21CS007", name: "Divya Menon", existingMark: "" },
  { usn: "1DT21CS008", name: "Vikram Singh", existingMark: "" },
  { usn: "1DT21CS009", name: "Ishaan Gupta", existingMark: "" },
  { usn: "1DT21CS010", name: "Meera Pillai", existingMark: "" },
  { usn: "1DT21CS010", name: "Meera Pillai", existingMark: "" }, // duplicate USN (data entry error)
  { usn: "", name: "Unregistered Student", existingMark: "" }, // malformed row
  { usn: "1DT21CS012", name: "Farhan Ali", existingMark: "" },
  { usn: "1DT21CS013", name: "Neha Joshi", existingMark: "" },
  { usn: "1DT21CS014", name: "Aakash Verma", existingMark: "" },
  { usn: "1DT21CS015", name: "Bhavya Krishnan", existingMark: "" },
];

let currentPage = 0;
const totalPages = Math.ceil(STUDENTS.length / PAGE_SIZE);

function controlIdFor(globalIndex, suffix) {
  // Mimics ASP.NET GridView naming: ctl01 is usually the header row,
  // data rows start at ctl02 and increment per row.
  const ctl = String(globalIndex + 2).padStart(2, "0");
  return `ctl00_MainContent_gvMarks_ctl${ctl}_${suffix}`;
}

function renderPage(page) {
  const tbody = document.getElementById("studentTableBody");
  tbody.innerHTML = "";

  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, STUDENTS.length);

  for (let i = start; i < end; i++) {
    const student = STUDENTS[i];
    const tr = document.createElement("tr");
    tr.setAttribute("data-row-index", String(i));
    if (!student.usn) tr.classList.add("row--flagged");

    const slTd = document.createElement("td");
    slTd.className = "col-sl";
    slTd.textContent = String(i + 1);

    const usnTd = document.createElement("td");
    usnTd.className = "col-usn";
    const usnSpan = document.createElement("span");
    usnSpan.id = controlIdFor(i, "lblUSN");
    usnSpan.textContent = student.usn || "—";
    usnTd.appendChild(usnSpan);

    const nameTd = document.createElement("td");
    nameTd.className = "col-name";
    const nameSpan = document.createElement("span");
    nameSpan.id = controlIdFor(i, "lblName");
    nameSpan.textContent = student.name;
    nameTd.appendChild(nameSpan);

    const marksTd = document.createElement("td");
    marksTd.className = "col-marks";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 3;
    input.className = "marks-input";
    input.id = controlIdFor(i, "txtMarks");
    input.name = controlIdFor(i, "txtMarks").replace(/_/g, "$");
    input.value = student.existingMark;
    input.setAttribute("data-max-marks", String(MAX_MARKS));
    marksTd.appendChild(input);

    const statusTd = document.createElement("td");
    statusTd.className = "col-status";
    const pill = document.createElement("span");
    pill.className = "status-pill";
    pill.setAttribute("data-role", "status-pill");
    statusTd.appendChild(pill);

    tr.append(slTd, usnTd, nameTd, marksTd, statusTd);
    tbody.appendChild(tr);

    wireInput(input, pill);
    updateStatusPill(input, pill);
  }

  document.getElementById("pageIndicator").textContent =
    `Page ${page + 1} of ${totalPages}`;
  document.getElementById("btnPrevPage").disabled = page === 0;
  document.getElementById("btnNextPage").disabled = page === totalPages - 1;
}

function updateStatusPill(input, pill) {
  const hasValue = input.value.trim() !== "";
  pill.textContent = hasValue ? "Filled" : "Empty";
  pill.className = "status-pill " + (hasValue ? "status-pill--filled" : "status-pill--empty");
}

function validateInput(input) {
  const raw = input.value.trim();
  if (raw === "") {
    input.classList.remove("is-invalid");
    return;
  }
  const num = Number(raw);
  const invalid = !Number.isFinite(num) || num < 0 || num > MAX_MARKS;
  input.classList.toggle("is-invalid", invalid);
}

function wireInput(input, pill) {
  input.addEventListener("input", () => {
    validateInput(input);
  });
  input.addEventListener("change", () => {
    updateStatusPill(input, pill);
    // A real legacy ERP would typically fire an AJAX postback here.
    console.log(`[mock-espro] change event on ${input.id} -> "${input.value}"`);
  });
}

document.getElementById("btnPrevPage").addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage -= 1;
    renderPage(currentPage);
  }
});
document.getElementById("btnNextPage").addEventListener("click", () => {
  if (currentPage < totalPages - 1) {
    currentPage += 1;
    renderPage(currentPage);
  }
});

function showBanner(message) {
  const banner = document.getElementById("saveBanner");
  banner.textContent = message;
  banner.hidden = false;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { banner.hidden = true; }, 4000);
}

document.getElementById("btnSave").addEventListener("click", () => {
  const filled = document.querySelectorAll(".marks-input").length;
  showBanner(`Demo only: nothing was actually saved. (${filled} field(s) present on this page.)`);
});

document.getElementById("btnSubmit").addEventListener("click", () => {
  showBanner("Demo only: Submit Final does not transmit any data on this mock page.");
});

renderPage(currentPage);
