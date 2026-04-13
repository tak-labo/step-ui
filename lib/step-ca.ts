import { generateKeyPairSync } from 'node:crypto'

export interface StepCAConfig {
  caUrl: string
  fingerprint: string
  provisioner: string
  provisionerPassword: string
}

export interface CertificateSubject {
  commonName: string
  sans: string[]
}

export interface CertificateInfo {
  serialNumber: string
  commonName: string
  notBefore: string
  notAfter: string
  sans: string[]
  status: 'active' | 'revoked' | 'expired'
}

export interface GenerateCertResult {
  certificate: string  // PEM形式
  privateKey: string   // PEM形式
}

export class StepCAClient {
  constructor(private config: StepCAConfig) {}

  buildCertificateSubject(hostname: string, additionalSans: string[]): CertificateSubject {
    const sans = additionalSans.length > 0
      ? [hostname, ...additionalSans.filter(s => s !== hostname)]
      : [hostname]
    return { commonName: hostname, sans }
  }

  parseDuration(duration: string): string {
    const valid = /^\d+(h|d|m|y)$/.test(duration)
    return valid ? duration : '24h'
  }

  private async fetchCA(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.caUrl}${path}`
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  }

  async getOneTimeToken(subject: string): Promise<string> {
    const res = await this.fetchCA('/1.0/token', {
      method: 'POST',
      body: JSON.stringify({
        subject,
        provisioner: this.config.provisioner,
        password: this.config.provisionerPassword,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OTT取得失敗: ${err}`)
    }
    const data = await res.json() as { token: string }
    return data.token
  }

  async generateCertificate(
    hostname: string,
    sans: string[],
    duration: string
  ): Promise<GenerateCertResult> {
    const subject = this.buildCertificateSubject(hostname, sans)
    const validDuration = this.parseDuration(duration)

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })

    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

    const token = await this.getOneTimeToken(hostname)

    const res = await this.fetchCA('/1.0/sign', {
      method: 'POST',
      body: JSON.stringify({
        csr: publicKey.export({ type: 'spki', format: 'pem' }),
        ott: token,
        sans: subject.sans,
        notAfter: validDuration,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`証明書生成失敗: ${err}`)
    }

    const data = await res.json() as { crt: string; ca: string }
    return {
      certificate: data.crt,
      privateKey: privateKeyPem,
    }
  }

  async listCertificates(): Promise<CertificateInfo[]> {
    const token = await this.getAdminToken()
    const res = await this.fetchCA('/admin/certs', {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`証明書一覧取得失敗: ${err}`)
    }

    const data = await res.json() as {
      certificates: Array<{
        serialNumber: string
        subject: { commonName: string }
        notBefore: string
        notAfter: string
        sans: string[]
        revoked: boolean
      }>
    }

    return data.certificates.map(cert => ({
      serialNumber: cert.serialNumber,
      commonName: cert.subject.commonName,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      sans: cert.sans,
      status: cert.revoked
        ? 'revoked'
        : new Date(cert.notAfter) < new Date()
          ? 'expired'
          : 'active',
    }))
  }

  async revokeCertificate(serialNumber: string): Promise<void> {
    const token = await this.getAdminToken()
    const res = await this.fetchCA(`/admin/certs/${serialNumber}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`失効処理失敗: ${err}`)
    }
  }

  async listProvisioners(): Promise<Array<{ name: string; type: string; details: unknown }>> {
    const token = await this.getAdminToken()
    const res = await this.fetchCA('/admin/provisioners', {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`プロビジョナー一覧取得失敗: ${err}`)
    }

    const data = await res.json() as { provisioners: Array<{ name: string; type: string }> }
    return data.provisioners.map(p => ({ name: p.name, type: p.type, details: p }))
  }

  async createAcmeProvisioner(name: string): Promise<void> {
    const token = await this.getAdminToken()
    const res = await this.fetchCA('/admin/provisioners', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        name,
        type: 'ACME',
        details: { type: 'ACME' },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`プロビジョナー作成失敗: ${err}`)
    }
  }

  async deleteProvisioner(name: string): Promise<void> {
    const token = await this.getAdminToken()
    const res = await this.fetchCA(`/admin/provisioners/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`プロビジョナー削除失敗: ${err}`)
    }
  }

  getAcmeDirectoryUrl(provisionerName: string): string {
    return `${this.config.caUrl}/acme/${encodeURIComponent(provisionerName)}/directory`
  }

  private async getAdminToken(): Promise<string> {
    const res = await this.fetchCA('/admin/token', {
      method: 'POST',
      body: JSON.stringify({
        provisioner: this.config.provisioner,
        password: this.config.provisionerPassword,
      }),
    })
    if (!res.ok) {
      return this.config.provisionerPassword
    }
    const data = await res.json() as { token: string }
    return data.token
  }
}

export function getStepCAClient(): StepCAClient {
  return new StepCAClient({
    caUrl: process.env.CA_URL ?? 'https://step-ca:9000',
    fingerprint: process.env.CA_FINGERPRINT ?? '',
    provisioner: process.env.CA_PROVISIONER ?? 'admin',
    provisionerPassword: process.env.CA_PROVISIONER_PASSWORD ?? '',
  })
}
