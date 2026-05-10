import path from 'node:path'
import { existsSync, statSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { Client } from 'basic-ftp'
import dotenv from 'dotenv'

dotenv.config()

const BUILD_DIR = process.env.BUILD_DIR || path.join(process.cwd(), 'dist')
const FTP_HOST = process.env.FTP_HOST
const FTP_PORT = parseInt(process.env.FTP_PORT || '21', 10)
const FTP_USER = process.env.FTP_USER
const FTP_PASSWORD = (process.env.FTP_PASSWORD || '').replace(/^["']|["']$/g, '')
const FTP_DIR = (process.env.FTP_DIR || '/lumirail.fr').replace(/\/+$/, '')
const REMOTE_DIR = `${FTP_DIR}/software/update`

const UPDATE_META = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']

function fail (msg) {
  console.error(msg)
  process.exit(1)
}

if (!FTP_HOST || !FTP_USER) {
  fail('Missing FTP_HOST or FTP_USER. Set FTP_* in .env')
}

if (!existsSync(BUILD_DIR)) {
  fail(`Build directory not found: ${BUILD_DIR}`)
}

const stat = statSync(BUILD_DIR)
if (!stat.isDirectory()) {
  fail(`BUILD_DIR is not a directory: ${BUILD_DIR}`)
}

const pkgPath = path.join(process.cwd(), 'package.json')
if (!existsSync(pkgPath)) {
  fail('package.json not found')
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const version = pkg.version || '0.0.0'
const versionJsonPath = path.join(BUILD_DIR, 'version.json')
writeFileSync(versionJsonPath, JSON.stringify({ version }, null, 0) + '\n', 'utf8')
console.log('Version:', version)

const files = readdirSync(BUILD_DIR)
const ymlPresent = UPDATE_META.some((name) => files.includes(name))
if (!ymlPresent) {
  fail('No update metadata (latest.yml, latest-mac.yml or latest-linux.yml) in dist. Run electron:build first.')
}
for (const name of UPDATE_META) {
  const ymlPath = path.join(BUILD_DIR, name)
  if (existsSync(ymlPath)) {
    const yamlName = name.replace(/\.yml$/, '.yaml')
    const yamlPath = path.join(BUILD_DIR, yamlName)
    writeFileSync(yamlPath, readFileSync(ymlPath, 'utf8'), 'utf8')
    console.log('Wrote', yamlName)
  }
}

const client = new Client(60 * 1000)
client.ftp.verbose = process.env.FTP_VERBOSE === '1'

try {
  await client.access({
    host: FTP_HOST,
    port: FTP_PORT,
    user: FTP_USER,
    password: FTP_PASSWORD,
    secure: false,
  })
  await client.ensureDir(REMOTE_DIR)
  await client.uploadFromDir(BUILD_DIR, REMOTE_DIR)
  console.log('Upload done: ' + REMOTE_DIR)
} catch (err) {
  console.error('FTP error:', err.message)
  process.exit(1)
} finally {
  client.close()
}
