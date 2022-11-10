package PACKAGE

// Welcome to Cloud Functions for Firebase for Golang!
// To get started, uncomment the below code or create your own.
// Deploy with `firebase deploy`

/*
import (
	"context"
	"fmt"

	"github.com/FirebaseExtended/firebase-functions-go/https"
	"github.com/FirebaseExtended/firebase-functions-go/pubsub"
	"github.com/FirebaseExtended/firebase-functions-go/runwith"
)

var HelloWorld = https.Function{
	RunWith: https.Options{
		AvailableMemoryMB: 256,
	},
	Callback: func(w https.ResponseWriter, req *https.Request) {
		fmt.Println("Hello, world!")
		fmt.Fprintf(w, "Hello, world!\n")
	},
}

var PubSubFunction = pubsub.Function{
	EventType: pubsub.MessagePublished,
	Topic:     "topic",
	RunWith: runwith.Options{
		AvailableMemoryMB: 256,
	},
	Callback: func(ctx context.Context, message pubsub.Message) error {
		fmt.Printf("Got Pub/Sub event %+v", message)
		return nil
	},
}
*/
