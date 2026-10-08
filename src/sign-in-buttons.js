// "Sign in with Google" and "Sign in with Apple" buttons, drawn the way Google's and Apple's
// branding guidelines ask: the official marks, the official wording, brand colours that switch
// with the theme (Google: white or #131314 with the G on white; Apple: black on light, white on
// dark), and both buttons the same size so neither is less prominent.
// The colours are fixed by Google and Apple, so they live here and not in the theme tokens.

const GOOGLE_G = '<svg class="sign-in-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>';
const APPLE_MARK = '<svg class="sign-in-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';

const KEY_MARK = '<svg class="sign-in-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';

// Words that differ between the two tabs of the sign-in screen; the card's data-mode shows one.
const byMode = (signIn, register) => '<span data-for="signin">' + signIn + '</span><span data-for="register">' + register + '</span>';

// The e-mail step: the address first, then (unless this device has a passkey for it) the six-digit code.
// autocomplete "webauthn" lets the browser offer the device's passkeys right in the field.
const EMAIL_CODE = '<div class="sign-in-or"><span>nebo e-mailem</span></div>'
  + '<form id="emailStartForm" class="email-code-row" novalidate><input id="loginEmail" type="email" autocomplete="username webauthn" inputmode="email" required placeholder="tvůj e-mail" aria-label="E-mail"><button class="btn" type="submit">' + byMode('Pokračovat', 'Poslat kód') + '</button></form>'
  + '<p class="small email-hint" id="emailHint">' + byMode('Má-li tohle zařízení k e-mailu přístupový klíč, přihlásíš se jím. Jinak ti pošleme kód.', 'Pošleme ti šestimístný kód. Potom si můžeš přidat přístupový klíč.') + '</p>'
  + '<form id="emailCodeForm" class="email-code" novalidate hidden><p class="small">Pokud má tahle adresa do Loadwise přístup, přijde na ni šestimístný kód. Platí 10 minut.</p><p class="email-code-address" id="codeAddress" data-no-i18n></p>'
  + '<div class="email-code-row"><input id="loginCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required placeholder="123456" aria-label="Kód z e-mailu"><button class="btn primary" type="submit">' + byMode('Přihlásit se', 'Založit účet') + '</button></div>'
  + '<p class="small email-code-actions"><button class="link-btn" type="button" id="resendCode">Poslat kód znovu</button><span aria-hidden="true">·</span><button class="link-btn" type="button" id="changeEmail">Jiný e-mail</button></p></form>';

// Czech wording; the app's English dictionary turns it into "Sign in / Sign up with Google / Apple".
// The passkey button is only for browsers that cannot offer passkeys in the e-mail field;
// the page shows it when it knows that.
export function signInButtons({ apple = false, email = false } = {}) {
  return '<a class="sign-in-btn sign-in-google" href="/auth/google"><span class="sign-in-logo">' + GOOGLE_G + '</span><span>' + byMode('Přihlásit se přes Google', 'Zaregistrovat se přes Google') + '</span></a>'
    + (apple ? '<a class="sign-in-btn sign-in-apple" href="/auth/apple">' + APPLE_MARK + '<span>' + byMode('Přihlásit se přes Apple', 'Zaregistrovat se přes Apple') + '</span></a>' : '')
    + '<button class="sign-in-btn sign-in-passkey" type="button" id="passkeySignIn" data-for="signin" hidden>' + KEY_MARK + '<span>Přihlásit se přístupovým klíčem</span></button>'
    + (email ? EMAIL_CODE : '')
    + '<p id="loginStatus" class="small login-status" role="status" aria-live="polite"></p>';
}

const GOOGLE_LIGHT = '.sign-in-google{background:#fff;color:#1f1f1f;border-color:#747775}.sign-in-google .sign-in-logo{width:20px;height:20px;margin-left:0;background:none}';
const APPLE_LIGHT = '.sign-in-apple{background:#000;color:#fff;border-color:#000}';
const light = rules => rules.replace(/(^|\})\./g, '$1:root[data-theme="light"] .');
const systemLight = rules => '@media (prefers-color-scheme:light){' + rules.replace(/(^|\})\./g, '$1:root:not([data-theme="dark"]) .') + '}';

