import app from "./v400.js";

const SPREADSHEET_ID = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
const SHEET_GID = "585189491";

export default {
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/test/google-sheets-auth") {
      return testGoogleSheetsAuth(env);
    }

    return app.fetch(request, env, ctx);
  }
};

async function testGoogleSheetsAuth(env) {
  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
      return Response.json({
        status: "error",
        message: "Missing Google OAuth environment variables"
      }, { status: 500 });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token"
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return Response.json({
        status: "error",
        step: "oauth_token",
        google_status: tokenResponse.status,
        error: tokenData.error || null,
        error_description: tokenData.error_description || null
      }, { status: 502 });
    }

    const infoResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(tokenData.access_token)}`
    );
    const info = await infoResponse.json();

    if (!infoResponse.ok) {
      return Response.json({
        status: "error",
        step: "tokeninfo",
        google_status: infoResponse.status,
        error: info.error || null
      }, { status: 502 });
    }

    const scopes = String(info.scope || "")
      .split(" ")
      .filter(Boolean);

    const sheetsScope = "https://www.googleapis.com/auth/spreadsheets";
    const driveFileScope = "https://www.googleapis.com/auth/drive.file";

    return Response.json({
      status: "ok",
      spreadsheet_id: SPREADSHEET_ID,
      gid: SHEET_GID,
      scopes,
      sheets_scope: scopes.includes(sheetsScope),
      drive_file_scope: scopes.includes(driveFileScope)
    });
  } catch (error) {
    return Response.json({
      status: "error",
      message: error.message
    }, { status: 500 });
  }
}
