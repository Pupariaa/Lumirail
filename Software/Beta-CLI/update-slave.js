const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

function toHex(buf) {
    let s = '';
    for (let i = 0; i < buf.length; i++) s += buf[i].toString(16).padStart(2, '0');
    return s.toUpperCase();
}

async function main() {
    const [, , portPath, slaveIdStr, fwPath, version = '1.0.0', sessionIdStr = '1'] = process.argv;
    if (!portPath || !slaveIdStr || !fwPath) {
        console.error('Usage: node update-slave.js <COMx|/dev/ttyUSB0> <slaveId> <fw.bin> [version] [sessionId]');
        process.exit(1);
    }
    const slaveId = parseInt(slaveIdStr, 10);
    const sessionId = parseInt(sessionIdStr, 10);
    const fw = fs.readFileSync(fwPath);

    const port = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: true });
    await new Promise(resolve => port.once('open', resolve));
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', line => {
        process.stdout.write(line.trim() + '\n');
    });

    function writeLine(line) {
        return new Promise((resolve, reject) => {
            port.write(line + '\n', err => err ? reject(err) : resolve());
        });
    }

    function crc32(buf) {
        let crc = 0xFFFFFFFF >>> 0;
        for (let i = 0; i < buf.length; i++) {
            crc ^= buf[i];
            for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & (-(crc & 1)));
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    const totalCrc = crc32(fw) >>> 0;
    const totalCrcHex = '0x' + totalCrc.toString(16).toUpperCase().padStart(8, '0');
    await writeLine(`fwpush ${slaveId} ${fw.length} ${version} ${sessionId} ${totalCrcHex}`);

    await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            parser.removeListener('data', onData);
            reject(new Error('Timeout waiting for FWPUSH READY'));
        }, 35000);
        function onData(line) {
            if (line.includes('FWPUSH READY')) {
                clearTimeout(t);
                parser.removeListener('data', onData);
                resolve();
            }
        }
        parser.on('data', onData);
    });

    await new Promise((resolve, reject) => {
        let offset = 0;
        const CHUNK = 1024;
        function pump() {
            while (offset < fw.length) {
                const slice = fw.subarray(offset, Math.min(offset + CHUNK, fw.length));
                const ok = port.write(slice);
                offset += slice.length;
                if (!ok) { port.once('drain', pump); return; }
            }
            resolve();
        }
        pump();
    });
    console.log('Binary streamed. Waiting for apply...');
    setTimeout(() => process.exit(0), 500);
}

main().catch(err => { console.error(err); process.exit(1); });


