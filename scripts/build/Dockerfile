FROM node:12

# Install dependencies
RUN apt-get update && \
    apt-get install -y curl git jq

# Install hub
RUN curl -fsSL --output hub.tgz https://github.com/github/hub/releases/download/v2.14.2/hub-linux-amd64-2.14.2.tgz
RUN tar --strip-components=2 -C /usr/bin -xf hub.tgz hub-linux-amd64-2.14.2/bin/hub

# Upgrade npm to 8.
RUN npm install --global npm@8
