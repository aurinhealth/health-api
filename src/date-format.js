// Intl.DateTimeFormat is costly to create (a fraction of a millisecond each) and
// many places format thousands of rows per request; one formatter per setting
// is enough.
const formatters = new Map();
export function dateFormat(locale, options = {}) {
  const key = locale + JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) formatters.set(key, f = new Intl.DateTimeFormat(locale, options));
  return f;
}
