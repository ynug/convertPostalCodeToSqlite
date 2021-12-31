# Create SQLite database from csv of zip code data

## System Requirements

node 16.13.1

## Use Data

Postal code data provided by Japan Post Co., Ltd.  
https://www.post.japanpost.jp/zipcode/dl/kogaki-zip.html

## Execution Method

1. Unzip the downloaded zip code data and place it in the same layer with the `KEN_ALL.CSV` file name.
2. `npm i`
3. `node index.js`
4. When the process is finished, a `dt.sqlite` file will be generated in the same hierarchy.
