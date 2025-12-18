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

    console.log(`Opening serial port ${portPath} at 921600 baud...`);
    const port = new SerialPort({ path: portPath, baudRate: 921600, autoOpen: true });
    await new Promise(resolve => {
        port.once('open', () => {
            console.log(`Serial port ${portPath} opened successfully`);
            resolve();
        });
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', line => {
        const trimmed = line.trim();
        process.stdout.write(trimmed + '\n');
    });

    function writeLine(line) {
        return new Promise((resolve, reject) => {
            port.write(line + '\n', err => {
                if (err) {
                    console.error(`Write error: ${err}`);
                    reject(err);
                } else {
                    console.log(`Command sent: ${line}`);
                    resolve();
                }
            });
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
    const fwpushCmd = `fwpush ${slaveId} ${fw.length} ${version} ${sessionId} ${totalCrcHex}`;
    console.log(`Sending command: ${fwpushCmd}`);
    await writeLine(fwpushCmd);

    console.log('Waiting for "FWPUSH READY" from Master...');
    await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            parser.removeListener('data', onData);
            reject(new Error('Timeout waiting for FWPUSH READY'));
        }, 35000);
        function onData(line) {
            console.log(`Waiting for FWPUSH READY, received: ${line}`);
            if (line.includes('FWPUSH READY')) {
                clearTimeout(t);
                parser.removeListener('data', onData);
                console.log('Received FWPUSH READY, starting binary transfer...');
                resolve();
            }
        }
        parser.on('data', onData);
    });

    await new Promise((resolve, reject) => {
        let offset = 0;
        const BLOCK_SIZE = 64736;
        const TARGET_BITRATE_KBPS = 750;
        const BYTES_PER_SECOND = (TARGET_BITRATE_KBPS * 1000) / 8;
        const THEORETICAL_DELAY = Math.round((BLOCK_SIZE / BYTES_PER_SECOND) * 1000);
        const DELAY_BETWEEN_BLOCKS = Math.max(200, THEORETICAL_DELAY + 100);

        function pump() {
            if (offset >= fw.length) {
                port.drain(() => {
                    resolve();
                });
                return;
            }

            const slice = fw.subarray(offset, Math.min(offset + BLOCK_SIZE, fw.length));
            const ok = port.write(slice);
            offset += slice.length;

            if (offset % 100000 < slice.length || offset >= fw.length) {
                console.log(`Sent ${offset}/${fw.length} bytes (${Math.round(offset * 100 / fw.length)}%)`);
            }

            if (!ok) {
                port.once('drain', () => {
                    port.drain(() => {
                        if (offset >= fw.length) {
                            resolve();
                        } else {
                            setTimeout(pump, DELAY_BETWEEN_BLOCKS);
                        }
                    });
                });
            } else {
                port.drain(() => {
                    if (offset >= fw.length) {
                        resolve();
                    } else {
                        setTimeout(pump, DELAY_BETWEEN_BLOCKS);
                    }
                });
            }
        }
        pump();
    });
    console.log('Binary streamed. Waiting for apply...');

    await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            parser.removeListener('data', onData);
            reject(new Error('Timeout waiting for FWPUSH completion'));
        }, 120000);
        function onData(line) {
            if (line.includes('FWPUSH done') || line.includes('Other slaves resumed')) {
                clearTimeout(t);
                parser.removeListener('data', onData);
                resolve();
            }
        }
        parser.on('data', onData);
    });

    console.log('Update completed');
    setTimeout(() => process.exit(0), 1000);
}

main().catch(err => { console.error(err); process.exit(1); });


