FROM node:lts-alpine AS app-env

# Install Python and Java and pre-cache emulator dependencies.
RUN apk add --no-cache python3 py3-pip openjdk11-jre bash && \
    npm install -g firebase-tools && \
    firebase setup:emulators:database && \
    firebase setup:emulators:firestore && \
    firebase setup:emulators:pubsub && \
    firebase setup:emulators:storage && \
    firebase setup:emulators:dataconnect && \
    firebase setup:emulators:ui && \
    rm -rf /var/cache/apk/*

ENTRYPOINT [ "firebase" ]