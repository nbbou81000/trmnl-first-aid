// First Aid Cards: pick one random card (and one of its images) on every refresh.
// Returning different data each time also makes TRMNL render a new screen,
// since it skips rendering when the merge variables have not changed.
function transform(input) {
  try {
    var cards = (input && input.cards) || [];
    if (!cards.length) return input;

    var fields = (input.trmnl && input.trmnl.plugin_settings && input.trmnl.plugin_settings.custom_fields_values) || {};
    var showSelf = String(fields.self_exam || "no").toLowerCase() === "yes";
    var pin = String(fields.pin_card || "").trim().toLowerCase();

    var pool = cards.filter(function (c) { return showSelf || c.cat !== "selfexam"; });
    if (!pool.length) pool = cards;

    var card = null;
    if (pin) card = cards.filter(function (c) { return c.id === pin; })[0] || null;
    if (!card) card = pool[Math.floor(Math.random() * pool.length)];

    var imgs = card.imgs || [];
    var chosen = imgs.length ? [imgs[Math.floor(Math.random() * imgs.length)]] : [];

    return {
      lang: input.lang,
      ui: input.ui,
      numbers: input.numbers,
      img_base: input.img_base,
      cards: [{ id: card.id, cat: card.cat, t: card.t, w: card.w, s: card.s, imgs: chosen }],
      total_cards: cards.length,
      picked_at: Date.now()
    };
  } catch (e) {
    return input;
  }
}
