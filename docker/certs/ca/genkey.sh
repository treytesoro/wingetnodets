#!/bin/bash

openssl genrsa -out webserver.key 2048

openssl req -new -key webserver.key -config values.cfg -passin pass:wingetnode -out webserver.csr

openssl x509 -req -in webserver.csr -CA wgnCAroot.pem -CAkey wgnCA.key -CAcreateserial -out webserver.crt -days 825 -sha256 -passin pass:wingetnode -extfile webserver.ext
