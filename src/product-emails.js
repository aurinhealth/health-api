// E-mails about new Aurin features to our own customers (audit of restrictions 2026-11-25,
// point 1): soft opt-in under § 7(3) of Czech Act 480/2004 Coll. The choice is kept in
// user_consents as 'product_emails' (consent.js). Every such e-mail is marked as a commercial
// message and carries a signed link that unsubscribes without signing in, also as a one-click
// unsubscribe (RFC 8058). Nothing sends these e-mails yet: a lawyer confirms the texts first.
import { signText, sessionSecret, timingSafeEqualString } from "./dashboard-auth.js";
import { appOrigin } from "./app-origin.js";
import { productEmailsStatement } from "./consent.js";

const PATH = /^\/email\/unsubscribe\/(\d{1,12})\/([A-Za-z0-9_-]{20,})$/;
// No expiry: an unsubscribe link has to work in any old e-mail.
const signature = (env, uid) => signText(`product-emails:${uid}`, sessionSecret(env));

export async function unsubscribeLink(env, uid) {
  if (!sessionSecret(env)) return null;
  return `${appOrigin(env)}/email/unsubscribe/${Number(uid)}/${await signature(env, uid)}`;
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TEXT = {
  cs: {
    label: "Obchodní sdělení od Aurinu",
    why: "Tento e-mail dostáváš jako zákazník Aurinu (Petr Bouma, support@aurin.health).",
    stop: "Odhlásit e-maily o novinkách",
    stopText: "Odhlásit se můžeš tímto odkazem nebo v aplikaci v Nastavení → Oznámení.",
    page: "E-maily o novinkách Aurinu",
    ask: "Už ti nebudeme posílat e-maily o novinkách. E-maily k účtu, třeba kódy pro přihlášení, chodí dál.",
    confirm: "Odhlásit",
    done: "Hotovo. E-maily o novinkách ti už nepošleme. Znovu je zapneš v aplikaci v Nastavení → Oznámení.",
    missing: "Odkaz není platný."
  },
  en: {
    label: "A commercial message from Aurin",
    why: "You get this e-mail as an Aurin customer (Petr Bouma, support@aurin.health).",
    stop: "Unsubscribe from product news",
    stopText: "Unsubscribe with this link or in the app under Settings → Notifications.",
    page: "Aurin product news",
    ask: "We will stop sending you e-mails about Aurin news. E-mails about your account, such as sign-in codes, keep coming.",
    confirm: "Unsubscribe",
    done: "Done. We won't send you product news any more. Turn it back on in the app under Settings → Notifications.",
    missing: "This link is not valid."
  }
};

// {subject, text, html, headers} for one product news e-mail; paragraphs are plain text.
export function productNewsEmail(lang, { subject, paragraphs, unsubscribe }) {
  if (!unsubscribe) throw new Error("A product news e-mail needs its unsubscribe link.");
  const t = TEXT[lang === "en" ? "en" : "cs"];
  const p = text => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escape(text)}</p>`;
  const small = `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#71717a">${escape(t.why)} ${escape(t.stopText)} <a href="${escape(unsubscribe)}" style="color:#71717a">${escape(t.stop)}</a></p>`;
  const html = `<!doctype html><html lang="${lang === "en" ? "en" : "cs"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:24px 16px;background:#f4f4f5;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">`
    + `<div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px">`
    + `<p style="margin:0 0 4px;font-size:17px;font-weight:700">Aurin</p><p style="margin:0 0 18px;font-size:12px;color:#71717a">${escape(t.label)}</p>`
    + paragraphs.map(p).join("") + small + `</div></body></html>`;
  const text = [`${t.label}`, "", ...paragraphs.flatMap(line => [line, ""]), `${t.why} ${t.stopText}`, `${t.stop}: ${unsubscribe}`, ""].join("\n");
  return {
    subject: `${t.label}: ${String(subject).replace(/[\x00-\x1f\x7f]+/g, " ")}`,
    text, html,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  };
}

function page(lang, body, status = 200) {
  const t = TEXT[lang];
  return new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(t.page)}</title></head>`
    + `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:40px auto;padding:0 16px;color:#18181b"><h1 style="font-size:20px">${escape(t.page)}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}

// GET /email/unsubscribe/<user>/<signature>: a page with one button (mail scanners that open
// links must not unsubscribe anyone). POST: unsubscribes, from that button or as the mail
// app's one-click unsubscribe. userExists(id) says whether the account is still there.
export async function handleUnsubscribe(request, env, url, { userExists }) {
  const lang = /^(cs|sk)\b/i.test(request.headers.get("accept-language") || "cs") ? "cs" : "en";
  const t = TEXT[lang];
  const match = PATH.exec(url.pathname);
  const valid = match && sessionSecret(env) && timingSafeEqualString(match[2], await signature(env, match[1]));
  if (!valid || !["GET", "POST"].includes(request.method)) return page(lang, `<p>${escape(t.missing)}</p>`, 404);
  const uid = Number(match[1]);
  if (request.method === "GET") return page(lang, `<p>${escape(t.ask)}</p><form method="post"><button type="submit" style="font-size:16px;padding:10px 18px;border-radius:10px;border:0;background:#18181b;color:#fff">${escape(t.confirm)}</button></form>`);
  // A deleted account has nothing left to unsubscribe.
  if (await userExists(uid)) await productEmailsStatement(env.DB, uid, false).run();
  return page(lang, `<p>${escape(t.done)}</p>`);
}
