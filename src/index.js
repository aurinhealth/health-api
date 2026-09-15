export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        status: "ok",
        service: "health-api"
      });
    }

    if (url.pathname === "/auth-test") {
      try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            refresh_token: env.GOOGLE_REFRESH_TOKEN,
            grant_type: "refresh_token"
          })
        });

        const data = await response.json();

        if (!response.ok) {
          return Response.json(
            {
              status: "error",
              google_status: response.status,
              error: data.error,
              error_description: data.error_description
            },
            { status: 500 }
          );
        }

        return Response.json({
          status: "ok",
          google_oauth: "working",
          token_type: data.token_type,
          expires_in: data.expires_in,
          has_access_token: Boolean(data.access_token)
        });
      } catch (error) {
        return Response.json(
          {
            status: "error",
            message: error.message
          },
          { status: 500 }
        );
      }
    }

    return Response.json(
      { error: "Not found" },
      { status: 404 }
    );
  }
};
