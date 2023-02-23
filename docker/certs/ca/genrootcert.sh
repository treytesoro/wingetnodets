#!/bin/bash

openssl req -x509 -new -nodes -key wgnCA.key -sha256 -days 1825 -passin pass:wingetnode -config values.cfg -out wgnCAroot.pem

