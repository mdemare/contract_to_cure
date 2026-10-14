# Contract To Cure

A fan web implementation of the cooperative board game Pandemic, built with
Rails, Redis and plain JavaScript (with a Go port of the backend in `src/`).

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

> **Q8-cc: How do I set up and run the application locally with the correct Ruby, JavaScript, and Redis dependencies?**
>
> Short version: install Ruby 4.0.7 with Bundler 4, run `bundle install`, start
> a local Redis on localhost:6379, and run `bundle exec puma -C config/puma.rb`.
> Then open http://localhost:4567. The JavaScript needs no build step. Node.js
> 22+ is only needed to run the JS tests.

> **Q37-cc: How are tests organized, and which checks should run for backend, frontend, or cross-layer changes?**
>
> Run `make check` from the repository root. It runs the Ruby suite, the
> JavaScript tests in `test/js/*.mjs`, and `go vet` and `go test` for the Go
> port. Tests use mock Redis, so no Redis server is needed.

## More questions

| Topic | Command |
| --- | --- |
| How the repo is organized | `noca view Q1-cc` |
| Differences from the original Pandemic | `noca view Q3-cc` |
| Terminology ("action cards", phases, ...) | `noca view Q5-cc` |
| Rails controllers, game logic and frontend modules | `noca view Q6-cc` |
| Which docs are current and which are history | `noca view Q7-cc` |
| Environment configurations | `noca view Q9-cc` |
| HTTP routes and API conventions | `noca view Q45-cc,Q16-cc` |
| How game state is stored in Redis | `noca view Q12-cc` |
| Authentication | `noca view Q17-cc` |
| Adding a new game action or rule | `noca view Q36-cc` |
| Build, deployment and health checks | `noca view Q39-cc` |
| The Go backend port | `noca view Q41-cc` |
