# Fix Deployment Healthcheck Route

## What went right

The fix stayed focused on the deployment contract. Both `/up` and `/health` now route to Rails' built-in health controller, so the platform and compose healthchecks can use a lightweight endpoint that does not depend on the game UI or authentication flow.

The compose runtime configuration now sets `PORT=2583` explicitly for staging and production, matching the container port exposed by the service. Focused endpoint coverage was added so both healthcheck paths return success during API regression runs.

## What went wrong

The deployment configuration expected a healthcheck route and a fixed internal service port, but the application did not expose the route and the compose files did not set the `PORT` value consumed by Puma. That left the runtime contract split between infrastructure configuration and Rails defaults.

The gap was easy to miss because normal root-page and API endpoint checks do not exercise the healthcheck path used by orchestration.

## Final thoughts

Healthcheck endpoints are now explicit application routes and the container port is declared in the deployment compose files. Keeping this contract covered by endpoint tests should catch future routing or runtime-port regressions before they reach staging or production.
