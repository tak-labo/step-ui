import { readFileSync, writeFileSync, existsSync } from 'fs'
import { CertificateInfo } from './step-ca'

// /app/data は docker-compose.yml で cert-store ボリュームをマウントする書き込み可能な領域
const STORE_PATH = '/app/data/certs.json'

export function loadCerts(): CertificateInfo[] {
  try {
    if (!existsSync(STORE_PATH)) return []
    const raw = readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw) as CertificateInfo[]
  } catch {
    return []
  }
}

export function saveCert(cert: CertificateInfo): void {
  const certs = loadCerts()
  const existing = certs.findIndex(c => c.serialNumber === cert.serialNumber)
  if (existing >= 0) {
    certs[existing] = cert
  } else {
    certs.push(cert)
  }
  writeFileSync(STORE_PATH, JSON.stringify(certs, null, 2))
}

export function updateCertStatus(serialNumber: string, status: CertificateInfo['status']): void {
  const certs = loadCerts()
  const cert = certs.find(c => c.serialNumber === serialNumber)
  if (cert) {
    cert.status = status
    writeFileSync(STORE_PATH, JSON.stringify(certs, null, 2))
  }
}
