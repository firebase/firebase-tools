FROM node:lts-alpine AS app-env

# Install Python and Java and pre-cache emulator dependencies.
RUN apk add --no-cache python3 py3-pip openjdk11-jre bash && \
    apk update && \
    apk upgrade


RUN mkdir -p /usr/local/node_packages/
COPY package.json /usr/local/node_packages/
COPY package-lock.json /usr/local/node_packages/

WORKDIR /usr/local/node_packages/
RUN npm install
ENV PATH="/usr/local/node_packages/node_modules/.bin:${PATH}"

WORKDIR /

RUN firebase setup:emulators:database && \
    firebase setup:emulators:firestore && \
    firebase setup:emulators:pubsub && \
    firebase setup:emulators:storage && \
    firebase setup:emulators:dataconnect && \
    firebase setup:emulators:ui && \
    rm -rf /var/cache/apk/*

ENTRYPOINT [ "firebase" ]