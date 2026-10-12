// Command main is the Go port of the Rails backend (epic cc-368). It is built
// and tested next to Rails but not deployed until the cutover ticket.
package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "2583"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /up", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
