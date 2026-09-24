/** World region for a country, by ISO 3166-1 alpha-2 code — the secondary
 *  line for country results, whose OSM display name is just the name again.
 *  Roughly the UN M49 subregions, merged and renamed to everyday terms. */
const REGIONS: Record<string, string> = {
  "North America": "us ca mx gl bm pm",
  "Central America": "bz cr sv gt hn ni pa",
  Caribbean:
    "ag ai aw bb bl bq bs cu cw dm do gd gp ht jm kn ky lc mf mq ms pr sx tc tt vc vg vi",
  "South America": "ar bo br cl co ec fk gf gy pe py sr uy ve gs",
  Europe:
    "ad al at ax ba be bg by ch cy cz de dk ee es fi fo fr gb gg gi gr hr hu ie im is it je li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sj sk sm ua va xk",
  "Middle East": "ae bh il iq ir jo kw lb om ps qa sa sy tr ye",
  Caucasus: "am az ge",
  "Central Asia": "kz kg tj tm uz",
  "South Asia": "af bd bt in io lk mv np pk",
  "East Asia": "cn hk jp kp kr mn mo tw",
  "Southeast Asia": "bn id kh la mm my ph sg th tl vn cx cc",
  "North Africa": "dz eg ly ma sd tn eh",
  "West Africa": "bf bj cv ci gh gm gn gw lr ml mr ne ng sh sl sn tg",
  "Central Africa": "ao cf cg cd cm ga gq st td",
  "East Africa":
    "bi dj er et ke km mg mu mw mz re rw sc so ss tz ug yt zm zw",
  "Southern Africa": "bw ls na sz za",
  Oceania:
    "as au ck fj fm gu ki mh mp nc nf nr nu nz pf pg pn pw sb tk to tv um vu wf ws",
  Antarctica: "aq bv hm tf",
};

const BY_CODE = new Map(
  Object.entries(REGIONS).flatMap(([region, codes]) =>
    codes.split(" ").map((c) => [c, region] as const),
  ),
);

export function worldRegion(countryCode: string | undefined): string | null {
  return (countryCode && BY_CODE.get(countryCode.toLowerCase())) || null;
}
