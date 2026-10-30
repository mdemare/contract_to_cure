# Contract To Cure

A fan web implementation of the cooperative board game Pandemic, built with a
Go backend (`src/`), Redis and plain JavaScript.

The project documentation is kept in the `noca` knowledge base. Each entry is a
question with an answer that is checked against the code. Show one with
`noca view <key>`, for example `noca view Q44-cc`, or list them all with
`noca list question --all`.

## Start here

> **Q44-cc: What is this project, what can players do in it, and what is its licensing status?**
>
> "Contract to Cure" is a fan web implementation of the cooperative board game
> Pandemic. Players act as disease-fighting specialists who travel a world map,
> treat infections, build research stations and discover cures for four
> diseases before the outbreaks, cube supply or player deck run out.

> **Q8-cc: How do I set up and run the application locally with the correct Go, JavaScript, and Redis dependencies?**
>
> Short version: install Go (the version in `go.mod`), start a local Redis on
> localhost:6379, and run `make build && DEPLOYMENT_ENV=development ./main`.
> Then open http://localhost:2583. The JavaScript needs no build step. Node.js
> 22+ is only needed to run the JS tests.

> **Q37-cc: How are tests organized, and which checks should run for backend, frontend, or cross-layer changes?**
>
> Run `make check` from the repository root. It runs the JavaScript tests in
> `test/js/*.mjs`, then `go vet` and `go test -short` for the backend. This is the per-ticket
> gate; slow integration, stress and bulk fixture tests skip in short mode.
> Run `make full-check` for the complete suite, daily after at least ten new
> commits since the last successful full check. It reruns all Go tests without
> cached results or a timeout. Both targets fail if any stage fails. Tests use
> an in-memory Redis (miniredis), so no Redis server is needed.

## More questions

| Topic | Command |
| --- | --- |
| How the repo is organized | `noca view Q1-cc` |
| Differences from the original Pandemic | `noca view Q3-cc` |
| Terminology ("action cards", phases, ...) | `noca view Q5-cc` |
| HTTP handlers, game logic and frontend modules | `noca view Q6-cc` |
| Which docs are current and which are history | `noca view Q7-cc` |
| Environment configurations | `noca view Q9-cc` |
| HTTP routes and API conventions | `noca view Q45-cc,Q16-cc` |
| How game state is stored in Redis | `noca view Q12-cc` |
| Authentication | `noca view Q17-cc` |
| Adding a new game action or rule | `noca view Q36-cc` |
| Build, deployment and health checks | `noca view Q39-cc` |
| The contract fixtures and backend parity | `noca view Q41-cc` |
