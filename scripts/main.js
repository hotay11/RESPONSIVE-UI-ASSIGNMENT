"use strict";
/* =====================================================================
   PESA - Student Finance Tracker (one JavaScript file)
   Sections: Store, Validators, Search, State, UI, App
   Seed data lives in seed.json. Tests live in tests.html.
   ===================================================================== */

/* ---------------------------------------------------------------- STORE */
const Store = (() => {
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;                       // corrupted data will not crash the app
    }
  }
  function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* storage full or blocked */ }
  }
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return { load, save, downloadJSON };
})();

/* ----------------------------------------------------------- VALIDATORS */
const Validators = (() => {
  const rules = {
    description: /^\S(?:.*\S)?$/,                                  // no leading/trailing spaces
    amount: /^(0|[1-9]\d*)(\.\d{1,2})?$/,                          // number, up to 2 decimals
    date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,         // YYYY-MM-DD
    category: /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/,                     // letters, spaces, hyphens
    duplicateWord: /\b(\w+)\s+\1\b/i,                              // ADVANCED: back-reference
    doubleSpace: /\s{2,}/,
    currencyCode: /^[A-Za-z]{2,5}$/,
    rate: /^(0|[1-9]\d*)(\.\d{1,8})?$/
  };

  // Each validator returns "" when OK, or an error message.
  function validateDescription(v) {
    if (!rules.description.test(v)) return "Required. No leading or trailing spaces.";
    if (rules.doubleSpace.test(v)) return "Use single spaces between words.";
    if (rules.duplicateWord.test(v)) return "A word is repeated (like 'the the'). Please check it.";
    return "";
  }
  function validateAmount(v) {
    return rules.amount.test(v) ? "" : "Numbers only, up to 2 decimals (e.g. 5000 or 12.50).";
  }
  function validateDate(v) {
    if (!rules.date.test(v)) return "Use the format YYYY-MM-DD.";
    const d = new Date(v);                      // catches impossible dates like 2026-02-31
    if (isNaN(d) || d.toISOString().slice(0, 10) !== v) return "That date does not exist.";
    return "";
  }
  function validateCategory(v) {
    return rules.category.test(v) ? "" : "Letters, spaces and hyphens only.";
  }
  function validateCap(v) {
    return rules.amount.test(v) ? "" : "Cap must be a number (up to 2 decimals).";
  }
  function validateCurrencyCode(v) {
    return rules.currencyCode.test(v) ? "" : "Currency codes are 2 to 5 letters.";
  }
  function validateRate(v) {
    return rules.rate.test(v) && Number(v) > 0 ? "" : "Rates must be numbers above 0.";
  }
  function validateRecord(r) {
    return validateDescription(r.description) || validateAmount(String(r.amount)) ||
           validateCategory(r.category) || validateDate(r.date);
  }
  function validateImport(list) {
    if (!Array.isArray(list)) return "File must contain a list of records.";
    const ids = new Set();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const n = "Record " + (i + 1) + ": ";
      if (!r || typeof r !== "object") return n + "not an object.";
      if (typeof r.id !== "string" || !r.id || ids.has(r.id)) return n + "missing or duplicate id.";
      ids.add(r.id);
      if (typeof r.description !== "string" || !rules.description.test(r.description)) return n + "bad description.";
      if (typeof r.amount !== "number" || !rules.amount.test(String(r.amount))) return n + "bad amount.";
      if (typeof r.date !== "string" || validateDate(r.date)) return n + "bad date.";
      if (typeof r.category !== "string" || !rules.category.test(r.category)) return n + "bad category.";
      if (typeof r.createdAt !== "string" || typeof r.updatedAt !== "string") return n + "missing timestamps.";
    }
    return "";
  }

  return { rules, validateDescription, validateAmount, validateDate, validateCategory, validateCap,
           validateCurrencyCode, validateRate, validateRecord, validateImport };
})();

