// Provider responses may reorder object keys between reads. Keep their stored
// JSON deterministic so an unchanged sample does not become another D1 write.
// Array order and all values are preserved; no provider fields are discarded.
export function healthPointJson(payload) {
  return JSON.stringify(payload, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
}
