#!/bin/bash

# $1 = pass
# $2 = values.cfg
# $3 = webserver.ext

openssl genrsa -out webserver.key 2048

openssl req -new -key webserver.key -config $2 -passin pass:$1 -out webserver.csr

openssl x509 -req -in webserver.csr -CA wgnCAroot.pem -CAkey wgnCA.key -CAcreateserial -out webserver.crt -days 825 -sha256 -passin pass:$1 -extfile $3
