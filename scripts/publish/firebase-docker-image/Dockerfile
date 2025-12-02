FROM node:lts-alpine AS app-env

# Install Python and Java and pre-cache emulator dependencies.
# We do so in separate steps to make it simple to identify the source of errors and vulnerabilities.
RUN apk add --no-cache python3
RUN apk add --no-cache py3-pip
RUN apk add --no-cache openjdk21-jre
RUN apk add --no-cache bash

RUN apk update && apk upgrade


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