// Line icons of the public pages (24×24, stroke = currentColor), drawn in the
// style of Lucide.
export const ICON_PATHS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  training: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  gym: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  meal: '<path d="M3 2v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V2M6 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Zm0 0v7"/>',
  drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5.5 12 3c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3"/>',
  barcode: '<path d="M3 5v14M7 5v14M11 5v14M15 5v14M18 5v14M21 5v14"/>',
  spark: '<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9Z"/><path d="M19 17v4M17 19h4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  // What a connected service brings in or gets back (the site's Connections).
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  steps: '<path d="M8 14c-1.9 0-3-1.8-3-4.5S6.3 4 8 4s3 2.4 3 5-1.1 5-3 5ZM16 10c1.9 0 3-1.8 3-4.5S17.7 0.9 16 .9 13 3.3 13 5.9s1.1 4.1 3 4.1ZM6.5 17.5h3M14.5 13.5h3"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 11a6.5 6.5 0 0 1 10 0M12 11l2-3"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  zones: '<path d="M4 20v-5M9.3 20v-9M14.7 20V7M20 20V3"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6.5-4-10-1.5 2-2.5 3-3 5.5C11 8.5 9.5 7.5 9 6c-2 2.5-4 5.3-4 9a7 7 0 0 0 7 7Z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  down: '<path d="M12 4v16M5 13l7 7 7-7"/>',
  up: '<path d="M12 20V4M5 11l7-7 7 7"/>'
};

export const icon = name => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICON_PATHS[name] + '</svg>';
