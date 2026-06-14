export const US_AREA_CODE_TIMEZONES: Record<string, string> = {
  // Eastern Time (America/New_York)
  "201": "America/New_York",
  "207": "America/New_York",
  "212": "America/New_York",
  "215": "America/New_York",
  "216": "America/New_York",
  "223": "America/New_York",
  "239": "America/New_York",
  "267": "America/New_York",
  "305": "America/New_York",
  "313": "America/New_York",
  "315": "America/New_York",
  "321": "America/New_York",
  "332": "America/New_York",
  "347": "America/New_York",
  "352": "America/New_York",
  "386": "America/New_York",
  "401": "America/New_York",
  "404": "America/New_York",
  "407": "America/New_York",
  "413": "America/New_York",
  "470": "America/New_York",
  "484": "America/New_York",
  "508": "America/New_York",
  "516": "America/New_York",
  "518": "America/New_York",
  "561": "America/New_York",
  "570": "America/New_York",
  "585": "America/New_York",
  "607": "America/New_York",
  "617": "America/New_York",
  "631": "America/New_York",
  "646": "America/New_York",
  "678": "America/New_York",
  "704": "America/New_York",
  "716": "America/New_York",
  "718": "America/New_York",
  "727": "America/New_York",
  "754": "America/New_York",
  "772": "America/New_York",
  "781": "America/New_York",
  "786": "America/New_York",
  "813": "America/New_York",
  "814": "America/New_York",
  "838": "America/New_York",
  "845": "America/New_York",
  "856": "America/New_York",
  "857": "America/New_York",
  "860": "America/New_York",
  "862": "America/New_York",
  "904": "America/New_York",
  "914": "America/New_York",
  "917": "America/New_York",
  "929": "America/New_York",
  "941": "America/New_York",
  "954": "America/New_York",
  "978": "America/New_York",

  // Central Time (America/Chicago)
  "205": "America/Chicago",
  "214": "America/Chicago",
  "217": "America/Chicago",
  "224": "America/Chicago",
  "225": "America/Chicago",
  "228": "America/Chicago",
  "251": "America/Chicago",
  "256": "America/Chicago",
  "312": "America/Chicago",
  "318": "America/Chicago",
  "319": "America/Chicago",
  "334": "America/Chicago",
  "409": "America/Chicago",
  "469": "America/Chicago",
  "504": "America/Chicago",
  "512": "America/Chicago",
  "515": "America/Chicago",
  "601": "America/Chicago",
  "612": "America/Chicago",
  "615": "America/Chicago",
  "629": "America/Chicago",
  "630": "America/Chicago",
  "636": "America/Chicago",
  "682": "America/Chicago",
  "708": "America/Chicago",
  "713": "America/Chicago",
  "737": "America/Chicago",
  "769": "America/Chicago",
  "773": "America/Chicago",
  "815": "America/Chicago",
  "817": "America/Chicago",
  "832": "America/Chicago",
  "847": "America/Chicago",
  "872": "America/Chicago",
  "901": "America/Chicago",
  "903": "America/Chicago",
  "936": "America/Chicago",
  "940": "America/Chicago",
  "972": "America/Chicago",
  "979": "America/Chicago",

  // Mountain Time (America/Denver)
  "303": "America/Denver",
  "307": "America/Denver",
  "385": "America/Denver",
  "435": "America/Denver",
  "480": "America/Denver",
  "505": "America/Denver",
  "575": "America/Denver",
  "602": "America/Denver",
  "623": "America/Denver",
  "720": "America/Denver",
  "801": "America/Denver",
  "970": "America/Denver",

  // Pacific Time (America/Los_Angeles)
  "206": "America/Los_Angeles",
  "209": "America/Los_Angeles",
  "213": "America/Los_Angeles",
  "253": "America/Los_Angeles",
  "310": "America/Los_Angeles",
  "323": "America/Los_Angeles",
  "360": "America/Los_Angeles",
  "415": "America/Los_Angeles",
  "424": "America/Los_Angeles",
  "425": "America/Los_Angeles",
  "503": "America/Los_Angeles",
  "509": "America/Los_Angeles",
  "510": "America/Los_Angeles",
  "530": "America/Los_Angeles",
  "559": "America/Los_Angeles",
  "562": "America/Los_Angeles",
  "619": "America/Los_Angeles",
  "626": "America/Los_Angeles",
  "628": "America/Los_Angeles",
  "650": "America/Los_Angeles",
  "661": "America/Los_Angeles",
  "707": "America/Los_Angeles",
  "714": "America/Los_Angeles",
  "760": "America/Los_Angeles",
  "805": "America/Los_Angeles",
  "818": "America/Los_Angeles",
  "831": "America/Los_Angeles",
  "858": "America/Los_Angeles",
  "909": "America/Los_Angeles",
  "916": "America/Los_Angeles",
  "925": "America/Los_Angeles",
  "949": "America/Los_Angeles",
  "951": "America/Los_Angeles",
  "971": "America/Los_Angeles"
};

export function resolveTimezoneFromPhone(phone: string): string {
  // Strip any non-digit chars except leading +
  const sanitized = phone.replace(/[^\d+]/g, "");
  // Match US E.164: +1 followed by 10 digits
  const match = sanitized.match(/^\+1(\d{3})\d{7}$/);
  if (match) {
    const areaCode = match[1];
    const tz = US_AREA_CODE_TIMEZONES[areaCode];
    if (tz) {
      return tz;
    }
  }
  // Alternate match: just 10 digits starting with area code
  const match10 = sanitized.match(/^(\d{3})\d{7}$/);
  if (match10) {
    const areaCode = match10[1];
    const tz = US_AREA_CODE_TIMEZONES[areaCode];
    if (tz) {
      return tz;
    }
  }
  // Default to America/New_York
  return "America/New_York";
}
