#!/bin/bash

MSIPATH=$1 #"/mnt/c/Users/trey/desktop/packages/CoffeeBreak_setup_v1.0.1.msi"

# in case you forget, <<< inputs a string as stdin
# don't pipe into while as that creates a subshell and variable assignments won't persist
while read line; do 
propname=$(echo "$line" | sed -rE 's/([a-zA-Z0-9]+)\s+(\{*.*\}*)/\1/g')
value=$(echo "$line" | sed -rE "s/([a-zA-Z0-9]+)\s+(\{*.*\}*)\r/\2/g")
# echo $propname
cmd="$propname=\"$value\""
eval $cmd
done <<< "$(msiinfo export $MSIPATH Property)"

while read line; do 
# echo $line
propname=$(echo "$line" | sed -rE 's/(.*)\:\s.*/\1/')
value=$(echo "$line" |    sed -rE 's/.*\:\s(.*)/\1/')
# echo $propname
# echo $value
cmd="$propname=\"$value\""
if [ "$propname" == "Template" ]; then
 eval $cmd
fi
# echo $cmd
# echo ""
done <<< "$(msiinfo suminfo $MSIPATH)"

JSON="{\"UpgradeCode\":\"$UpgradeCode\", \"AllUsers\":\"$ALLUSERS\", \"ArpProductIcon\":\"$ArpProductIcon\", \"Manufacturer\":\"$Manufacturer\", \"ProductCode\":\"$ProductCode\", \"ProductLanguage\":\"$ProductLanguage\", \"ProductName\":\"$ProductName\", \"ProductVersion\":\"$ProductVersion\", \"Template\":\"$Template\"}"

# echo UpgradeCode: $UpgradeCode
# echo AllUsers: $ALLUSERS
# echo ArpProductIcon: $ArpProductIcon
# echo Manufacturer: $Manufacturer
# echo ProductCode: $ProductCode
# echo ProductLanguage: $ProductLanguage
# echo ProductName: $ProductName
# echo ProductVersion: $ProductVersion
# echo SecureCustomProperties: $SecureCustomProperties

echo "$JSON"