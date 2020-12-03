#! /bin/bash

service_account_private_key=''
data_file=''
database_url=''
collection_name=''
dockey_being_used=false

print_usage() {
  printf "Usage: sh firestore-upload.sh -f file_path -k firebase_service_account_private_key_json_file_path -d firestore_db_url -c collection_name"
  printf "Database URL should not have https://."
}

#Author for getting flags in Bash: Dennis' post on https://stackoverflow.com/questions/7069682/how-to-get-arguments-with-flags-in-bash/21128172
#And also Google Bash Style Guide
while getopts 'k:f:d:c:y' flag; do
  case "${flag}" in
  	k) service_account_private_key="${OPTARG}" ;;
  	f) data_file="${OPTARG}" ;;
    d) database_url="${OPTARG}" ;;
    c) collection_name="${OPTARG}" ;;
	y) dockey_being_used='true' ;;
    *) print_usage
       exit 1 ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "${GREEN}Tip: Database URL should not have https://. Also, please make sure to use the full path for your service account key and data file, not the relative path${NC}"
sleep 2

if [[ -d ${service_account_private_key} ]]; then
  echo "Please provide the path to a JSON file containing your Firebase service account private key. You provided a directory (folder) for your Firebase service account private key: ${service_account_private_key}."
  exit 1
elif [[ ! -f ${service_account_private_key} ]]; then
  echo "Please provide a valid path to a JSON file containing your Firebase service account private key."
  echo "${RED}If you believe the file is valid, try using the full path rather than a relative path.${NC}"
  exit 1
fi

if [[ -d ${data_file} ]]; then
  echo "Please provide the path to a single JSON or CSV file containing the data you want to upload. You instead provided a directory (folder) for your data: ${data_file}."
  exit 1
elif [[ ! -f ${data_file} ]]; then
  echo "Please provide a valid path to a JSON or CSV file containing the data you want to upload. You are attempting to use this file which is not valid: ${data_file}"
  echo "${RED}If you believe the file is valid, try using the full path rather than a relative path.${NC}"
  exit 1
fi

#Author of the code snippet to get file name without extension: Petesh and Ludovic https://stackoverflow.com/questions/965053/extract-filename-and-extension-in-bash
fullFileName=$(basename -- "$data_file")
extension="${fullFileName##*.}"
fileName="${fullFileName%.*}"

if [[ "${extension}" = "csv" ]]; then
  #If a CSV file was chosen, we have to convert it to JSON
  temporaryJSONfile="${fileName}Temp.json"
  csvtojson "${data_file}" >> ${temporaryJSONfile}
  node index.js ${service_account_private_key} ${temporaryJSONfile} ${collection_name} ${database_url} ${dockey_being_used}
  rm -rf ${temporaryJSONfile}
  exit 0
elif [[ "${extension}" = "json" ]]; then
  node index.js ${service_account_private_key} ${data_file} ${collection_name} ${database_url} ${dockey_being_used} 
  exit 0
else
  echo "Error: Unknown file extension ${extension}"
  exit 1
fi

