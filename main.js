(() => {
  "use strict";

  /* =====================================================
     HELPERS
  ===================================================== */
  const $ = id => document.getElementById(id);

  const esc = s => String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const pad = n => String(n).padStart(2, "0");

  function dateString(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  const todayString = () => dateString(new Date());

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return dateString(d);
  }

  /* =====================================================
     VALIDATORS (regex rules)
  ===================================================== */
  const Validators = (() => {
    const rules = {
      description: /^\S(?:.*\S)?$/,                                   // no leading/trailing spaces
      amount: /^(0|[1-9]\d*)(\.\d{1,2})?$/,                           // number, max 2 decimals
      date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,          // YYYY-MM-DD
      category: /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/,                      // letters, spaces, hyphens
      duplicateWord: /\b(\w+)\s+\1\b/i                                 // advanced: back-reference
    };

    const collapseSpaces = s => s.replace(/\s{2,}/g, " ");

    function description(v) {
      if (!v) return "Description is required.";
      if (!rules.description.test(v)) return "Remove spaces at the start or end.";
      const dup = collapseSpaces(v).match(rules.duplicateWord);
      if (dup) return 'Repeated word "' + dup[1] + '". Please remove the duplicate.';
      return "";
    }

    function number(v, allowZero) {
      if (!rules.amount.test(v)) return "Enter a number with up to 2 decimals (e.g. 5000 or 12.50).";
      if (!allowZero && Number(v) <= 0) return "Must be greater than 0.";
      return "";
    }

    function date(v) {
      if (!rules.date.test(v)) return "Use the format YYYY-MM-DD.";
      const d = new Date(v + "T00:00:00Z");
      if (isNaN(d) || d.toISOString().slice(0, 10) !== v) return "That date does not exist.";
      return "";
    }

    function category(v) {
      if (!v) return "Category is required.";
      if (!rules.category.test(v)) return "Use letters, spaces and hyphens only.";
      return "";
    }

    function record(r) {
      if (!r || typeof r !== "object") return "not an object";
      if (typeof r.id !== "string" || !r.id) return "missing id";
      if (typeof r.description !== "string" || description(r.description)) return "invalid description";
      if (typeof r.amount !== "number" || !isFinite(r.amount) || number(String(r.amount))) return "invalid amount";
      if (typeof r.category !== "string" || category(r.category)) return "invalid category";
      if (typeof r.date !== "string" || date(r.date)) return "invalid date";
      if (typeof r.createdAt !== "string" || isNaN(Date.parse(r.createdAt))) return "invalid createdAt";
      if (typeof r.updatedAt !== "string" || isNaN(Date.parse(r.updatedAt))) return "invalid updatedAt";
      return "";
    }

    return { rules, collapseSpaces, description, number, date, category, record };
  })();

  /* =====================================================
     SEARCH (safe regex compiler + highlight)
  ===================================================== */
  const Search = {
    compile(input, ignoreCase) {
      if (!input) return null;
      try {
        return {
          test: new RegExp(input, ignoreCase ? "i" : ""),
          mark: new RegExp(input, ignoreCase ? "gi" : "g")
        };
      } catch {
        return null;
      }
    },

    matches(re, r) {
      return [r.description, r.category, r.date, r.amount.toFixed(2)]
        .some(text => re.test.test(text));
    },

    highlight(text, re) {
      if (!re) return esc(text);
      let out = "";
      let last = 0;
      for (const m of text.matchAll(re.mark)) {
        if (!m[0]) continue;
        out += esc(text.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
        last = m.index + m[0].length;
      }
      return out + esc(text.slice(last));
    }
  };

  /* =====================================================
     DATA (defaults, parsing, import validation)
  ===================================================== */
  const CURRENCIES = ["TSh", "USD", "EUR"];
  const DEFAULT_CATEGORIES = ["Food", "Books", "Transport", "Entertainment", "Fees", "Other"];

  const defaultSettings = () => ({ display: "TSh", rates: { USD: 2600, EUR: 2900 } });

  function seedRecords() {
    const now = new Date().toISOString();
    const rows = [
      ["Lunch at cafeteria", 5000, "Food", daysAgo(1)],
      ["Chemistry textbook", 25000, "Books", daysAgo(2)],
      ["Bus pass", 4500, "Transport", daysAgo(3)],
      ["Coffee with friends", 8750.5, "Entertainment", daysAgo(4)],
      ["Registration fees", 150000, "Fees", daysAgo(5)],
      ["Tea and snacks", 3200.75, "Food", daysAgo(6)],
      ["Notebook", 0.5, "Books", daysAgo(0)],
      ["Leap day pizza", 12000, "Food", "2024-02-29"],
      ["Data bundle for the year", 1999999.99, "Other", "2026-01-01"],
      ["Taxi to town-center", 7500, "Transport", "2025-12-31"],
      ["Rent & utilities <March>", 350000, "Fees", "2025-03-01"],
      ["Cinema ticket", 6000, "Entertainment", daysAgo(2)]
    ];
    return rows.map((row, i) => ({
      id: "rec_" + String(i + 1).padStart(4, "0"),
      description: row[0],
      amount: row[1],
      category: row[2],
      date: row[3],
      createdAt: now,
      updatedAt: now
    }));
  }

  // Validates a loaded/imported object. Returns { data } or { error }.
  function parseData(obj) {
    if (Array.isArray(obj)) obj = { records: obj };
    if (!obj || typeof obj !== "object") return { error: "File must contain a JSON object or array." };
    if (!Array.isArray(obj.records)) return { error: 'Missing "records" array.' };

    const ids = new Set();
    for (let i = 0; i < obj.records.length; i++) {
      const r = obj.records[i];
      let problem = Validators.record(r);
      if (!problem && ids.has(r.id)) problem = "duplicate id";
      if (problem) return { error: "Record " + (i + 1) + ": " + problem + "." };
      ids.add(r.id);
    }

    let categories = DEFAULT_CATEGORIES.slice();
    if (obj.categories !== undefined) {
      const c = obj.categories;
      if (!Array.isArray(c) || !c.length || c.some(x => typeof x !== "string" || Validators.category(x))) {
        return { error: "Invalid categories list." };
      }
      categories = [...new Set(c)];
    }
    obj.records.forEach(r => {
      if (!categories.includes(r.category)) categories.push(r.category);
    });

    let budget = 300000;
    if (obj.budget !== undefined) {
      if (typeof obj.budget !== "number" || !isFinite(obj.budget) || obj.budget < 0) {
        return { error: "Invalid budget." };
      }
      budget = obj.budget;
    }

    let settings = defaultSettings();
    if (obj.settings !== undefined) {
      const s = obj.settings;
      const goodRate = v => typeof v === "number" && isFinite(v) && v > 0;
      if (!s || typeof s !== "object" || !CURRENCIES.includes(s.display) || !s.rates ||
          !goodRate(s.rates.USD) || !goodRate(s.rates.EUR)) {
        return { error: "Invalid currency settings." };
      }
      settings = { display: s.display, rates: { USD: s.rates.USD, EUR: s.rates.EUR } };
    }

    return { data: { records: obj.records, categories, budget, settings } };
  }

  /* =====================================================
     STORAGE (localStorage)
  ===================================================== */
  const Storage = (() => {
    const KEY = "pesa:data";

    return {
      // returns null (nothing saved), { data } or { error }
      load() {
        try {
          const raw = localStorage.getItem(KEY);
          if (!raw) return null;
          return parseData(JSON.parse(raw));
        } catch {
          return { error: "Saved data could not be read." };
        }
      },

      save(data) {
        try {
          localStorage.setItem(KEY, JSON.stringify(data));
          return true;
        } catch {
          return false;
        }
      }
    };
  })();

  /* =====================================================
     STATE
  ===================================================== */
  const state = {
    records: [],
    categories: [],
    budget: 300000,
    settings: defaultSettings(),
    editingId: null,
    view: "dashboard"
  };

  function snapshot() {
    return {
      records: state.records,
      categories: state.categories,
      budget: state.budget,
      settings: state.settings
    };
  }

  function persist() {
    if (!Storage.save(snapshot())) {
      message("Could not save data (storage full or blocked).");
    }
  }

  function applyData(data) {
    state.records = data.records;
    state.categories = data.categories;
    state.budget = data.budget;
    state.settings = data.settings;
    state.editingId = null;
    persist();
    renderAll();
  }

  function nextId() {
    const max = state.records.reduce((m, r) => {
      const found = /^rec_(\d+)$/.exec(r.id);
      return found ? Math.max(m, Number(found[1])) : m;
    }, 0);
    return "rec_" + String(max + 1).padStart(4, "0");
  }

  /* =====================================================
     FORMATTING + MESSAGES
  ===================================================== */
  function money(amount) {
    const { display, rates } = state.settings;
    const value = display === "TSh" ? Number(amount) : Number(amount) / rates[display];
    return display + " " + value.toLocaleString("en-TZ", { maximumFractionDigits: 2 });
  }

  let messageTimer;

  function message(text) {
    const el = $("status");
    el.classList.add("show");
    setTimeout(() => { el.textContent = text; }, 50);
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      el.classList.remove("show");
      el.textContent = "";
    }, 2600);
  }

  /* =====================================================
     VIEWS / NAVIGATION
  ===================================================== */
  function showView(id, moveFocus = true) {
    state.view = id;

    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    $(id).classList.add("active");

    document.querySelectorAll("[data-view]").forEach(button => {
      const active = button.dataset.view === id;
      button.classList.toggle("active", active);
      if (button.closest(".sidebar, .mobile-nav")) {
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
    });

    if (id === "settings") renderSettings();
    if (id === "transactions") renderTransactions();

    window.scrollTo(0, 0);

    if (moveFocus) {
      const heading = $(id).querySelector("h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (button) showView(button.dataset.view);
  });

  /* =====================================================
     RENDER: DASHBOARD
  ===================================================== */
  function renderDashboard() {
    const total = state.records.reduce((sum, r) => sum + r.amount, 0);
    const budget = state.budget;

    $("totalSpending").textContent = money(total);
    $("totalRecords").textContent = state.records.length;

    const totals = {};
    state.records.forEach(r => {
      totals[r.category] = (totals[r.category] || 0) + r.amount;
    });
    const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    $("topCategory").textContent = ranked[0] || "—";

    // Cap / target
    const over = budget > 0 && total > budget;
    const percent = budget ? total / budget * 100 : 0;

    $("budgetPercent").textContent = Math.round(percent) + "%";
    $("budgetSmall").textContent = budget
      ? (over ? money(total - budget) + " over budget" : money(budget - total) + " remaining")
      : "Set a budget in Settings";
    $("budgetDisplay").textContent = money(total) + " / " + money(budget);
    $("budgetBar").style.width = Math.min(percent, 100) + "%";
    $("budgetBar").style.background = over ? "var(--red)" : "";

    const capText = !budget
      ? "Set your monthly budget in Settings."
      : over
        ? "Budget exceeded by " + money(total - budget) + "."
        : money(budget - total) + " remaining in your budget.";

    const capEl = $("budgetMessage");
    capEl.setAttribute("aria-atomic", "true");
    capEl.setAttribute("aria-live", over ? "assertive" : "polite");
    if (capEl.textContent !== capText) capEl.textContent = capText;

    // Top categories
    const biggest = Math.max(1, ...Object.values(totals));
    $("categoriesList").innerHTML = ranked.slice(0, 5).map(c => `
      <div class="category">
        <div class="category-top">
          <span>${esc(c)}</span>
          <strong>${esc(money(totals[c]))}</strong>
        </div>
        <div class="track">
          <div class="fill" style="width:${totals[c] / biggest * 100}%"></div>
        </div>
      </div>
    `).join("") || '<p class="muted">No categories yet.</p>';

    // Last 7 days trend
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const key = daysAgo(i);
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        label: d.toLocaleDateString("en", { weekday: "short" }),
        total: state.records.filter(r => r.date === key).reduce((s, r) => s + r.amount, 0)
      });
    }
    const max = Math.max(1, ...days.map(d => d.total));

    const chart = $("trendChart");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", "Spending in the last 7 days: " +
      days.map(d => d.label + " " + money(d.total)).join(", "));
    chart.innerHTML = days.map(d => `
      <div class="bar-wrap" title="${esc(money(d.total))}">
        <div class="bar" style="height:${Math.max(3, d.total / max * 100)}%"></div>
        <span class="bar-label">${esc(d.label.slice(0, 1))}</span>
      </div>
    `).join("");

    // Recent transactions
    const recent = [...state.records]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    $("recentTransactions").innerHTML = recent.map(r => `
      <div class="recent-row">
        <div>
          <strong>${esc(r.description)}</strong>
          <div class="small muted">${esc(r.category)} • ${esc(r.date)}</div>
        </div>
        <strong>-${esc(money(r.amount))}</strong>
      </div>
    `).join("") || '<p class="muted">No transactions yet.</p>';
  }

  /* =====================================================
     RENDER: TRANSACTIONS (search, sort, inline edit)
  ===================================================== */
  const sorters = {
    newest: (a, b) => b.date.localeCompare(a.date),
    oldest: (a, b) => a.date.localeCompare(b.date),
    az: (a, b) => a.description.localeCompare(b.description, undefined, { sensitivity: "base" }),
    za: (a, b) => b.description.localeCompare(a.description, undefined, { sensitivity: "base" }),
    high: (a, b) => b.amount - a.amount,
    low: (a, b) => a.amount - b.amount
  };

  function categoryOptions(selected) {
    const list = state.categories.includes(selected) || !selected
      ? state.categories
      : [...state.categories, selected];
    return list.map(c =>
      `<option${c === selected ? " selected" : ""}>${esc(c)}</option>`
    ).join("");
  }

  function editRow(r) {
    return `
      <tr class="editing">
        <td><input id="editDate" type="date" aria-label="Date" value="${esc(r.date)}"></td>
        <td>
          <input id="editDescription" type="text" aria-label="Description" value="${esc(r.description)}">
          <div class="field-error" id="editError" role="alert"></div>
        </td>
        <td><select id="editCategory" aria-label="Category">${categoryOptions(r.category)}</select></td>
        <td><input id="editAmount" type="text" inputmode="decimal" aria-label="Amount" value="${esc(r.amount)}"></td>
        <td>
          <button type="button" class="btn primary small-btn" data-save="${esc(r.id)}">Save</button>
          <button type="button" class="btn small-btn" data-cancel>Cancel</button>
        </td>
      </tr>`;
  }

  function renderTransactions() {
    const pattern = $("search").value;
    const re = Search.compile(pattern, $("caseToggle").checked);
    const invalid = Boolean(pattern) && !re;

    $("search").setAttribute("aria-invalid", invalid ? "true" : "false");

    const list = state.records
      .filter(r => !re || Search.matches(re, r))
      .sort(sorters[$("sort").value] || sorters.newest);

    $("transactionsBody").innerHTML = list.map(r => {
      if (r.id === state.editingId) return editRow(r);
      const label = esc(r.description);
      return `
        <tr>
          <td>${Search.highlight(r.date, re)}</td>
          <td>${Search.highlight(r.description, re)}</td>
          <td><span class="pill">${Search.highlight(r.category, re)}</span></td>
          <td><strong>${esc(money(r.amount))}</strong></td>
          <td>
            <button type="button" class="btn small-btn" data-edit="${esc(r.id)}" aria-label="Edit ${label}">Edit</button>
            <button type="button" class="btn danger small-btn" data-delete="${esc(r.id)}" aria-label="Delete ${label}">Delete</button>
          </td>
        </tr>`;
    }).join("");

    $("emptyMessage").style.display = list.length ? "none" : "block";

    $("searchStatus").textContent = invalid
      ? "Invalid regular expression. Showing all transactions."
      : pattern
        ? list.length + " of " + state.records.length + " transactions match."
        : "";
  }

  function saveInlineEdit(id) {
    const values = {
      description: $("editDescription").value,
      amount: $("editAmount").value.trim(),
      category: $("editCategory").value,
      date: $("editDate").value
    };

    const errors = [
      ["editDescription", Validators.description(values.description)],
      ["editAmount", Validators.number(values.amount, false)],
      ["editCategory", Validators.category(values.category)],
      ["editDate", Validators.date(values.date)]
    ].filter(e => e[1]);

    if (errors.length) {
      $("editError").textContent = errors.map(e => e[1]).join(" ");
      $(errors[0][0]).focus();
      return;
    }

    const record = state.records.find(r => r.id === id);
    if (!record) return;

    record.description = Validators.collapseSpaces(values.description);
    record.amount = Number(values.amount);
    record.category = values.category;
    record.date = values.date;
    record.updatedAt = new Date().toISOString();

    state.editingId = null;
    persist();
    renderAll();
    message("Expense updated.");

    const button = document.querySelector('[data-edit="' + id + '"]');
    if (button) button.focus();
  }

  function cancelInlineEdit() {
    const id = state.editingId;
    state.editingId = null;
    renderTransactions();
    const button = document.querySelector('[data-edit="' + id + '"]');
    if (button) button.focus();
  }

  $("transactionsBody").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");
    const save = event.target.closest("[data-save]");
    const cancel = event.target.closest("[data-cancel]");

    if (edit) {
      state.editingId = edit.dataset.edit;
      renderTransactions();
      const field = $("editDescription");
      if (field) field.focus();
    }

    if (save) saveInlineEdit(save.dataset.save);
    if (cancel) cancelInlineEdit();

    if (del && confirm("Delete this expense?")) {
      state.records = state.records.filter(r => r.id !== del.dataset.delete);
      if (state.editingId === del.dataset.delete) state.editingId = null;
      persist();
      renderAll();
      message("Expense deleted.");
    }
  });

  $("transactionsBody").addEventListener("keydown", event => {
    if (!state.editingId || !event.target.closest(".editing")) return;

    if (event.key === "Escape") {
      cancelInlineEdit();
    } else if (event.key === "Enter" && event.target.tagName === "INPUT") {
      event.preventDefault();
      saveInlineEdit(state.editingId);
    }
  });

  // Search + sort controls (topbar search and page search stay in sync)
  $("search").addEventListener("input", () => {
    $("globalSearch").value = $("search").value;
    renderTransactions();
  });

  $("globalSearch").addEventListener("input", () => {
    $("search").value = $("globalSearch").value;
    if (state.view !== "transactions") showView("transactions", false);
    else renderTransactions();
  });

  $("caseToggle").addEventListener("change", renderTransactions);
  $("sort").addEventListener("change", renderTransactions);

  /* =====================================================
     ADD EXPENSE FORM
  ===================================================== */
  const formRules = {
    description: v => Validators.description(v),
    amount: v => Validators.number(v.trim(), false),
    category: v => Validators.category(v),
    date: v => Validators.date(v)
  };

  function showFieldError(name, text) {
    $(name + "Error").textContent = text;
    $(name).setAttribute("aria-invalid", text ? "true" : "false");
  }

  function renderCategoryOptions() {
    $("category").innerHTML = categoryOptions("");
  }

  function resetForm() {
    $("expenseForm").reset();
    Object.keys(formRules).forEach(name => showFieldError(name, ""));
    $("date").value = todayString();
    renderCategoryOptions();
  }

  Object.keys(formRules).forEach(name => {
    const eventName = name === "category" ? "change" : "input";
    $(name).addEventListener(eventName, () => showFieldError(name, formRules[name]($(name).value)));
  });

  $("expenseForm").addEventListener("submit", event => {
    event.preventDefault();

    let firstInvalid = null;
    Object.keys(formRules).forEach(name => {
      const text = formRules[name]($(name).value);
      showFieldError(name, text);
      if (text && !firstInvalid) firstInvalid = name;
    });

    if (firstInvalid) {
      message("Please fix the highlighted fields.");
      $(firstInvalid).focus();
      return;
    }

    const now = new Date().toISOString();
    state.records.push({
      id: nextId(),
      description: Validators.collapseSpaces($("description").value),
      amount: Number($("amount").value.trim()),
      category: $("category").value,
      date: $("date").value,
      createdAt: now,
      updatedAt: now
    });

    persist();
    resetForm();
    renderAll();
    showView("dashboard");
    message("Expense added.");
  });

  $("cancel").addEventListener("click", () => {
    resetForm();
    showView("dashboard");
  });

  /* =====================================================
     SETTINGS (budget, currency, categories, data)
  ===================================================== */
  function renderSettings() {
    $("budgetInput").value = state.budget;
    $("displayCurrency").value = state.settings.display;
    $("rateUSD").value = state.settings.rates.USD;
    $("rateEUR").value = state.settings.rates.EUR;
    $("settingsError").textContent = "";
    $("importError").textContent = "";

    $("settingsCategories").innerHTML = state.categories.map((c, i) => `
      <div class="setting-row" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <span>${esc(c)}</span>
        <button type="button" class="btn danger small-btn" data-remove="${i}" aria-label="Remove category ${esc(c)}">Remove</button>
      </div>
    `).join("");
  }

  $("saveSettings").addEventListener("click", () => {
    const budget = $("budgetInput").value.trim();
    const usd = $("rateUSD").value.trim();
    const eur = $("rateEUR").value.trim();

    const problems = [
      ["Budget", Validators.number(budget, true)],
      ["USD rate", Validators.number(usd, false)],
      ["EUR rate", Validators.number(eur, false)]
    ].filter(p => p[1]).map(p => p[0] + ": " + p[1]);

    if (problems.length) {
      $("settingsError").textContent = problems.join(" ");
      return;
    }

    $("settingsError").textContent = "";
    state.budget = Number(budget);
    state.settings = {
      display: $("displayCurrency").value,
      rates: { USD: Number(usd), EUR: Number(eur) }
    };

    persist();
    renderAll();
    message("Settings saved.");
  });

  function addCategory() {
    const name = Validators.collapseSpaces($("newCategory").value);
    let problem = Validators.category(name);

    if (!problem && state.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
      problem = "That category already exists.";
    }

    $("newCategoryError").textContent = problem;
    $("newCategory").setAttribute("aria-invalid", problem ? "true" : "false");
    if (problem) return;

    state.categories.push(name);
    $("newCategory").value = "";
    persist();
    renderSettings();
    renderCategoryOptions();
    message("Category added.");
  }

  $("addCategory").addEventListener("click", addCategory);

  $("newCategory").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCategory();
    }
  });

  $("settingsCategories").addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;

    if (state.categories.length < 2) {
      message("Keep at least one category.");
      return;
    }

    const index = Number(button.dataset.remove);
    const name = state.categories[index];

    if (confirm('Remove category "' + name + '"? Existing expenses will keep this category.')) {
      state.categories.splice(index, 1);
      persist();
      renderSettings();
      renderCategoryOptions();
      message("Category removed.");
    }
  });

  /* ---------- Export / Import / Reset ---------- */
  function exportData() {
    const file = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = "pesa-data.json";
    link.click();
    URL.revokeObjectURL(link.href);
    message("Data exported.");
  }

  $("exportBtn").addEventListener("click", exportData);
  $("exportTop").addEventListener("click", exportData);

  $("importBtn").addEventListener("click", () => $("importFile").click());

  $("importFile").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;

    $("importError").textContent = "";

    try {
      const result = parseData(JSON.parse(await file.text()));
      if (result.error) throw new Error(result.error);

      if (confirm("Replace current data with " + result.data.records.length + " imported records?")) {
        applyData(result.data);
        message("Data imported.");
      }
    } catch (err) {
      const reason = err instanceof SyntaxError ? "That file is not valid JSON." : err.message;
      $("importError").textContent = "Import failed: " + reason;
      message("Import failed.");
    } finally {
      event.target.value = "";
    }
  });

  $("resetBtn").addEventListener("click", () => {
    if (confirm("Reset PESA to its starter data?")) {
      applyData({
        records: seedRecords(),
        categories: DEFAULT_CATEGORIES.slice(),
        budget: 300000,
        settings: defaultSettings()
      });
      message("Data reset.");
    }
  });

  /* =====================================================
     RENDER ALL + INIT
  ===================================================== */
  function renderAll() {
    renderCategoryOptions();
    renderDashboard();
    renderTransactions();
    renderSettings();
  }

  function init() {
    // Load saved data (fall back to starter data if missing or malformed)
    const loaded = Storage.load();
    let notice = "";

    if (loaded && loaded.data) {
      Object.assign(state, loaded.data);
    } else {
      Object.assign(state, {
        records: seedRecords(),
        categories: DEFAULT_CATEGORIES.slice(),
        budget: 300000,
        settings: defaultSettings()
      });
      persist();
      if (loaded && loaded.error) notice = "Saved data was invalid, so starter data was loaded.";
    }

    $("date").value = todayString();
    renderAll();
    if (notice) message(notice);
  }

  init();
})();