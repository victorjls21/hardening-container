const http = require('node:http');

const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.url === '/health' ? 'OK\n' : 'Olá mundo!\n');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Não encontrado\n');
});

server.listen(port, host, () => {
  console.log(`Olá mundo! Servidor HTTP ouvindo na porta ${port}`);
});
