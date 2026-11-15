// The five crew characters, copied from apps/web/app/crew.tsx (the dashboard), as plain SVG strings.
const INK = "#1e2740";
const COLORS = { lead: "#2c6e6a", scout: "#d98b2b", tutor: "#c8553d", planner: "#6d7fb3", nudger: "#7a9e5a" };
const face = (y) => `<circle cx="48" cy="${y}" r="5" fill="${INK}"/><circle cx="72" cy="${y}" r="5" fill="${INK}"/><circle cx="49.6" cy="${y - 1.6}" r="1.5" fill="#fff"/><circle cx="73.6" cy="${y - 1.6}" r="1.5" fill="#fff"/><path d="M54 ${y + 11} q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
function character(kind, size = 64) {
  const c = COLORS[kind], shade = `color-mix(in srgb, ${c} 72%, #000)`, lite = `color-mix(in srgb, ${c} 45%, #fff)`;
  const body = {
    lead: `<path fill="${c}" d="M40 14h40a26 26 0 0 1 26 26v20a26 26 0 0 1-26 26H60l-20 20 3-20.2A26 26 0 0 1 14 60V40a26 26 0 0 1 26-26z"/>${face(46)}`,
    scout: `<rect x="16" y="34" width="88" height="70" rx="32" fill="${c}"/><circle cx="42" cy="56" r="17" fill="#fff"/><circle cx="78" cy="56" r="17" fill="#fff"/><rect x="54" y="52" width="12" height="8" fill="${shade}"/><circle cx="44" cy="57" r="7" fill="${INK}"/><circle cx="80" cy="57" r="7" fill="${INK}"/><circle cx="46.5" cy="54.5" r="2.2" fill="#fff"/><circle cx="82.5" cy="54.5" r="2.2" fill="#fff"/><path d="M54 88 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    tutor: `<path fill="${c}" d="M30 22h46l26 26v40a12 12 0 0 1-12 12H30a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12z"/><path fill="${lite}" d="M76 22l26 26H84a8 8 0 0 1-8-8z"/>${face(64)}`,
    planner: `<rect x="16" y="26" width="88" height="78" rx="16" fill="${c}"/><path fill="${shade}" d="M18 44h84v6H18z" opacity=".55"/><rect x="38" y="14" width="9" height="22" rx="4.5" fill="${lite}"/><rect x="73" y="14" width="9" height="22" rx="4.5" fill="${lite}"/>${face(70)}`,
    nudger: `<circle cx="60" cy="98" r="10" fill="${shade}"/><path fill="${c}" d="M60 14c-21 0-34 15-34 37v17L14 88a4 4 0 0 0 3.4 6h85.2a4 4 0 0 0 3.4-6L94 68V51c0-22-13-37-34-37z"/>${face(56)}`,
  }[kind];
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}
