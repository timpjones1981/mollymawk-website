// Writes the gig list from gigs.js into index.html, so it's in the page itself
// (visible to search engines and link previews, not just browsers running JavaScript),
// along with event details in the format Google uses for event listings.
// Run after editing gigs.js:   node build-gigs.js
const fs = require("fs");
const path = require("path");

global.window = {};
require(path.join(__dirname, "gigs.js"));
const gigs = (window.MOLLYMAWK_GIGS || []).slice();

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const parsed = gigs
  .map((g) => {
    const [y, m, d] = String(g.date || "").split("-").map(Number);
    return { g, y, m, d, dt: new Date(Date.UTC(y, (m || 1) - 1, d || 1)) };
  })
  .filter((x) => x.y && x.m && x.d && !isNaN(x.dt))
  .sort((a, b) => a.dt - b.dt);

// Today in UK terms is close enough: past gigs are also hidden by the page's own script.
const now = new Date();
const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const upcoming = parsed.filter((x) => x.dt.getTime() >= today);

// 1. Gig rows
const rows = upcoming.map(({ g, dt }) => {
  const label = `${DAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  const place = [g.venue, g.town].filter(Boolean).join(", ");
  const note = [g.doors ? "Doors " + g.doors : "", g.price].filter(Boolean).join(" · ");
  const tickets = /^https?:\/\//.test(g.tickets || "")
    ? `\n      <a class="tickets navtype" href="${esc(g.tickets)}" rel="noopener">Tickets</a>`
    : "";
  return `    <li class="gig" data-date="${esc(g.date)}">
      <div class="date label">${esc(label)}</div>
      <div><div class="place">${esc(place)}</div><div class="note">${esc(note)}</div></div>${tickets}
    </li>`;
});
const listHtml = `  <ol id="gig-list" class="gig-list"${rows.length ? "" : " hidden"}>
${rows.join("\n")}
  </ol>
  <div id="coming-soon" class="coming-soon"${rows.length ? " hidden" : ""}>
    <div class="big">Coming soon</div>
    <p>New dates are on the way. Want us at your venue? <a href="#contact">Get in touch</a>.</p>
  </div>`;

// 2. Event details for Google (schema.org MusicEvent)
const band = { "@type": "MusicGroup", name: "Mollymawk", url: "https://mollymawkband.com/" };
const toTime = (doors) => {
  const m = /^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/i.exec(String(doors || "").trim());
  if (!m) return "";
  let h = Number(m[1]);
  if (m[3] && m[3].toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3] && m[3].toLowerCase() === "am" && h === 12) h = 0;
  return `T${String(h).padStart(2, "0")}:${m[2] || "00"}`;
};
const events = upcoming.map(({ g }) => {
  const time = toTime(g.doors);
  const free = /free/i.test(g.price || "");
  const priceNum = (/£\s*(\d+(?:\.\d{1,2})?)/.exec(g.price || "") || [])[1];
  const ev = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: `Mollymawk at ${g.venue}`,
    startDate: g.date + time,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: g.venue, address: { "@type": "PostalAddress", addressLocality: g.town, addressCountry: "GB" } },
    performer: band,
    organizer: band,
    image: ["https://mollymawkband.com/assets/og.jpg"],
    description: "Mollymawk, a Devon-based folk band, playing upbeat songs and tunes from England, America and Europe.",
  };
  if (time) ev.doorTime = g.date + time;
  if (free) ev.isAccessibleForFree = true;
  if (free || priceNum || g.tickets) {
    ev.offers = { "@type": "Offer", price: free ? "0" : priceNum || undefined, priceCurrency: "GBP", availability: "https://schema.org/InStock", url: g.tickets || "https://mollymawkband.com/#gigs" };
  }
  return ev;
});
const jsonLd = events.length
  ? `<script type="application/ld+json">\n${JSON.stringify(events.length === 1 ? events[0] : events, null, 2).replace(/</g, "\\u003c")}\n</script>`
  : "";

// 3. Write both into index.html between their markers
const file = path.join(__dirname, "index.html");
let html = fs.readFileSync(file, "utf8");
const swap = (name, content) => {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(html)) throw new Error(`Markers for ${name} not found in index.html`);
  html = html.replace(re, `$1\n${content}\n$2`);
};
swap("GIGS", listHtml);
swap("GIG-EVENTS", jsonLd);
fs.writeFileSync(file, html);
console.log(`Wrote ${upcoming.length} upcoming gig(s) into index.html`);
