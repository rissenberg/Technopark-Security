const http = require('http');
const net = require('net');
const fs = require('fs');
const Url = require('url');
// const mongodb = require('mongodb').MongoClient;

const PORT = 8080;

const caPrivateKey = fs.readFileSync('cert/ca-key.pem');
const caCertificate = fs.readFileSync('cert/ca-cert.pem');
const tlsOptions = {
    key: caPrivateKey,
    cert: caCertificate,
    rejectUnauthorized: false
};

const reqParser = (req) => {
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
        body,
        postParams
    };

    return requestData;
}

// Подключение к БД
// const mongoURL = 'mongodb://rissenberg:password@127.0.0.1:27017/?authMechanism=DEFAULT';
// const dbName = 'proxy_cache';
//
// const {MongoClient} = require('mongodb')
//
// const MongoDBclient = new MongoClient('mongodb://Timeweb:cloud@127.0.0.1:27017/?authMechanism=DEFAULT')
//
//
// const connect = async () =>{
//     try {
//         await MongoDBclient.connect()
//         console.log("Успешно подключились к базе данных")
//         await MongoDBclient.close()
//         console.log("Закрыли подключение")
//     } catch (e) {
//         console.log(e)
//     }
// }
//
// connect()
//
// const saveRequestResponse = (request, response) => {
//     collection.insertOne({ request, response }, (err, result) => {
//         if (err) {
//             console.error('Ошибка сохранения в базу данных:', err);
//         }
//     });
// };

// Обработка обычных HTTP запросов
const server = http.createServer((req, res) => {
    console.log(`Проксирование запроса ${req.method} ${req.url}`)

    const {method, url, headers} = req;
    const {host} = headers;

    const proxyPath = new URL(url).pathname

    delete headers['proxy-connection'];

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

        proxyReq.on('error', (err) => console.log(err))
    });

    req.on('end', () => {
        console.log(reqParser(req))
    });

    proxyReq.end();
});

// HTTPS соединение
server.on('connect', (req, clientSocket) => {
    console.log(`Проксирование HTTPS запроса ${req.method} ${req.url}`)

    const {port, hostname} = Url.parse(`https://${req.url}`);
    const serverSocket = net.connect(port, hostname);

    serverSocket.on('connect', () => {
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

