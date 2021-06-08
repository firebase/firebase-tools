package functions

import (
	"fmt"
	"net/http"
)

func HelloWorld(w http.ResponseWriter, req *http.Request) {
	fmt.Printf("Hello, world!");
	fmt.Fprintf(w, "Hello, world!");
}
