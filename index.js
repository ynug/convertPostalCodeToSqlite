'use strict'

const fs = require('fs').promises;
const iconv = require('iconv-lite');
const csvSync = require('csv-parse/lib/sync');
const sqlite = require('sqlite3').verbose();
const moji = require('moji');

/**
 * 文字コードを sjis から utf-8 に変換する
 * 30MB程度なのでメモリに読み込んでしまう
 * @returns {Promise<void>}
 */
const convertCharacterCodeSJisToUtf8 = async (sjisFileName, utf8FileName) => {
    try {
        const content = await fs.readFile(sjisFileName);
        const bufferContent = new Buffer.from(content, 'binary');
        const result = iconv.decode(bufferContent, "Shift_JIS");
        await fs.writeFile(utf8FileName, result);
    } catch (error) {
        console.error(error)
    }
}

/**
 * utf8のCSVファイルをパースしてオブジェクトを返す
 * @param utf8FileName
 */
const getPostalCodeCsvParseData = async (utf8FileName) => {
    const data = await fs.readFile(utf8FileName);
    return csvSync(data);
}

/**
 * CSV のオブジェクトから Insertデータのオブジェクトを作成する
 * https://www.publickey1.jp/blog/17/yubin7_pr.html
 * @param csvParseObject
 * @returns {[]}
 */
const getInsertPostalCodeObject = (csvParseObject) => {
    const result = []

    console.log(`csvParseObject.length = ${csvParseObject.length}`)
    let isMultipleLines = false;
    let tmp = [];
    for (const oneline of csvParseObject) {
        // 0: 全国地方公共団体コード（JIS X0401、X0402）- 半角数字
        // 1: （旧）郵便番号（5桁） - 半角数字
        // 2: 郵便番号（7桁） - 半角数字
        // 3: 都道府県名 - 半角カタカナ（コード順に掲載）　（注1）
        // 4: 市区町村名　…………　半角カタカナ（コード順に掲載）　（注1）
        // 5: 町域名　………………　半角カタカナ（五十音順に掲載）　（注1）
        // 6: 都道府県名　…………　漢字（コード順に掲載）　（注1,2）
        // 7: 市区町村名　…………　漢字（コード順に掲載）　（注1,2）
        // 8: 町域名　………………　漢字（五十音順に掲載）　（注1,2）
        // 9: 一町域が二以上の郵便番号で表される場合の表示　（注3）　（「1」は該当、「0」は該当せず）
        // 10: 小字毎に番地が起番されている町域の表示　（注4）　（「1」は該当、「0」は該当せず）
        // 11: 丁目を有する町域の場合の表示　（「1」は該当、「0」は該当せず）
        // 12: 一つの郵便番号で二以上の町域を表す場合の表示　（注5）　（「1」は該当、「0」は該当せず）
        // 13: 更新の表示（注6）（「0」は変更なし、「1」は変更あり、「2」廃止（廃止データのみ使用））
        // 14: 変更理由　（「0」は変更なし、「1」市政・区政・町政・分区・政令指定都市施行、「2」住居表示の実施、「3」区画整理、「4」郵便区調整等、「5」訂正、「6」廃止（廃止データのみ使用））
        // for (let i = 0; i < oneline.length; i++) {
        //     console.log(`${i}: ${oneline[i]}`);
        // }
        const postalCode = oneline[2];
        const halfKatakanaPrefecture = oneline[3];
        const halfKatakanaCityTown = oneline[4];
        const halfKatakanaStreet = oneline[5];
        const hiraganaPrefecture = moji(halfKatakanaPrefecture).convert('HK', 'ZK').convert('KK', 'HG').toString();
        const hiraganaCityTown = moji(halfKatakanaCityTown).convert('HK', 'ZK').convert('KK', 'HG').toString();
        const hiraganaStreet = moji(halfKatakanaStreet).convert('HK', 'ZK').convert('KK', 'HG').toString();
        const kanjiPrefecture = oneline[6];
        const kanjiCityTown = oneline[7];
        const kanjiStreet = oneline[8];

        if (isMultipleLines) {
            const lastObject = result[result.length - 1];
            lastObject[3] += hiraganaStreet;
            lastObject[6] += kanjiStreet;
            if (kanjiStreet.indexOf('）') !== -1) {
                isMultipleLines = false;
                console.log('ml end', result[result.length - 1])
            }
        } else {
            result.push([
                postalCode,
                hiraganaPrefecture, hiraganaCityTown, hiraganaStreet,
                kanjiPrefecture, kanjiCityTown, kanjiStreet
            ])
            // 複数行の判定　
            if (kanjiStreet.indexOf('（') !== -1) {
                if (kanjiStreet.indexOf('）') === -1) {
                    isMultipleLines = true;
                    console.log('ml start', result[result.length - 1])
                }
            }
        }
    }

    return result;
}

/**
 * データベースを作成してデータを投入
 * @param insertPostalCodeObject
 * @returns {Promise<void>}
 */
const insertDatabase = async (insertPostalCodeObject) => {
    const db = new sqlite.Database('dt.sqlite');

    const run = (sql, params) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    console.log(`begin database insert.`)

    await run(`
        CREATE TABLE IF NOT EXISTS pc (
            postal_code text,
            h_prefecture text,
            h_city_town text,
            h_street text,
            k_prefecture text,
            k_city_town text,
            k_street text
        );
    `)

    await run(`
        CREATE INDEX IF NOT EXISTS index1 ON pc (
            postal_code,
            h_prefecture,
            h_city_town,
            h_street,
            k_prefecture,
            k_city_town,
            k_street
        );
    `)

     for (let i = 0; i < insertPostalCodeObject.length; i++) {
         console.log(`insert loop count: ${i + 1} / ${insertPostalCodeObject.length}`)
         await run('INSERT INTO pc VALUES(?,?,?,?,?,?,?)', insertPostalCodeObject[i])
     }

    await run(`vacuum;`);

    db.close(err => {
        if (err)
            return console.error('closeでエラー', err);
    });

    console.log(`end database insert.`)
}

const main = async () => {

    const sjisFileName = 'KEN_ALL.CSV';
    const utf8FileName = 'KEN_ALL_UTF8.CSV';

    console.log(`郵便番号データベース作成 開始`);
    await convertCharacterCodeSJisToUtf8(sjisFileName, utf8FileName);
    const csvParseObject = await getPostalCodeCsvParseData(utf8FileName);
    const insertPostalCodeObject = getInsertPostalCodeObject(csvParseObject);
    await insertDatabase(insertPostalCodeObject);
    console.log(`郵便番号データベース作成 終了`);
}

main();