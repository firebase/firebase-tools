FROM node:lts-alpine AS app-env

# Install Python (for Cloud Functions) and Java (for emulators) and pre-cache emulator dependencies.
RUN apk update && \
    apk add --no-cache python3 openjdk21-jre-headless bash && \
    apk upgrade && \
    wget https://bootstrap.pypa.io/get-pip.py && \
    python3 get-pip.py --no-cache-dir --break-system-packages && \
    rm get-pip.py && \
    rm -rf /usr/lib/python*/ensurepip && \
    rm -rf /var/cache/apk/*


RUN mkdir -p /usr/local/node_packages/
COPY package.json /usr/local/node_packages/
COPY package-lock.json /usr/local/node_packages/

WORKDIR /usr/local/node_packages/
RUN npm install && npm update
ENV PATH="/usr/local/node_packages/node_modules/.bin:${PATH}"

WORKDIR /

RUN firebase setup:emulators:database && \
    firebase setup:emulators:firestore && \
    firebase setup:emulators:pubsub && \
    firebase setup:emulators:storage && \
    firebase setup:emulators:dataconnect && \
    firebase setup:emulators:ui

ENTRYPOINT [ "firebase" ]