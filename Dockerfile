FROM node:18-slim

# Installs latest Chromium (103) package.
RUN apt update -qq \
    && apt install -qq -y --no-install-recommends \
    curl \
    git \
    gnupg \
    libgconf-2-4 \
    libxss1 \
    libxtst6 \
    g++ \
    build-essential \
    chromium \
    chromium-sandbox \
    dumb-init \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /src/*.deb

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /home/pptruser

RUN npm install puppeteer

# Add user so we don't need --no-sandbox.
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && mkdir -p /home/pptruser/screenshots \
    && chown -R pptruser:pptruser /home/pptruser

COPY . /home/pptruser

RUN npm install

RUN npx tsc

RUN chown -R pptruser:pptruser /home/pptruser/dist \
    && chown -R pptruser:pptruser /home/pptruser

USER pptruser

CMD [ "node", "dist/index.js" ]