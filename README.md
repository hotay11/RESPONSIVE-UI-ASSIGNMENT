# PESA - Student Finance Tracker

My theme: Student Finance Tracker

PESA is a small site which enables students to keep track of their spending, track where it is going, and limit their spending. The following is my Summative Assignment for Building Responsive UI. Made using only HTML, CSS and JavaScript (no frameworks).

*Live site (Github Pages): https://hotay11.github.io/RESPONSIVE-UI-ASSIGNMENT/
- **Repo:** https://github.com/hotay11/RESPONSIVE-UI-ASSIGNMENT
- Demo video (unlisted, 2-3 min): ADD YOUR VIDEO LINK HERE

---

## How to run it

The app reads its start records from `seed.json`, using `fetch()`. When you double click on the index.html file, the browser will prevent access to other pages and the page will appear empty. Please use one of these,

Open the above live site (easiest: no installation required).
To run a local server, go to the project folder and perform the following:
   ```
   python3 -m http.server 8000
   ```
   then open http://localhost:8000
3. **VS Code:** add Live Server extension and right click index.html and select "Open with Live Server".

If the records are still not recorded:
Navigate to Settings and select “Import JSON file” from the menu and then select `seed.json`.
Alternatively delete the saved data: DevTools, then Application, then Local Storage, delete pesa:records and pesa:settings and refresh.

## Features

List of pages: Dashboard, Transactions (records table), Add Expense (form), Settings, About.

- Dashboard: Total spending, Number of transactions, Top Category, % of cap used, a bar chart of the last 7 days, Top Categories, and the 5 most recent transactions.
- In Settings set a cap: The dashboard reflects how much remaining or how much exceeded. The cap will have the message as a polite announcement (`role="status"`). It's assertively announced over the cap (`role="alert"`).
Sort transactions by date (newest/oldest), description (A to Z / Z to A) and amount (high to low / low to high).
- **Regex search** will automatically filter the table based on the pattern typed. There is a check box for "Ignore case". Any match is enclosed in <mark>.
The Add form validates as you type. Every row can be edited and saved (or cancelled) without affecting other rows. Are you sure you want to delete? Editing updates `updatedAt`.
- Currencies: base currency (default TSh) + 2 other currencies, which I manually enter in Settings (no API). The total is displayed on the dashboard in those currencies.
The default for each category is Food, Books, Transport, Entertainment, Fees, Other. I can set up or delete categories in Settings.
- **Data:** all data is automatically saved in `localStorage`. Completes export operation, downloading a JSON file. Import does a check on the file before importing and retains the old data if the imported file is incorrect. Resets the starter data.

## Data model

Each record is in this format:

```json
{
  "id": "rec_0001",
  "description": "Lunch at cafeteria",
  "amount": 5000,
  "category": "Food",
  "date": "2026-10-08",
  "createdAt": "2026-10-08T08:00:00.000Z",
  "updatedAt": "2026-10-08T08:00:00.000Z"
}
```

There are 13 records in `seed.json`, some of which are tricky: a leap day (2024-02-29), a large number (999999.99), a small number (0.01), a one-letter description ("X"), a hyphenated category (Food-Court), a repeated word ("Laptop for for coding"), and special characters (`Tom & Jerry's <snacks>`).

Regex catalog

These are in scripts/main.js inside Validators.rules.

Rule	Pattern	Accepts	Rejects
Description (no leading/trailing space)	/^\S(?:.*\S)?$/	Lunch at cafeteria, X	 Lunch, Lunch , empty
Double spaces	/\s{2,}/ (used to reject)	Lunch now	Lunch  now
Amount	/^(0|[1-9]\d*)(\.\d{1,2})?$/	0, 5000, 12.50	012, 1.234, -5, abc
Date	/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/	2026-10-13, 2024-02-29	13/10/2026, 2026-13-01
Category	/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/	Food, Fast Food, Food-Court	Food123, -Food
Advanced: back-reference	/\b(\w+)\s+\1\b/i	the red bus	the the bus, The the bus
Currency code	/^[A-Za-z]{2,5}$/	USD, TSh	U, US1
Exchange rate	/^(0|[1-9]\d*)(\.\d{1,8})?$/ and must be above 0	0.0004	0, abc

The date check also builds a real Date and compares it, so 2026-02-31 and 2026-02-29 (not a leap year) are rejected even though they match the pattern.

Search patterns to try in the Transactions page (the search looks at description, category, amount and date together):

(coffee|tea) finds the coffee and tea records
\b(\w+)\s+\1\b finds repeated words like "for for"
^Lunch finds descriptions that start with Lunch
\.\d{2}\b finds amounts with cents (amounts are shown with 2 decimals, so most rows match)
(abc is an invalid pattern, so the app shows an error message instead of crashing
Keyboard map
Key	What it does
Tab / Shift+Tab	Move forward / back through links, buttons and fields
Tab (first press on page)	Shows the "Skip to main content" link
Enter on skip link	Jumps to the main content
Enter or Space on a nav button	Opens that page (focus moves to the page heading)
Enter in the Add form	Submits the form (errors are shown if something is wrong)
Enter in an edit row	Saves the row
Escape in an edit row	Cancels the edit and puts focus back on the Edit button
Arrow keys on the table	Scroll the table sideways on small screens (the table area can be focused)

Everything can be done with the keyboard only. I used a visible 3px blue focus outline (:focus-visible) so you can always see where you are.

Accessibility notes
Landmarks: header, nav, main, section, footer, and proper h1 / h2 headings.
Skip-to-content link at the top.
Every input has a <label>. Error messages are linked with aria-describedby, and invalid fields get aria-invalid.
Live regions: toast messages and the search result count use role="status"; the cap-exceeded message uses role="alert".
The chart has an aria-label and a hidden text summary for screen readers.
Highlighted matches use <mark>, and all text is escaped before it is inserted, so special characters can't break the page.
prefers-reduced-motion turns off animations for people who need that.
Color contrast check: ADD YOUR LIGHTHOUSE / CONTRAST CHECKER RESULT HERE.
Responsive design

I built it mobile-first. The CSS has breakpoints at 360px, 768px and 1024px (min-width media queries). On mobile there is a bottom navigation bar; on bigger screens there is a sidebar. Animations: a fade-in when switching pages, and smooth transitions on the progress bar and chart bars.

How to run the tests

Open tests.html the same way as the app (for example http://localhost:8000/tests.html). It runs small assertions for the validators, the regex search, the highlight function and the import validation. Each one shows PASS (green) or FAIL (red), and the top shows the total. All of them should pass.

Project structure
index.html        the page
seed.json         13 starter records
tests.html        test page
scripts/main.js   the JavaScript
styles/main.css   the CSS


About me
GitHub: https://github.com/hotay11
Email: j.hotay@alustudent.com
