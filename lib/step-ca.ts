import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { execFileSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'

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

  getOneTimeToken(subject: string): string {
    return this.runStepToken(subject, false)
  }

  async generateCertificate(
    hostname: string,
    sans: string[],
    duration: string
  ): Promise<GenerateCertResult> {
    const subject = this.buildCertificateSubject(hostname, sans)
    const validDuration = this.parseDuration(duration)

    // WebCrypto APIでRSA鍵ペアを生成（@peculiar/x509はWebCrypto使用）
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify']
    )

    // 秘密鍵をPKCS8 PEM形式にエクスポート
    const privateKeyBuf = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
    const privateKeyPem = [
      '-----BEGIN PRIVATE KEY-----',
      Buffer.from(privateKeyBuf).toString('base64').match(/.{1,64}/g)!.join('\n'),
      '-----END PRIVATE KEY-----',
    ].join('\n')

    // 正しいCSRを生成（秘密鍵で自己署名）
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: `CN=${hostname}`,
      keys: keyPair,
      signingAlgorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      extensions: [
        new x509.SubjectAlternativeNameExtension([
          ...subject.sans
            .filter(s => !s.match(/^\d+\.\d+\.\d+\.\d+$/))
            .map(s => ({ type: 'dns' as const, value: s })),
          ...subject.sans
            .filter(s => s.match(/^\d+\.\d+\.\d+\.\d+$/))
            .map(s => ({ type: 'ip' as const, value: s })),
        ]),
      ],
    })

    const token = this.getOneTimeToken(hostname)

    const res = await this.fetchCA('/1.0/sign', {
      method: 'POST',
      body: JSON.stringify({
        csr: csr.toString('pem'),
        ott: token,
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
    const token = this.getAdminToken()
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
    const token = this.getAdminToken()
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
    const token = this.getAdminToken()
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
    const token = this.getAdminToken()
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
    const token = this.getAdminToken()
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

  // step CLIを使ってトークンを生成する。
  // step-caはトークンをAPIで発行しない。JWKプロビジョナーの秘密鍵（/home/step/secrets/）を
  // プロビジョナーパスワードで復号してJWTを署名する必要がある。
  // step CLIがその処理を担当する。
  //
  // docker-compose.ymlで step-data:/home/step:ro をマウント済みなので
  // Next.jsコンテナからも /home/step/certs/root_ca.crt が参照できる。
  //
  // execFileSync（引数を配列で渡す）でシェルインジェクションを防止している。
  private runStepToken(subject: string, isAdmin: boolean): string {
    const tmpPass = join(tmpdir(), `step-pass-${randomBytes(8).toString('hex')}`)
    try {
      writeFileSync(tmpPass, this.config.provisionerPassword, { mode: 0o600 })

      const args = [
        'ca', 'token',
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
        '--provisioner', this.config.provisioner,
        '--provisioner-password-file', tmpPass,
        ...(isAdmin
          ? ['--admin-provisioner', this.config.provisioner, '--admin-subject', 'step-ui']
          : []),
        subject,
      ]

      return execFileSync('step', args, {
        encoding: 'utf-8',
        timeout: 15000,
      }).trim()
    } finally {
      try { unlinkSync(tmpPass) } catch { /* ignore */ }
    }
  }

  private getAdminToken(): string {
    return this.runStepToken('step-ui', true)
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
