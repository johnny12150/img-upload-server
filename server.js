#!/usr/bin/env node
/*
 * jQuery File Upload Plugin Node.js Example 2.1.0
 * https://github.com/blueimp/jQuery-File-Upload
 *
 * Copyright 2012, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 */

/*jslint nomen: true, regexp: true, unparam: true, stupid: true */
/*global require, __dirname, unescape, console */

// for debug use
// @ref:https://stackoverflow.com/questions/27688804/how-do-i-debug-error-spawn-enoent-on-node-js
// (function() {
//     var childProcess = require("child_process");
//     var oldSpawn = childProcess.spawn;
//     function mySpawn() {
//         console.log('spawn called');
//         console.log(arguments);
//         var result = oldSpawn.apply(this, arguments);
//         return result;
//     }
//     childProcess.spawn = mySpawn;
// })();

let url = require('url');
var fetch = require('node-fetch');

(function (port) {
    'use strict';
    var path = require('path'),
        fs = require('fs'),
        // Since Node 0.8, .existsSync() moved from path to fs:
        _existsSync = fs.existsSync || path.existsSync,
        formidable = require('formidable'),
        nodeStatic = require('node-static'),
        imageMagick = require('imagemagick'),
        options = {
            // tmpDir: __dirname + '/tmp',
            // publicDir: __dirname + '/public',
            // uploadDir: __dirname + '/public/files',
            tmpDir: '/var/www/html/media/tmp',
            // publicDir: '/var/www/html/media/public',
            // uploadDir: '/var/www/html/media/public/files',
            // uploadUrl: '/files/',
            publicDir: '/var/www/html/media',
            uploadDir: '/var/www/html/media',
            uploadUrl: '/',
            maxPostSize: 11000000000, // 11 GB
            minFileSize: 1,
            maxFileSize: 10000000000, // 10 GB
            acceptFileTypes: /.+/i,
            // Files not matched by this regular expression force a download dialog,
            // to prevent executing any scripts in the context of the service domain:
            inlineFileTypes: /\.(gif|jpe?g|png)$/i,
            imageTypes: /\.(gif|jpe?g|png)$/i,
            imageVersions: {
                'thumbnail': {
                    width: 80,
                    height: 80
                }
            },
            accessControl: {
                allowOrigin: '*',
                allowMethods: 'OPTIONS, HEAD, GET, POST, PUT, DELETE',
                allowHeaders: 'Content-Type, Content-Range, Content-Disposition'
            },
            /* Uncomment and edit this section to provide the service via HTTPS:
            ssl: {
                key: fs.readFileSync('/Applications/XAMPP/etc/ssl.key/server.key'),
                cert: fs.readFileSync('/Applications/XAMPP/etc/ssl.crt/server.crt')
            },
            */
            nodeStatic: {
                cache: 3600 // seconds to cache served files
            }
        },
        utf8encode = function (str) {
            return unescape(encodeURIComponent(str));
        },
        fileServer = new nodeStatic.Server(options.publicDir, options.nodeStatic),
        nameCountRegexp = /(?:(?: \(([\d]+)\))?(\.[^.]+))?$/,
        nameCountFunc = function (s, index, ext) {
            return ' (' + ((parseInt(index, 10) || 0) + 1) + ')' + (ext || '');
        },
        FileInfo = function (file) {
            this.name = file.name;
            this.size = file.size;
            this.type = file.type;
            this.deleteType = 'DELETE';
            this.manifest = file.manifest;
        },
        UploadHandler = function (req, res, callback) {
            this.req = req;
            this.res = res;
            this.callback = callback;
        },
        serve = function (req, res) {
            // 這個http://img-server.yolo.dev.annotation.taieol.tw 已經有設定過CORS
            // res.setHeader(
            //     'Access-Control-Allow-Origin',
            //     options.accessControl.allowOrigin
            // );

            // 處理路由 & query
            const parsedUrl = url.parse(req.url, true);
            const path = parsedUrl.pathname, query = parsedUrl.query;
            console.log(path, query);

            // todo: 判斷是否創新的資料夾

            // 根據URI參數 dataset設定options, 決定參數的資料夾
            if (query.length <= 0) {
                options.publicDir = '/var/www/html/media/' + query.dataset;
                options.tmpDir = '/var/www/html/media/' + query.dataset + '/tmp';
                options.uploadDir = '/var/www/html/media/' + query.dataset;
                // options.uploadUrl ='/';
            }

            res.setHeader(
                'Access-Control-Allow-Methods',
                options.accessControl.allowMethods
            );
            res.setHeader(
                'Access-Control-Allow-Headers',
                options.accessControl.allowHeaders
            );
            // UploadHandler的callback, 經過get/ post等之後才會被呼叫
            var handleResult = function (result, redirect) {
                    if (redirect) {
                        res.writeHead(302, {
                            'Location': redirect.replace(
                                /%s/,
                                encodeURIComponent(JSON.stringify(result))
                            )
                        });
                        res.end();
                    } else {
                        // 處理回傳get時，server上所有照片
                        console.log('get response');
                        res.writeHead(200, {
                            'Content-Type': req.headers.accept
                                .indexOf('application/json') !== -1 ?
                                'application/json' : 'text/plain'
                        });

                        res.end(JSON.stringify(result));

                    }
                },
                setNoCacheHeaders = function () {
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                    res.setHeader('Content-Disposition', 'inline; filename="files.json"');
                },
                handler = new UploadHandler(req, res, handleResult);
            switch (req.method) {
                case 'OPTIONS':
                    res.end();
                    break;
                case 'HEAD':
                case 'GET':
                    // if (req.url === '/') {
                    if (path === '/') {
                        setNoCacheHeaders();
                        if (req.method === 'GET') {
                            handler.get();
                        } else {
                            res.end();
                        }
                    } //把路由導向至圖片實體位置
                    else {
                        fileServer.serve(req, res);
                    }
                    break;
                case 'POST':
                    setNoCacheHeaders();
                    handler.post();
                    break;
                case 'DELETE':
                    handler.destroy();
                    break;
                default:
                    res.statusCode = 405;
                    res.end();
            }
        };
    fileServer.respond = function (pathname, status, _headers, files, stat, req, res, finish) {
        // Prevent browsers from MIME-sniffing the content-type:
        _headers['X-Content-Type-Options'] = 'nosniff';
        if (!options.inlineFileTypes.test(files[0])) {
            // Force a download dialog for unsafe file extensions:
            _headers['Content-Type'] = 'application/octet-stream';
            _headers['Content-Disposition'] = 'attachment; filename="' +
                utf8encode(path.basename(files[0])) + '"';
        }
        nodeStatic.Server.prototype.respond
            .call(this, pathname, status, _headers, files, stat, req, res, finish);
    };
    FileInfo.prototype.validate = function () {
        if (options.minFileSize && options.minFileSize > this.size) {
            this.error = 'File is too small';
        } else if (options.maxFileSize && options.maxFileSize < this.size) {
            this.error = 'File is too big';
        } else if (!options.acceptFileTypes.test(this.name)) {
            this.error = 'Filetype not allowed';
        }
        return !this.error;
    };
    FileInfo.prototype.safeName = function () {
        // Prevent directory traversal and creating hidden system files:
        this.name = path.basename(this.name).replace(/^\.+/, '');
        // Prevent overwriting existing files:
        while (_existsSync(options.uploadDir + '/' + this.name)) {
            this.name = this.name.replace(nameCountRegexp, nameCountFunc);
        }
    };
    FileInfo.prototype.initUrls = function (req) {
        if (!this.error) {
            var that = this,
                baseUrl = (options.ssl ? 'https:' : 'http:') +
                    '//' + req.headers.host + options.uploadUrl;
            // 指定url跟deleteUrl給FileInfo
            this.url = this.deleteUrl = baseUrl + encodeURIComponent(this.name);
            Object.keys(options.imageVersions).forEach(function (version) {
                // 如果檔案存在, 上傳時似乎未執行這行
                if (_existsSync(
                    options.uploadDir + '/' + version + '/' + that.name
                )) {
                    // console.log('file exist');
                    // 用that避免用this會指到foreach裡面
                    that[version + 'Url'] = baseUrl + version + '/' +
                        encodeURIComponent(that.name);
                    // console.log(that);
                    // console.log(that[version + 'Url']);
                }
            });
        }
        else
            console.log('init Urls failed');
    };
    UploadHandler.prototype.get = function () {
        var handler = this,
            files = [];
        let count_directory = 0;
        fs.readdir(options.uploadDir, function (err, list) {
            // 計算資料夾數
            list.forEach(function (name, index) {
                if (index <= list.length) {
                    let stats = fs.statSync(options.uploadDir + '/' + name);
                    if (stats.isDirectory()) {
                        console.log('is directory');
                        console.log(count_directory);
                        count_directory++;
                    }
                }
            });
            // 列出server上所有的檔案
            list.forEach(function (name, index) {
                // 限制範圍會導致讀到檔案目錄時,浪費index位置,之後直接被跳else
                // if (index <= list.length - 4) {
                if (index <= list.length) {
                    var stats = fs.statSync(options.uploadDir + '/' + name),
                        fileInfo;
                    let manifest_pic_name;
                    if (stats.isFile() && name[0] !== '.') {
                        // 切掉檔案類型
                        manifest_pic_name = name.split('.')[0];
                        // fetch to find mId
                        // @ref: https://stackoverflow.com/questions/24912226/how-to-make-ajax-request-through-nodejs-to-an-endpoint
                        let manifest_API = 'http://apis.yolo.dev.annotation.taieol.tw/api/GET/manifest/check/' + manifest_pic_name;
                        fetch(manifest_API, {
                            method: 'GET',
                            headers: {'Content-Type': 'application/json'},
                        })
                            .then(res => res.text())
                            .then(text => {
                                // text is mId
                                fileInfo = new FileInfo({
                                    name: name,
                                    size: stats.size,
                                    manifest: 'http://apis.yolo.dev.annotation.taieol.tw/api/GET/' + text + '/manifest'
                                });
                                fileInfo.initUrls(handler.req);
                                files.push(fileInfo);
                                // 確保每張照片都被執行過check manifest
                                // fixme: 減幾的參數會根據資料夾數目變動
                                // EX: 根目錄在media時減4, 因為有4個資料夾 (之後會有新資料夾,需動態)
                                //     根目錄在 1時減2, 因為底下只有兩個資料夾tmp & thumbnail
                                console.log(count_directory);
                                let directory_num;
                                if (options.uploadDir === '/var/www/html/media')
                                    directory_num = count_directory;
                                else
                                    directory_num = 2;
                                if (files.length === list.length - directory_num) {
                                    // 呼叫callback回傳所有file的資訊
                                    handler.callback({files: files});
                                }
                            })
                    }
                } else {
                    // todo: 檢查array把資料夾 public thumbnail 以及 tmp從list 去除
                    // console.log('else');
                }
            });
            // console.log(files);
            // handler.callback({files: files});
        });
    };
    // 處理傳過來的檔案(post)
    UploadHandler.prototype.post = function () {
        var handler = this,
            // ref: https://github.com/felixge/node-formidable
            form = new formidable.IncomingForm(),
            tmpFiles = [],
            files = [],
            map = {},
            counter = 1,
            redirect,
            finish = function () {
                counter -= 1;
                if (!counter) {
                    files.forEach(function (fileInfo) {
                        // 取得存照片sever的domian, 替delete和thumbnail的url做準備
                        fileInfo.initUrls(handler.req);
                        // 底下的files未真的被加上thumbnailUrl
                        // console.log(files);
                    });
                    console.log('res的JSON');
                    console.log(files);
                    handler.callback({files: files}, redirect);
                }
            };
        let pic_name;
        form.uploadDir = options.tmpDir;
        form.on('fileBegin', function (name, file) {
            tmpFiles.push(file.path);
            // 處理回傳img info的json
            var fileInfo = new FileInfo(file, handler.req, true);
            fileInfo.safeName();
            map[path.basename(file.path)] = fileInfo;

            let manifest_pic_name = file.name.split('.')[0];
            // fetch to find mId
            let manifest_API = 'http://apis.yolo.dev.annotation.taieol.tw/api/GET/manifest/check/' + manifest_pic_name;
            fetch(manifest_API, {
                method: 'GET',
                headers: {'Content-Type': 'application/json'},
            })
                .then(res => res.text())
                .then(text => {
                    // text is mId
                    // console.log('fetch mId');

                    // 這裡太慢會拖累下面
                    // var fileInfo = new FileInfo({
                    //     name: file.name,
                    //     size: file.size,
                    //     type: file.type,
                    //     manifest: 'http://apis.yolo.dev.annotation.taieol.tw/api/GET/' + text + '/manifest'
                    //     // manifest: 'http://apis.yolo.dev.annotation.taieol.tw/api/GET/1/manifest'
                    // }, handler.req, true);

                    fileInfo.manifest = 'http://apis.yolo.dev.annotation.taieol.tw/api/GET/' + text + '/manifest';
                    // console.log(fileInfo);

                    // fileInfo.safeName();
                    // map[path.basename(file.path)] = fileInfo;

                    files.push(fileInfo);
                    // finish();
                });

            // fileInfo.safeName();
            // map[path.basename(file.path)] = fileInfo;
            // files.push(fileInfo);
        }).on('field', function (name, value) {
            if (name === 'redirect') {
                redirect = value;
            }
        }).on('file', function (name, file) {

            let fileInfo = map[path.basename(file.path)];

            fileInfo.size = file.size;
            if (!fileInfo.validate()) {
                fs.unlink(file.path);
                return;
            }

            // console.log(options.uploadDir);
            console.log(fileInfo.name);
            pic_name = fileInfo.name;

            fs.renameSync(file.path, options.uploadDir + '/' + fileInfo.name);
            if (options.imageTypes.test(fileInfo.name)) {
                Object.keys(options.imageVersions).forEach(function (version) {
                    counter += 1;
                    var opts = options.imageVersions[version];
                    imageMagick.resize({
                        width: opts.width,
                        height: opts.height,
                        srcPath: options.uploadDir + '/' + fileInfo.name,
                        dstPath: options.uploadDir + '/' + version + '/' +
                            fileInfo.name
                    });
                    // thumbnail的url, 但不包含domain
                    console.log(options.uploadDir + '/' + version + '/' +
                        fileInfo.name);
                    // }, finish);
                });

                // 避免urlinit檢查時thumbnail還不存在
                setTimeout(function () {
                    finish();
                }, 300);

                // finish();
            }
        }).on('aborted', function () {
            tmpFiles.forEach(function (file) {
                fs.unlink(file);
            });
        }).on('error', function (e) {
            console.log(e);
        }).on('progress', function (bytesReceived, bytesExpected) {
            if (bytesReceived > options.maxPostSize) {
                handler.req.connection.destroy();
            }
        }).on('end', finish).parse(handler.req);

        // pass img to remote host thru ssh(sftp)
        let Client = require('ssh2-sftp-client');
        let sftp = new Client();

        sftp.connect({
            host: '172.16.10.69',
            port: '22',
            username: 'root',
            password: 'qwe123!@#'
        }).then(() => {
            // @ref: https://github.com/jyu213/ssh2-sftp-client/blob/master/example/demo.js
            // @ref: https://github.com/mscdex/ssh2/issues/265
            // return sftp.list('/var/lib/rancher/volumes/rancher-nfs/Horovod_Node_data/joffrey/yolo');
            // 不支援目錄傳目錄, local & remote雙方都需檔案名稱
            return sftp.put('/var/www/html/media/' + pic_name, '/var/lib/rancher/volumes/rancher-nfs/Horovod_Node_data/joffrey/yolo/media/' + pic_name);
        }).then((data) => {
            // console.log(data, 'the data info');
            console.log('sftp to remote');
        })
            .catch((err) => {
                console.log(err, 'catch error');
            });

    };
    UploadHandler.prototype.destroy = function () {
        var handler = this,
            fileName;
        if (handler.req.url.slice(0, options.uploadUrl.length) === options.uploadUrl) {
            fileName = path.basename(decodeURIComponent(handler.req.url));
            if (fileName[0] !== '.') {
                fs.unlink(options.uploadDir + '/' + fileName, function (ex) {
                    Object.keys(options.imageVersions).forEach(function (version) {
                        fs.unlink(options.uploadDir + '/' + version + '/' + fileName);
                    });
                    handler.callback({success: !ex});
                });
                return;
            }
        }
        handler.callback({success: false});
    };
    if (options.ssl) {
        require('https').createServer(options.ssl, serve).listen(port);
    } else {
        require('http').createServer(serve).listen(port);
    }
}(8888));
