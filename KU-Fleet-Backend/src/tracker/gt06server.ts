const Gt06 = require('gt06');
const net = require('net');
const PORT = 5050;

const server = net.createServer((client:any) => {
  const gt06 = new Gt06();
  console.log('📡 Client connected');

  client.on('data', (data:any) => {
    try {
      gt06.parse(data);
    } catch (e:any) {
      console.log('❌ Parse error:', e.message);
      return;
    }

    if (gt06.expectsResponse && gt06.responseMsg) {
      client.write(gt06.responseMsg);
    }

    gt06.msgBuffer.forEach((msg:any) => {
      const { event, imei, gps } = msg;

      if (event.string === 'gps') {
        console.log(`📍 GPS Data from ${imei}:`);
        console.log(gps);
      } else {
        console.log('🗃️ Message:', msg);
      }
    });

    gt06.clearMsgBuffer();
  });

  client.on('end', () => console.log('❌ Client disconnected'));
});

server.listen(PORT, () => {
  console.log(`✅ GT06 server running on TCP port ${PORT}`);
});
