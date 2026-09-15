import core from "./v323.js";

const VERSION = "final-5-cookbook-v3.2.3.1";

function sanitizePlannedPayload(row) {
  if (!row?.payload_json) return row;

  try {
    const payload = JSON.parse(row.payload_json);
    const name = String(payload.name || payload.title || "").toLowerCase();

    // Intervals.icu uses intensity=interval for individual workout steps.
    // That must not classify an entire Endurance/Z2 workout as an interval session.
    const enduranceNamed = /\b(endurance|z1|z2|recovery|easy)\b/.test(name);
    if (enduranceNamed && typeof payload.description === "string") {
      payload.description = payload.description.replace(/\s*intensity\s*=\s*interval\b/gi, "");
    }

    return { ...row, payload_json: JSON.stringify(payload) };
  } catch {
    return row;
  }
}

function wrapDB(db) {
  const originalPrepare = db.prepare.bind(db);

  return {
    prepare(query) {
      const statement = originalPrepare(query);
      const plannedQuery = String(query).includes("data_type = 'planned-workout'");

      const wrapResult = (result, single = false) => {
        if (!plannedQuery) return result;
        if (single) return sanitizePlannedPayload(result);
        if (!result?.results) return result;
        return {
          ...result,
          results: result.results.map(sanitizePlannedPayload)
        };
      };

      const wrapBound = (bound) => ({
        all: async (...args) => wrapResult(await bound.all(...args)),
        first: async (...args) => wrapResult(await bound.first(...args), true),
        run: (...args) => bound.run(...args),
        raw: (...args) => bound.raw(...args),
        values: (...args) => bound.values(...args)
      });

      return {
        bind: (...args) => wrapBound(statement.bind(...args)),
        all: async (...args) => wrapResult(await statement.all(...args)),
        first: async (...args) => wrapResult(await statement.first(...args), true),
        run: (...args) => statement.run(...args),
        raw: (...args) => statement.raw(...args),
        values: (...args) => statement.values(...args)
      };
    }
  };
}

function patchedResponse(response) {
  return response.json().then(data => {
    if (data?.final && Number.isFinite(Number(data.final.estimatedPlannedRideCalories))) {
      // Keep the legacy aggregate field consistent with the corrected V3.2.3
      // planned ride calculation. Actual completed activities still override
      // planned workouts elsewhere in the core engine.
      data.final.estimatedPlannedActivityCalories = Number(data.final.estimatedPlannedRideCalories);
    }

    if (Number.isFinite(Number(data?.plannedRideCalories)) && data?.trainingContext) {
      data.plannedRideCalories = Number(data.plannedRideCalories);
      if (data.trainingContext) {
        data.trainingContext.plannedRideCalories = Number(data.plannedRideCalories);
      }
    }

    return Response.json(data, { status: response.status, headers: response.headers });
  });
}

function patchedEnv(env) {
  return { ...env, DB: wrapDB(env.DB) };
}

export default {
  async scheduled(controller, env, ctx) {
    return core.scheduled(controller, env, ctx);
  },

  async fetch(request, env, ctx) {
    const response = await core.fetch(request, patchedEnv(env), ctx);
    const pathname = new URL(request.url).pathname;

    if (pathname === "/") {
      return Response.json({
        status: "ok",
        service: "health-api",
        version: VERSION
      });
    }

    if (pathname === "/analysis/energy") {
      return patchedResponse(response);
    }

    return response;
  }
};
