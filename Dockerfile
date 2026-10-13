# Runtime image for the Go binary. `make` builds ./main on the host
# (CGO_ENABLED=0, so it is static) before docker compose builds this image.
FROM alpine:3.24

ARG UID=1000
ARG GID=1000
RUN addgroup -g "$GID" app && adduser -u "$UID" -G app -s /bin/sh -D app

WORKDIR /app

# .version (the deployed commit count) is written by the deploy scripts; the
# glob keeps a local build working without it.
COPY main .versio[n] ./
# public/cities.json is read at runtime; nginx serves the rest of public/
# from the checkout.
COPY public ./public

USER app

EXPOSE 2583
CMD ["./main"]