/* --------------------------------------------------------------- SEARCH */
const Search = (() => {
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Safe regex compiler: never throws, returns an error message instead
  function compileRegex(input, flags) {
    if (flags === undefined) flags = "i";
    if (!input) return { re: null, error: "" };
    try {
      return { re: new RegExp(input, flags), error: "" };
    } catch (e) {
      return { re: null, error: "Invalid pattern. Check your brackets and slashes." };
    }
  }
  // Wraps matches in <mark>. Everything is escaped first, so it is safe.
  function highlight(text, re) {
    text = String(text);
    if (!re) return escapeHtml(text);
    const g = new RegExp(re.source, re.flags.replace("g", "") + "g");
    let out = "", last = 0, m;
    while ((m = g.exec(text)) !== null) {
      if (m[0] === "") { g.lastIndex++; continue; }      // avoid infinite loop on empty matches
      out += escapeHtml(text.slice(last, m.index)) + "<mark>" + escapeHtml(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  }
  return { escapeHtml, compileRegex, highlight };
})();

/* ---------------------------------------------------------------- STATE */
const State = (() => {
  function freshDefaults() {
    return {
      budget: 1500000,
      baseCurrency: "TSh",
      currencies: [{ code: "USD", rate: 0.0004 }, { code: "EUR", rate: 0.00035 }],
      categories: ["Food", "Books", "Transport", "Entertainment", "Fees", "Other"]
    };
  }

  function readSettings() {
    const saved = Store.load("pesa:settings", {});
    const ok = saved && typeof saved === "object" && !Array.isArray(saved);
    const d = freshDefaults();
    const s = Object.assign(freshDefaults(), ok ? saved : {});
    if (!Array.isArray(s.currencies) || s.currencies.length < 2) s.currencies = d.currencies;
    if (!Array.isArray(s.categories) || s.categories.length === 0) s.categories = d.categories;
    if (typeof s.budget !== "number") s.budget = d.budget;
    if (typeof s.baseCurrency !== "string") s.baseCurrency = d.baseCurrency;
    return s;
  }

  function readRecords() {
    const saved = Store.load("pesa:records", null);
    if (!Array.isArray(saved)) return null;               // null = first visit, load seed.json
    return saved.filter(r => r && typeof r.id === "string" && typeof r.description === "string" &&
      typeof r.amount === "number" && typeof r.date === "string" && typeof r.category === "string");
  }

  const state = { records: readRecords(), settings: readSettings() };

  function persist() {
    Store.save("pesa:records", state.records);
    Store.save("pesa:settings", state.settings);
  }

  async function loadSeed() {
    try {
      const res = await fetch("seed.json");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];                                          // e.g. opened without a server
    }
  }

  function nextId() {
    const nums = state.records.map(r => Number(String(r.id).replace("rec_", "")) || 0);
    let n = Math.max(0, ...nums) + 1;
    while (state.records.some(r => r.id === "rec_" + String(n).padStart(4, "0"))) n++;
    return "rec_" + String(n).padStart(4, "0");
  }

  function addRecord(data) {
    const now = new Date().toISOString();
    state.records.push(Object.assign({ id: nextId() }, data, { createdAt: now, updatedAt: now }));
    persist();
  }
  function updateRecord(id, data) {
    const rec = state.records.find(r => r.id === id);
    if (!rec) return;
    Object.assign(rec, data, { updatedAt: new Date().toISOString() });
    persist();
  }
  function deleteRecord(id) {
    state.records = state.records.filter(r => r.id !== id);
    persist();
  }
  function resetDefaults() { state.settings = freshDefaults(); }

  return { state, persist, loadSeed, addRecord, updateRecord, deleteRecord, resetDefaults };
})();

/* ------------------------------------------------------------------- UI */
const UI = (() => {
  const state = State.state;
  const escapeHtml = Search.escapeHtml;

  const $ = id => document.getElementById(id);

  // Only touch the DOM if the text changed (so live regions don't repeat themselves)
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function localDate(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function money(amount) {
    return state.settings.baseCurrency + " " + Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  let toastTimer;
  function message(text) {
    const toast = $("status");
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      toast.textContent = "";
    }, 2500);
  }

  function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    $(id).classList.add("active");

    document.querySelectorAll("[data-view]").forEach(button => {
      if (button.classList.contains("btn")) return;        // only the nav buttons
      const on = button.dataset.view === id;
      button.classList.toggle("active", on);
      if (on) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (id === "settings") renderSettings();
    if (id === "transactions") renderTransactions();

    const h1 = $(id).querySelector("h1");
    h1.setAttribute("tabindex", "-1");
    h1.focus();                                            // keyboard users land on the new page
    window.scrollTo(0, 0);
  }

  function renderDashboard() {
    const records = state.records;
    const total = records.reduce((sum, r) => sum + r.amount, 0);

    $("totalSpending").textContent = money(total);
    $("totalRecords").textContent = records.length;
    $("totalConverted").textContent = state.settings.currencies
      .map(c => c.code + " " + (total * c.rate).toFixed(2)).join("  •  ");

    const totals = {};
    records.forEach(r => { totals[r.category] = (totals[r.category] || 0) + r.amount; });
    const sorted = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    $("topCategory").textContent = sorted[0] || "—";

    // Cap
    const cap = state.settings.budget;
    const percent = cap ? total / cap * 100 : 0;
    $("budgetPercent").textContent = Math.round(percent) + "%";
    $("budgetSmall").textContent = money(Math.max(0, cap - total)) + " remaining";
    $("budgetDisplay").textContent = money(total) + " / " + money(cap);
    $("budgetBar").style.width = Math.min(percent, 100) + "%";
    $("budgetBar").classList.toggle("over", total > cap);

    if (total > cap) {
      setText($("capPolite"), "");
      setText($("capAlert"), "Cap exceeded by " + money(total - cap) + ".");        // assertive
    } else {
      setText($("capAlert"), "");
      setText($("capPolite"), money(cap - total) + " remaining under your cap.");    // polite
    }

    // Top categories
    const biggest = Math.max(1, ...Object.values(totals));
    $("categoriesList").innerHTML = sorted.slice(0, 5).map(c => `
      <div class="category">
        <div class="category-top">
          <span>${escapeHtml(c)}</span>
          <strong>${money(totals[c])}</strong>
        </div>
        <div class="track"><div class="fill" style="width:${totals[c] / biggest * 100}%"></div></div>
      </div>`).join("") || '<p class="muted">No categories yet.</p>';

    // Last 7 days chart
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const date = localDate(day);
      days.push({
        label: day.toLocaleDateString("en", { weekday: "short" }),
        total: records.filter(r => r.date === date).reduce((s, r) => s + r.amount, 0)
      });
    }
    const max = Math.max(1, ...days.map(d => d.total));
    $("trendChart").innerHTML = days.map(d => `
      <div class="bar-wrap" title="${d.label}: ${money(d.total)}">
        <div class="bar" style="height:${Math.max(3, d.total / max * 100)}%"></div>
        <span class="bar-label">${d.label.slice(0, 3)}</span>
      </div>`).join("");
    $("trendSummary").textContent = "Spending last 7 days: " +
      days.map(d => d.label + " " + money(d.total)).join(", ");

    // Recent transactions
    const recent = records.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $("recentTransactions").innerHTML = recent.map(r => `
      <div class="recent-row">
        <div>
          <strong>${escapeHtml(r.description)}</strong>
          <div class="small muted">${escapeHtml(r.category)} • ${escapeHtml(r.date)}</div>
        </div>
        <strong>-${money(r.amount)}</strong>
      </div>`).join("") || '<p class="muted">No transactions yet.</p>';
  }

  const sorters = {
    newest: (a, b) => b.date.localeCompare(a.date),
    oldest: (a, b) => a.date.localeCompare(b.date),
    az: (a, b) => a.description.localeCompare(b.description),
    za: (a, b) => b.description.localeCompare(a.description),
    high: (a, b) => b.amount - a.amount,
    low: (a, b) => a.amount - b.amount
  };

  let inlineEditId = null;
  function setInlineEdit(id) { inlineEditId = id; }

  function editRow(r) {
    const cats = state.settings.categories.includes(r.category)
      ? state.settings.categories
      : state.settings.categories.concat(r.category);
    const options = cats.map(c => `<option ${c === r.category ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
    return `
      <tr id="editRow" data-id="${escapeHtml(r.id)}">
        <td><input id="editDate" aria-label="Date" value="${escapeHtml(r.date)}"></td>
        <td><input id="editDesc" aria-label="Description" value="${escapeHtml(r.description)}"></td>
        <td><select id="editCat" aria-label="Category">${options}</select></td>
        <td><input id="editAmount" aria-label="Amount" inputmode="decimal" value="${r.amount}"></td>
        <td>
          <button class="btn primary small-btn" data-save="1">Save</button>
          <button class="btn small-btn" data-cancel="1">Cancel</button>
          <div class="field-error" id="editError" role="alert"></div>
        </td>
      </tr>`;
  }

  function renderTransactions() {
    const result = Search.compileRegex($("search").value, $("caseToggle").checked ? "i" : "");
    const re = result.re;

    const list = state.records
      .filter(r => !re || re.test(`${r.description} ${r.category} ${r.amount.toFixed(2)} ${r.date}`))
      .sort(sorters[$("sort").value]);

    setText($("searchStatus"), result.error || (re ? list.length + " result(s) found" : ""));

    $("transactionsBody").innerHTML = list.map(r => r.id === inlineEditId ? editRow(r) : `
      <tr>
        <td>${Search.highlight(r.date, re)}</td>
        <td>${Search.highlight(r.description, re)}</td>
        <td><span class="pill">${Search.highlight(r.category, re)}</span></td>
        <td><strong>${escapeHtml(state.settings.baseCurrency)} ${Search.highlight(r.amount.toFixed(2), re)}</strong></td>
        <td>
          <button class="btn small-btn" data-edit="${escapeHtml(r.id)}" aria-label="Edit ${escapeHtml(r.description)}">Edit</button>
          <button class="btn danger small-btn" data-delete="${escapeHtml(r.id)}" aria-label="Delete ${escapeHtml(r.description)}">Delete</button>
        </td>
      </tr>`).join("");

    $("emptyMessage").style.display = list.length ? "none" : "block";
  }

  function renderCategoryOptions() {
    const select = $("category");
    const previous = select.value;
    select.innerHTML = state.settings.categories
      .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (state.settings.categories.includes(previous)) select.value = previous;
  }

  function renderCategoryList() {
    $("settingsCategories").innerHTML = state.settings.categories.map((c, i) => `
      <div class="setting-row flex">
        <span>${escapeHtml(c)}</span>
        <button class="btn danger small-btn" data-remove="${i}" aria-label="Remove category ${escapeHtml(c)}">Remove</button>
      </div>`).join("");
  }

  function renderSettings() {
    const s = state.settings;
    $("budgetInput").value = s.budget;
    $("baseCurrency").value = s.baseCurrency;
    $("cur1Code").value = s.currencies[0].code;
    $("cur1Rate").value = s.currencies[0].rate;
    $("cur2Code").value = s.currencies[1].code;
    $("cur2Rate").value = s.currencies[1].rate;
    $("settingsError").textContent = "";
    renderCategoryList();
  }

  function renderAll() {
    renderDashboard();
    renderTransactions();
    renderCategoryOptions();
  }

  return { $, message, localDate, showView, renderDashboard, renderTransactions, renderCategoryOptions,
           renderCategoryList, renderSettings, renderAll, setInlineEdit };
})();

/* ------------------------------------------------------------------ APP */
async function startApp() {
  const state = State.state;
  const V = Validators;
  const { $, message, localDate, showView, renderTransactions, renderCategoryOptions,
          renderCategoryList, renderSettings, renderAll, setInlineEdit } = UI;

  // First visit: load the starter records from seed.json
  if (state.records === null) {
    const seed = await State.loadSeed();
    state.records = seed;
    if (seed.length) State.persist();      // if the seed failed to load, try again next time
  }
  renderAll();
  renderSettings();
  $("date").value = localDate();

  /* ----- Navigation ----- */
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (button) showView(button.dataset.view);
  });

  /* ----- Add form with live regex validation ----- */
  const fields = [
    ["description", V.validateDescription],
    ["amount", V.validateAmount],
    ["category", V.validateCategory],
    ["date", V.validateDate]
  ];

  function checkField(id, validator) {
    const msg = validator($(id).value);
    $(id + "Error").textContent = msg;
    $(id).setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  }

  fields.forEach(([id, fn]) => $(id).addEventListener("input", () => checkField(id, fn)));

  function resetForm() {
    $("expenseForm").reset();
    fields.forEach(([id]) => {
      $(id + "Error").textContent = "";
      $(id).removeAttribute("aria-invalid");
    });
    $("date").value = localDate();
    renderCategoryOptions();
  }

  $("expenseForm").addEventListener("submit", event => {
    event.preventDefault();
    const allOk = fields.map(([id, fn]) => checkField(id, fn)).every(Boolean);
    if (!allOk) {
      message("Please fix the errors in the form.");
      return;
    }
    State.addRecord({
      description: $("description").value,
      amount: Number($("amount").value),
      category: $("category").value,
      date: $("date").value
    });
    resetForm();
    renderAll();
    showView("dashboard");
    message("Expense added.");
  });

  $("cancel").addEventListener("click", () => {
    resetForm();
    showView("dashboard");
  });

  /* ----- Search and sort ----- */
  function refreshList() {
    setInlineEdit(null);
    renderTransactions();
  }
  $("search").addEventListener("input", refreshList);
  $("caseToggle").addEventListener("change", refreshList);
  $("sort").addEventListener("change", refreshList);

  /* ----- Inline edit and delete ----- */
  function focusEditButton(id) {
    const btn = Array.from(document.querySelectorAll("[data-edit]")).find(b => b.dataset.edit === id);
    if (btn) btn.focus();
  }

  function cancelEdit() {
    const id = $("editRow").dataset.id;
    setInlineEdit(null);
    renderTransactions();
    focusEditButton(id);
  }

  function saveEdit() {
    const id = $("editRow").dataset.id;
    const data = {
      description: $("editDesc").value,
      amount: $("editAmount").value,
      category: $("editCat").value,
      date: $("editDate").value
    };
    const error = V.validateRecord(data);
    if (error) {
      $("editError").textContent = error;
      return;
    }
    State.updateRecord(id, Object.assign({}, data, { amount: Number(data.amount) }));
    setInlineEdit(null);
    renderAll();
    focusEditButton(id);
    message("Expense updated.");
  }

  $("transactionsBody").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");

    if (edit) {
      setInlineEdit(edit.dataset.edit);
      renderTransactions();
      $("editDesc").focus();
    }
    if (event.target.closest("[data-cancel]")) cancelEdit();
    if (event.target.closest("[data-save]")) saveEdit();

    if (del) {
      const rec = state.records.find(r => r.id === del.dataset.delete);
      if (rec && confirm('Delete "' + rec.description + '"? This cannot be undone.')) {
        State.deleteRecord(rec.id);
        renderAll();
        message("Expense deleted.");
      }
    }
  });

  // Enter saves, Escape cancels inside the edit row
  $("transactionsBody").addEventListener("keydown", event => {
    if (!event.target.closest("#editRow")) return;
    if (event.key === "Escape") cancelEdit();
    if (event.key === "Enter" && event.target.tagName === "INPUT") saveEdit();
  });

  /* ----- Settings: cap and currencies ----- */
  $("saveSettings").addEventListener("click", () => {
    const cap = $("budgetInput").value.trim();
    const base = $("baseCurrency").value.trim();
    const c1 = $("cur1Code").value.trim(), r1 = $("cur1Rate").value.trim();
    const c2 = $("cur2Code").value.trim(), r2 = $("cur2Rate").value.trim();

    const error = V.validateCap(cap) || V.validateCurrencyCode(base) ||
      V.validateCurrencyCode(c1) || V.validateRate(r1) ||
      V.validateCurrencyCode(c2) || V.validateRate(r2);

    $("settingsError").textContent = error;
    if (error) return;

    state.settings.budget = Number(cap);
    state.settings.baseCurrency = base;
    state.settings.currencies = [
      { code: c1.toUpperCase(), rate: Number(r1) },
      { code: c2.toUpperCase(), rate: Number(r2) }
    ];
    State.persist();
    renderAll();
    message("Settings saved.");
  });

  /* ----- Settings: categories ----- */
  $("addCategory").addEventListener("click", () => {
    const name = $("newCategory").value;
    const msg = V.validateCategory(name);
    const exists = state.settings.categories.some(c => c.toLowerCase() === name.toLowerCase());
    $("newCategoryError").textContent = msg || (exists ? "That category already exists." : "");
    if (msg || exists) return;

    state.settings.categories.push(name);
    $("newCategory").value = "";
    State.persist();
    renderCategoryList();
    renderCategoryOptions();
    message("Category added.");
  });

  $("settingsCategories").addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    if (state.settings.categories.length < 2) {
      message("Keep at least one category.");
      return;
    }
    const index = Number(button.dataset.remove);
    const name = state.settings.categories[index];
    if (confirm('Remove category "' + name + '"? Existing expenses keep this category.')) {
      state.settings.categories.splice(index, 1);
      State.persist();
      renderCategoryList();
      renderCategoryOptions();
      message("Category removed.");
    }
  });

  /* ----- Import / export / reset ----- */
  function exportData() {
    Store.downloadJSON(state.records, "pesa-data.json");
    message("Data exported.");
  }
  $("exportBtn").addEventListener("click", exportData);
  $("exportTop").addEventListener("click", exportData);

  $("importFile").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const error = V.validateImport(data);
      if (error) throw new Error(error);
      if (confirm("Replace your current records with " + data.length + " imported records?")) {
        state.records = data;
        State.persist();
        renderAll();
        $("importMessage").textContent = "Imported " + data.length + " records.";
      } else {
        $("importMessage").textContent = "Import cancelled.";
      }
    } catch (err) {
      $("importMessage").textContent = "Import failed: " + err.message;   // old data stays untouched
    }
    event.target.value = "";
  });

  $("resetBtn").addEventListener("click", async () => {
    if (!confirm("Reset PESA to its starter data? This replaces your records and settings.")) return;
    state.records = await State.loadSeed();
    State.resetDefaults();
    State.persist();
    renderAll();
    renderSettings();
    message("Data reset.");
  });
}

// Only start the app on the real page (tests.html loads this file too, but has no form)
if (document.getElementById("expenseForm")) {
  startApp();
}