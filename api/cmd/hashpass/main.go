package main

import (
	"fmt"
	"os"

	"github.com/gestaozabele/municipio/internal/auth"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: hashpass <password>")
		os.Exit(1)
	}

	hash, err := auth.Hash(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "hash error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(hash)
}
