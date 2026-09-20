const fs = require('fs');
const tar = require("tar");
const YAML = require('yaml');
const {S3Client, GetObjectCommand} = require("@aws-sdk/client-s3");
const glob = require("glob");
var rimraf = require("rimraf");

const s3 = new S3Client({});
const TESTS_BUCKET = "devgrade-assessment-templates-original-tests";
const TESTS_FOLDER = "original_tests";

const injectFiles = async (configFileName) => {
    if (fs.existsSync(configFileName)) {
        const configFile = fs.readFileSync(configFileName, 'utf8');
        const config = YAML.parse(configFile);
        const { test_files, template_name, stack, tests_root } = config
        const objectKey = `${template_name}.tar.gz`

        const command = new GetObjectCommand({
            Bucket: TESTS_BUCKET,
            Key: objectKey,
          });

        try {
            const response = await s3.send(command);
            const str = await response.Body.transformToString();
            str.createReadStream().pipe(fs.createWriteStream(objectKey)).on("close", () => {
                if (!fs.existsSync(TESTS_FOLDER)) {
                    fs.mkdirSync(TESTS_FOLDER);
                }
    
                fs.createReadStream(objectKey).pipe(tar.extract({ cwd: `./${TESTS_FOLDER}` })).on('close', () => {
                    fs.unlink(objectKey, (err) => {
                        if (err) throw err;
                        replaceFiles(test_files, tests_root);
                    });
                })
            })
            console.log(str);
          } catch (err) {
            console.error(err);
          }
        return "Files Injected Successfully";
    } else {
        return "File Injection Error";
    }
}

const replaceFiles = (test_files, tests_root) => {
    if (test_files.length != 0) {
        for (const testFilePath of test_files) {
            if (testFilePath.includes("*")) {
                const options = {
                    cwd: "../",
                    ignore: ["node_modules/**", "config/**"]
                }
                glob(testFilePath, options, function (er, currentFilePaths) {
                    for (const path of currentFilePaths) {
                        const fileName = path.split("/")[path.split("/").length - 1];
                        fs.readdir(`./${TESTS_FOLDER}/${tests_root}/tests`, (err, originalFiles) => {
                            if (originalFiles.includes(fileName)) {
                                copyFile(fileName, path, tests_root);
                                rimraf(TESTS_FOLDER, function () { console.log("done"); });
                            }
                        })
                    }
                })
            } else {
                const fileName = testFilePath.split("/")[testFilePath.split("/").length - 1];
                copyFile(fileName, testFilePath, tests_root);
                rimraf(TESTS_FOLDER, function () { console.log("original tests removed"); });
            }
        }
        return "Files Copied";
    } else {
        return "Error File Copying";
    }
}

const copyFile = (srcFileName, destPath, tests_root) => {
    fs.copyFile(`${TESTS_FOLDER}/${tests_root}/tests/${srcFileName}`, `../${destPath}`, (err) => {
        if (err) throw err;
    });
    return "Copied";
}

injectFiles("./devgradeconfig.yml");

module.exports = {
    copyFile,
    replaceFiles,
    injectFiles
}