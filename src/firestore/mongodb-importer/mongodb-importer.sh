#! /bin/bash

# IMPORTANT NOTE
# I used the code from this Medium article as a reference: https://medium.com/@dev.prasenjitsaha/migrate-mongodb-data-to-cloud-firestore-79a68ee18aa3
# The author of this article is Prasenjit Saha
# @author Prasenjit Saha

# Run with this command
# sh mongodb-importer.sh -k firebase_service_account_private_key_json_file_path -d firestore_db_url -m mongodb_db_name -c collection_name -u optional_uri_connection_string

# Optional MongoDB URI connection string looks like: mongodb://mongodb0.example.com:28015

service_account_private_key=''
database_url=''
mongodb_db_name=''
collection_name=''
optional_uri_connection_string=''

print_usage() {
  printf "Usage: sh mongodb-importer.sh -k firebase_service_account_private_key_json_file_path -d firestore_db_url -m mongodb_db_name -c collection_name -u optional_uri_connection_string"
  printf "Database URL should not have https://. Make sure your MongoDB process is running, otherwise the program will get stuck trying to connect to it."
}

#Author for getting flags in Bash: Dennis' post on https://stackoverflow.com/questions/7069682/how-to-get-arguments-with-flags-in-bash/21128172
#And also Google Bash Style Guide
while getopts 'k:d:m:c:u:' flag; do
  case "${flag}" in
  	k) service_account_private_key="${OPTARG}" ;;
    d) database_url="${OPTARG}" ;;
    m) mongodb_db_name="${OPTARG}" ;;
    c) collection_name="${OPTARG}" ;;
	u) optional_uri_connection_string="${OPTARG}" ;;
    *) print_usage
       exit 1 ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "${GREEN}Tip: Database URL should not have https://. Make sure your MongoDB process is running, otherwise the program will get stuck trying to connect to it. Also, please make sure to use the full path for your service account key, not the relative path${NC}"
sleep 2

# If the user does not specify a MongoDB URI connection string, call mongoexport with default values
if [[ "${optional_uri_connection_string}" == "" ]]; then
  echo "No MongoDB URI connection string specified, using default values"
  mongoexport --collection="${collection_name}" --db="${mongodb_db_name}" --out="exported_data.json"
else
  echo "MongoDB URI connection string given is: ${optional_uri_connection_string}"
  mongoexport --host="${optional_uri_connection_string}" --collection="${collection_name}" --db="${mongodb_db_name}" --out="exported_data.json"
fi

if [[ -d ${service_account_private_key} ]]; then
  echo "Please provide the path to a JSON file containing your Firebase service account private key. You provided a directory (folder) for your Firebase service account private key: ${service_account_private_key}."
  exit 1
elif [[ ! -f ${service_account_private_key} ]]; then
  echo "Please provide a valid path to a JSON file containing your Firebase service account private key."
  echo "${RED}If you believe the file is valid, try using the full path rather than a relative path.${NC}"
  exit 1
fi


# Convert exported_data.json to the right format
javac ConvertFormat.java
java ConvertFormat exported_data.json


# Upload to Cloud Firestore database
originalData='exported_data.json'
temporaryJSONfile='fixed_formatting.json'
dockey_being_used="false"
node index.js ${service_account_private_key} ${temporaryJSONfile} ${collection_name} ${database_url} ${dockey_being_used}

rm ${originalData}
rm ${temporaryJSONfile}

exit 0


# IMPORTANT NOTE
# I used the code from this Medium article as a reference: https://medium.com/@dev.prasenjitsaha/migrate-mongodb-data-to-cloud-firestore-79a68ee18aa3
# The author of this article is Prasenjit Saha
# @author Prasenjit Saha
