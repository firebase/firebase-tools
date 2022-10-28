const express = require('express');
const { join } = require('path');

const server = express();
const distFolder = join(process.cwd(), 'lib');

server.set('views engine', 'html');
server.set('views', distFolder);

server.get('*.*', express.static(distFolder, {
    maxAge: '1y'
}));

server.get('/profile', (req, res) => {
    console.log(req);
    res.send('...');
});

server.get('/', (req, res) => {
    console.log(req);
    res.send('...');
});

if (require.main.filename === __filename) {
    const port = process.env.PORT || 8080;
    server.listen(port);
    console.log(`listening on port ${port}...`);
}

exports.app = () => server;
