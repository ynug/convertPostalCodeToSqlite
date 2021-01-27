# 郵便番号データのcsvからSQLiteのデータベースを作成

## 動作環境

node 14.15.4

## 利用データ

日本郵便株式会社提供の郵便番号データ  
https://www.post.japanpost.jp/zipcode/dl/kogaki-zip.html

全国一括

## 実行方法

1. ダウンロードした郵便番号データを解凍して、同階層に `KEN_ALL.CSV` ファイル名で配置
2. `node index.js`
3. 処理が終わると同階層に `dt.sqlite` ファイルが生成される
