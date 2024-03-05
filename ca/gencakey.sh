#!/bin/bash

echo $1
openssl genrsa -des3 -passout pass:$1 -out wgnCA.key 2048


