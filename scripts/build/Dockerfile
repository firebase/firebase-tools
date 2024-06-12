FROM node:20

# Install dependencies
RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -
RUN echo "deb https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
RUN apt-get update && \
    apt-get install -y curl git jq google-cloud-cli

# Install hub
RUN curl -fsSL --output hub.tgz https://github.com/github/hub/releases/download/v2.14.2/hub-linux-amd64-2.14.2.tgz
RUN tar --strip-components=2 -C /usr/bin -xf hub.tgz hub-linux-amd64-2.14.2/bin/hub

# Upgrade npm to 9.
RUN npm install --global npm@9.5
