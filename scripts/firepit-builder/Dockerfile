FROM node:12

# Install dependencies
RUN apt-get update && \
    apt-get install -y wget tar

# Install hub
RUN curl -fsSL --output hub.tgz https://github.com/github/hub/releases/download/v2.11.2/hub-linux-amd64-2.11.2.tgz
RUN tar --strip-components=2 -C /usr/bin -xf hub.tgz hub-linux-amd64-2.11.2/bin/hub

# Upgrade npm to 8.
RUN npm install --global npm@8

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

CMD [ "node", "pipeline.js" ]
