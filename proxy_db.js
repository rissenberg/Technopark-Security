const http = require('http');
const net = require('net');
const fs = require('fs');
const url = require('url');
const Url = require("url");
const {MongoClient} = require('mongodb')

const PORT = 8080;

const caPrivateKey = fs.readFileSync('cert/ca-key.pem');
const caCertificate = fs.readFileSync('cert/ca-cert.pem');
const tlsOptions = {
    key: caPrivateKey,
    cert: caCertificate,
    rejectUnauthorized: false
};

// Подключение к БД
const mongoURL = 'mongodb://rissenberg:password@127.0.0.1:27017/?authMechanism=DEFAULT';
const dbName = 'proxy_cache';

const MongoDBClient = new MongoClient(mongoURL)
const connectMDB = async () =>{
    try {
        await MongoDBClient.connect()
        console.log("Успешно подключились к MongoDB")
    } catch (e) {
        console.log(e)
    }
}

connectMDB();

const saveRequestResponse = async (reqResObj) => {
    try {
        // await MongoDBClient.connect()
        // console.log("Успешно подключились к базе данных")

        const reqRes = MongoDBClient.db(dbName).collection('requests_responses')
        await reqRes.insertOne(reqResObj)

        console.log("Успешно записано в БД")
    } catch (e) {
        console.log(e)
        await MongoDBClient.close();
        connectMDB();
    }
};


const reqResParser = (req, res) => {
    // Парсим Request
    const parsedUrl = Url.parse(req.url, true);
    const method = req.method;
    const path = parsedUrl.pathname;
    const queryParams = parsedUrl.query;

    const headers = req.headers;

    const cookies = {};
    if (headers.cookie) {
        headers.cookie.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            cookies[parts[0].trim()] = parts[1].trim();
        });
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk;
    });

    let postParams = {};
    if (headers['content-type'] === 'application/x-www-form-urlencoded') {
        postParams = body.split('&').reduce((acc, param) => {
            const [key, value] = param.split('=');
            acc[key] = decodeURIComponent(value);
            return acc;
        }, {});
    }

    const requestData = {
        method,
        path,
        queryParams,
        headers,
        cookies,
        postParams
    };

    // Парсим Response
    const statusRes = res.statusCode;
    const headersRes = res.headers;
    const message = res.statusMessage;
    let bodyRes = '';
    res.on('data', chunk => {
        bodyRes += chunk;
    });

    const responseData = {
        status: statusRes,
        message,
        headers: headersRes,
        body: bodyRes,
    };

    return {
        Request: requestData,
        Response: responseData,
    };
}


// Обработка обычных HTTP запросов
const server = http.createServer((req, res) => {
    console.log(`Проксирование запроса ${req.method} ${req.url}`)

    const { method, url, headers } = req;
    const { host } = headers;

    const proxyPath = new URL(url).pathname

    delete headers['proxy-connection'];

    let body = [];
    req.on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        body = Buffer.concat(body).toString();

        const options = {
            hostname: host,
            port: 80,
            path: proxyPath,
            method,
            headers
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers)
                .on('error', (err) => console.log(err));
            proxyRes.pipe(res, {end: true});

            proxyRes.on('end', () => {
                // console.log(reqResParser(req, proxyRes));
                saveRequestResponse(reqResParser(req, proxyRes));
            });

        });

        proxyReq.on('error', (err) => console.log(err))

        proxyReq.write(body);
        proxyReq.end();
    });
});

// HTTPS соединение
server.on('connect', (req, clientSocket) => {
    console.log(`Проксирование HTTPS запроса ${req.method} ${req.url}`)

    const { port, hostname } = url.parse(`https://${req.url}`);
    const serverSocket = net.connect(port, hostname);

    serverSocket.on('connect', (res) => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
        console.error(err);
        clientSocket.end();
    });

    clientSocket.on('error', (err) => {
        console.error(err);
        serverSocket.end();
    });
});

server.on('error', (err) => {
    console.error(err);
})

server.listen(PORT, (err) => {
    if (err) {
        return console.error(err)
    }
    console.log('HTTP прокси сервер запущен на порту: ' + server.address().port);
});