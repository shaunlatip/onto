/** Whether a place name reads with "the" in running English ("on the United
 *  States", "the Bay Area", "the Special Capital Region of Jakarta"). A
 *  heuristic over the display name — geocoders don't say — tuned to the kinds
 *  of places the search returns: countries, admin regions, metros, water. */

/** Names that take "the" but match none of the patterns below. */
const ALWAYS = new Set([
  "netherlands",
  "philippines",
  "bahamas",
  "gambia",
  "maldives",
  "seychelles",
  "comoros",
  "united kingdom",
  "czech republic",
  "democratic republic of the congo",
  "dominican republic",
  "central african republic",
  "vatican city",
  "holy see",
  "sahara",
  "arctic",
  "amazon",
  "alps",
  "andes",
  "himalayas",
  "rockies",
  "midwest",
  "middle east",
  "balkans",
  "caribbean",
  "mediterranean",
  "levant",
  "outback",
  "pacific northwest",
  "great lakes",
]);

/** "<Noun> of <Name>": Republic of Korea, Isle of Wight, Gulf of Mexico. */
const OF_FORM =
  /^(?:(?:special|autonomous|federal|federated|capital|national|metropolitan)\s+)*(?:republic|kingdom|state|states|commonwealth|federation|principality|grand duchy|emirate|sultanate|city|county|district|province|region|territory|isle|island|islands|gulf|bay|sea|cape|strait|municipality|borough|canton|department|prefecture)\s+of\s+/i;

/** Trailing words that make a name a descriptive phrase: the Bay Area, the
 *  Iberian Peninsula, the Northwest Territories, the European Union. */
const SUFFIX =
  /\s(?:area|region|peninsula|desert|basin|plateau|ocean|sea|river|delta|strait|canal|channel|islands|isles|keys|emirates|states|territories|mountains|lakes|union)$/i;

export function takesThe(name: string): boolean {
  const n = name.trim();
  // Already carries its own article ("The Hague").
  if (/^the\s/i.test(n)) return false;
  return ALWAYS.has(n.toLowerCase()) || OF_FORM.test(n) || SUFFIX.test(n);
}