// Single columns are minmax(0,1fr) so no row widens the card past a narrow screen; there the e-mail field and its button stack.
export const signInButtonsCss = `
.login-card{width:min(400px,100%);display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:28px;text-align:center}
@media (max-width:380px){.login-card{padding:22px 16px}}
.login-card h2,.login-card p{margin:0}
.login-logo{display:block;width:48px;height:48px;margin:0 auto;border-radius:12px}
.login-links{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.login-links a{color:var(--muted)}
.sign-in-buttons{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.sign-in-btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:0 16px;border:1px solid;border-radius:999px;text-decoration:none;text-align:center;transition:filter .15s ease}
.sign-in-btn:hover{filter:brightness(.96)}
.sign-in-btn:focus-visible{outline:2px solid var(--primary);outline-offset:3px}
.sign-in-mark{display:block;width:18px;height:18px}
.sign-in-google{font:500 14px/20px "Google Sans",Roboto,Arial,sans-serif;letter-spacing:.25px;background:#131314;color:#e3e3e3;border-color:#8e918f}
.sign-in-google .sign-in-logo{display:grid;place-items:center;width:28px;height:28px;margin-left:-6px;border-radius:50%;background:#fff}
.sign-in-apple{font:500 15px/20px -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;background:#fff;color:#000;border-color:#fff}
.sign-in-apple .sign-in-mark{width:17px;height:17px;margin-top:-3px}
.login-card [hidden]{display:none!important}
.login-card:not([data-mode="register"]) [data-for="register"],.login-card[data-mode="register"] [data-for="signin"]{display:none!important}
.login-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:999px;background:color-mix(in srgb,var(--muted) 14%,var(--bg))}
.login-tabs button{min-height:40px;padding:0 12px;border:0;border-radius:999px;background:none;color:var(--muted);font:inherit;font-weight:600;cursor:pointer}
.login-tabs button[aria-selected="true"]{background:var(--bg);color:var(--text);box-shadow:0 0 0 1px color-mix(in srgb,var(--muted) 45%,var(--bg)),0 1px 3px rgb(0 0 0/.18)}
.login-tabs button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.email-hint{color:var(--muted)}
.sign-in-passkey{font:500 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:transparent;color:var(--text);border-color:color-mix(in srgb,var(--muted) 55%,var(--bg));cursor:pointer}
.sign-in-passkey:disabled{opacity:.6;cursor:default}
.sign-in-or{display:flex;align-items:center;gap:10px;margin:4px 0 0;color:var(--muted);font-size:12px}
.sign-in-or:before,.sign-in-or:after{content:"";flex:1;height:1px;background:color-mix(in srgb,var(--muted) 30%,var(--bg))}
.email-code{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.email-code p{margin:0}
.email-code-row{display:flex;flex-wrap:wrap;gap:8px}
.email-code-row input{flex:1 1 10em;min-width:0;min-height:44px;padding:0 16px;border:1px solid color-mix(in srgb,var(--muted) 40%,var(--bg));border-radius:999px;background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);font:inherit;font-size:16px}
.email-code-row input:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.email-code-row .btn{flex:1 0 auto;min-height:44px;padding:0 18px;border-radius:999px;white-space:nowrap}
#loginCode{letter-spacing:.25em;font-variant-numeric:tabular-nums}
.email-code-address{font-weight:650;overflow-wrap:anywhere}
.email-code-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.link-btn{padding:0;border:0;background:none;color:var(--primary-text);font:inherit;text-decoration:underline;cursor:pointer}
.link-btn:disabled{color:var(--muted);text-decoration:none;cursor:default}
.login-status:empty{display:none}
${light(GOOGLE_LIGHT + APPLE_LIGHT)}
${systemLight(GOOGLE_LIGHT + APPLE_LIGHT)}
`;
