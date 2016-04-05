'use strict'

const http = require("http");
const url = require("url");
const querystring = require("querystring");
const fs = require("fs");
const Cookies = require("cookies");
const scmp = require('scmp');
const path = require('path');

function cbPromise(func) {
    return new Promise((resolve, reject) => {  func((err, result) => { if (err) { reject(err); } else { resolve(result); } }); });
}

function fsReadFileStringPromise(filePath) {
    return cbPromise((callback) => { fs.readFile(filePath, 'utf8', callback); })
} 

function fsReadDirPromise(dirPath) {
    return cbPromise((callback) => { fs.readdir(dirPath, callback); })
} 

function passwordEquals(inputPassword, goodPassword) {
    return inputPassword != '' && scmp(goodPassword.trim(), inputPassword)
}


function logToFile(file, line, callback) {
    fs.writeFile(file, line, { flag: 'a' }, (err) => {
        if (err) {
            console.log("Error opening log:", err)
            console.log("the log line: " + line);
        }
        
        callback();
    });
}

function htmlPageString(bodyString) {
    return '<!DOCTYPE html>'
    + '<html><head><title>Private Download Area</title>'
    + '<style>'
    + 'body { font-family: Helvetica, Arial, sans-serif; }'
    + '</style></head><body>'
    + bodyString
    + '</body></html>';
}

function cleanLogin(login) {
    return login.replace(/[.\/]/g, '').trim()
}

function writeLinksForUser(dataDir, response, login) {
    
    fsReadDirPromise(path.join(dataDir, login)).then((files) => {
        
        function ignoreFile(name) {
            return name.substring(0,1) == '.' || name === 'pwd.txt' || name === 'log.txt';
        }
        
        function escapeXml(name) {
            return name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        }
        
        response.writeHead(200, {"Content-Type": "text/html"});

        var responseBody = '';
        responseBody += 'Files for <b>'+login+'</b><br />';
		responseBody += '<ul>';
		for(var idx in files) {
			var name = escapeXml(files[idx]);
			if (!ignoreFile(name)) { 
			    responseBody += '<li><a href="/get/'+name+'">'+name+'</a></li>';
            }
		}
        responseBody += '</ul>';
		response.end(htmlPageString(responseBody));
        
    }).catch((err) => {
        response.writeHead(500, {"Content-Type": "text/html"});

        console.log('Very strange error in writeLinksForUser: '+ err);
		response.write('error listing files in user ' + login + ' directory');
		response.end();
    });

}

function writeLoginForm(response) {
    response.writeHead(200, {"Content-Type": "text/html"});
    
	response.end(htmlPageString('<div style="margin-top: 15%; text-align: center;">'
            + '<form method="post">'
            + '<input type="text" autocomplete="off" placeholder="Login" name="login">'
            + '<input type="password" autocomplete="off" placeholder="Password" name="password">'
            + '<input type="submit">'
            + '</form>'
            + '</div>'))
}

function checkPostAndWriteFileList(dataDir, request, postVars, response) {

	if (typeof postVars.login === 'undefined' || postVars.login == '')
	{
    	writeLoginForm(response);
	}
	else {
		const login = cleanLogin(postVars.login);
		const inputPassword = postVars.password;
    	const logPath = path.join(dataDir, login, 'log.txt');
		const authPath = path.join(dataDir, login, 'pwd.txt');

        fsReadFileStringPromise(authPath).then((goodPassword) => {
            
            if (passwordEquals(inputPassword, goodPassword)) {
                
               	const cookies = new Cookies( request, response );
				cookies.set("l", login);
				cookies.set("p", inputPassword);
                
                logToFile(logPath, logRequestString('GET', 'FILE-LIST', request), () => 
                    { writeLinksForUser(dataDir, response, login); }
                );
                
			}
            else {
                
                logToFile(logPath, logRequestString('PASSWORD-FAIL', 'FILE-LIST', request), () => 
                    { writeLoginForm(response); }
                );
            
                
            }
            
        }).catch((err) => {
            // console.log("error reading pwd.txt %s", err);
			writeLoginForm(response);
        });
        
	}
}

