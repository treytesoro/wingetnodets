FROM ubuntu:latest


RUN apt-get -y update && apt-get -y upgrade && apt-get -y install curl && \
    curl -sL https://deb.nodesource.com/setup_18.x | /bin/bash && \
	apt-get -y install nodejs && npm -y install -g npm@9.5.1 && \
    apt-get -y install zip

RUN mkdir /app && mkdir /certs && mkdir /ca
WORKDIR /app

COPY dist /app/
COPY powershellHelpers.zip /app/
COPY ca /ca/

RUN npm -y init && npm -y install express && npm -y install mongodb

ENV WGN_ISDOCKER="1" \
    WGN_SERVERID="" \
    WGN_SUPPORTED_VERSIONS="1.0.1, 1.1.0" \
    WGN_HTTP_PORT="7070" \
    WGN_HTTPS_PORT="7071" \
    WGN_PRIVATEKEYPATH="/certs/server.key" \
    WGN_PUBLICKEYPATH="/certs/server.crt" \
    WGN_PACKAGESPATH="/packages" \
    WGN_MONGO_CONNECTIONSTRING="" \
    WGN_SERVEPACKAGES="0"

VOLUME [ "/data/db", "/data/configdb" ]
VOLUME [ "/packages"]
VOLUME [ "/certs"]

# ENTRYPOINT [ "tail", "-f", "/dev/null" ]
ENTRYPOINT [ "node", "index.js" ]

