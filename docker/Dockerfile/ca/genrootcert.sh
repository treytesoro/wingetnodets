#!/bin/bash

openssl req -x509 -new -nodes -key wgnCA.key -sha256 -days 1825 -passin pass:$1 -config $2 -out wgnCAroot.pem

openssl rsa -in wgnCA.key -out wgnCA_decrypted.key -passin pass:$1

openssl pkcs12 -export -out wgnCA.pfx -inkey wgnCA.key -in wgnCAroot.pem -passin pass:$1 -passout pass:$1
