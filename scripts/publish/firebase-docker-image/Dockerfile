FROM us-docker.pkg.dev/artifact-foundry-prod/docker-3p-trusted/node:24-trixie-slim AS app-env

# Upgrade global npm from Airlock to avoid vulnerabilities in npm's bundled
# dependencies (e.g., glob/minimatch) without pulling from public npmjs.org.
RUN --mount=type=secret,id=airlock_token \
    set -e && \
    AIRLOCK_TOKEN="$(cat /run/secrets/airlock_token)" && \
    trap 'rm -f /tmp/.npmrc' EXIT && \
    (umask 077 && printf "registry=https://us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/\n//us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/:always-auth=true\n//us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/:_authToken=%s\n" "${AIRLOCK_TOKEN}" > /tmp/.npmrc) && \
    npm --userconfig=/tmp/.npmrc install -g npm@latest

# Install Python (for Cloud Functions) and Java 21 (for emulators) from Airlock APT.
RUN --mount=type=secret,id=airlock_token \
    set -e && \
    export DEBIAN_FRONTEND=noninteractive && \
    AIRLOCK_TOKEN="$(cat /run/secrets/airlock_token)" && \
    trap 'rm -rf /etc/apt/auth.conf /etc/apt/sources.list.d/airlock.list /var/lib/apt/lists/*' EXIT && \
    (umask 077 && printf "machine us-apt.pkg.dev login oauth2accesstoken password %s\n" "${AIRLOCK_TOKEN}" > /etc/apt/auth.conf) && \
    chmod 600 /etc/apt/auth.conf && \
    rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* && \
    printf "deb [trusted=yes] https://us-apt.pkg.dev/projects/artifact-foundry-prod standard-debian-trixie-3p-l1 main\ndeb [trusted=yes] https://us-apt.pkg.dev/remote/artifact-foundry-prod/debian-3p-remote-trixie trixie main\ndeb [trusted=yes] https://us-apt.pkg.dev/remote/artifact-foundry-prod/debian-3p-remote-trixie-security trixie-security main\n" > /etc/apt/sources.list.d/airlock.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        python3-pip \
        openjdk-21-jre-headless \
        bash && \
    apt-get upgrade -y && \
    apt-get clean

RUN mkdir -p /usr/local/node_packages/
COPY package.json /usr/local/node_packages/
COPY package-lock.json /usr/local/node_packages/

WORKDIR /usr/local/node_packages/
RUN --mount=type=secret,id=airlock_token \
    set -e && \
    AIRLOCK_TOKEN="$(cat /run/secrets/airlock_token)" && \
    trap 'rm -f /tmp/.npmrc' EXIT && \
    (umask 077 && printf "registry=https://us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/\n//us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/:always-auth=true\n//us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/:_authToken=%s\n" "${AIRLOCK_TOKEN}" > /tmp/.npmrc) && \
    npm --userconfig=/tmp/.npmrc install --registry=https://us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/ && \
    npm --userconfig=/tmp/.npmrc update --registry=https://us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/
RUN chmod -R 755 /usr/local/node_packages /usr/local/lib/node_modules
ENV PATH="/usr/local/node_packages/node_modules/.bin:${PATH}"

WORKDIR /

RUN firebase setup:emulators:database && \
    firebase setup:emulators:firestore && \
    firebase setup:emulators:pubsub && \
    firebase setup:emulators:storage && \
    firebase setup:emulators:dataconnect && \
    firebase setup:emulators:ui

ENTRYPOINT [ "firebase" ]