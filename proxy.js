const http = require('http');
const net = require('net');
const fs = require('fs');
const url = require('url');

const PORT = 8080;

const caPrivateKey = fs.readFileSync('cert/ca-key.pem');
const caCertificate = fs.readFileSync('cert/ca-cert.pem');
const tlsOptions = {
    key: caPrivateKey,
    cert: caCertificate,
    rejectUnauthorized: false
};

// Обработка обычных HTTP запросов
const server = http.createServer((req, res) => {
    console.log(`Проксирование запроса ${req.method} ${req.url}`)

    const { method, url, headers } = req;
    const { host } = headers;

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
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => console.log(err))

    proxyReq.end();
});

// HTTPS соединение
server.on('connect', (req, clientSocket) => {
    console.log(`Проксирование HTTPS запроса ${req.method} ${req.url}`)

    const { port, hostname } = url.parse(`https://${req.url}`);
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