function accessDenied(response) {
    response.writeHead(403, {"Content-Type": "text/html"});
	response.end("Access Denied");
}

function pumpFile(req, resp, filePath) {
    var readStream = fs.createReadStream(filePath);

    readStream.pipe(resp);

    req.connection.addListener('timeout', function() {
        if (readStream.readable) {
            console.log('timed out. destroying file read stream');
            readStream.destroy();
        }
    });

    readStream.addListener('error', function (err) {
        console.log('error reading', file, util.inspect(err));
        resp.end();
    });

    resp.addListener('error', function (err) {
        console.log(new Date(), 'error writing', file, util.inspect(err));
        readStream.destroy();
    });

}

function serveFile(request, response, fileName, filePath) {
	fs.stat(filePath, function(err, stats) {
		if(err) {
			console.log("No file " + filePath + "exists!")
			response.writeHead(500, {"Content-Type": "text/plain"});
			response.write(err + "\n");
			response.end();
			return;
		}

		var contentType = 'application/octet-stream';

		if (fileName.match(/.+\.zip/i))
			contentType = 'application/zip';
		else if (fileName.match(/.+\.js/i))
			contentType = 'text/javascript';
		else if (fileName.match(/.+\.txt/i))
			contentType = 'text/plain';
		else if (fileName.match(/.+\.html/i))
			contentType = 'text/html';

		response.writeHead(200, {"Content-Type": contentType, "Content-Length": stats.size});
		pumpFile(request, response, filePath);
	});
}

function logRequestString(action, fileName, request) {
    var ip = request.connection.remoteAddress;

	if (typeof request.headers['x-real-ip'] !== 'undefined')
	    ip = request.headers['x-real-ip'];
                
    return (new Date()).toUTCString() + ": " + action + ' ' + fileName +
						' IP ' + ip +
						' AGENT ' + request.headers['user-agent'] + "\n";
    
}

function checkAuthAndServeFile(dataDir, request, response, fileName) {
 	const cookies = new Cookies( request, response );
	const login = cleanLogin(cookies.get('l') || '');
	const password = cookies.get('p');

	const logPath = path.join(dataDir, login, 'log.txt');
	const filePath = path.join(dataDir, login, fileName);

    fsReadFileStringPromise(path.join(dataDir, login, 'pwd.txt')).then((goodPassword) => {
        
        if (passwordEquals(password, goodPassword)) {
            
            logToFile(logPath, logRequestString('GET', fileName, request), () => 
                { serveFile(request, response, fileName, filePath) }
            );
            
        }
        else {

            logToFile(logPath, logRequestString('PASSWORD-FAIL', fileName, request), () => 
                { accessDenied(response); }
            );
             
        }
        
    }).catch((err) => {
		console.log('no file found: ', err);
		accessDenied(response);
    });

}



module.exports = function serve(port, dataDir) {
    
    http.createServer(function(request, response) {
    	var postData = '';

     	request.addListener("data", function(postDataChunk) {
          postData += postDataChunk;
        });

        request.addListener("end", function() {
    		var url_parts = url.parse(request.url);
    		if (url_parts.pathname == '/') {
                const postVars = querystring.parse(postData)
                checkPostAndWriteFileList(dataDir, request, postVars, response);
            }
    		else if (url_parts.pathname.indexOf("/get/") === 0) {
            
    			var fileName = url_parts.pathname.substring("/get/".length);
    			fileName = querystring.unescape(fileName);
    			fileName = fileName.replace('/', '');
                
    			checkAuthAndServeFile(dataDir, request, response, fileName);
            
    		}
    		else {
                
    			response.writeHead(404, {"Content-Type": "text/html"});
    			response.write('Not Found');
    			response.end();
    		}
        
        });

    }).listen(port);
   
}
