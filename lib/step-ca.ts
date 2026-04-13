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

  // パスワードファイルを一時作成してコールバックを実行し、確実に削除する。
  // execFileSync（配列引数）でシェルインジェクションを防止。
  private withPassFile<T>(fn: (passFile: string) => T): T {
    const tmpPass = join(tmpdir(), `step-pass-${randomBytes(8).toString('hex')}`)
    try {
      writeFileSync(tmpPass, this.config.provisionerPassword, { mode: 0o600 })
      return fn(tmpPass)
    } finally {
      try { unlinkSync(tmpPass) } catch { /* ignore */ }
    }
  }

  // JWKプロビジョナーのOTT（One-Time Token）を生成する。
  // step CLIが /home/step/secrets/ の暗号化JWKをパスワードで復号してJWTを署名する。
  getOneTimeToken(subject: string): string {
    return this.withPassFile(passFile =>
      execFileSync('step', [
        'ca', 'token',
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
        '--provisioner', this.config.provisioner,
        '--provisioner-password-file', passFile,
        subject,
      ], { encoding: 'utf-8', timeout: 15000 }).trim()
    )
  }

  async generateCertificate(
    hostname: string,
    sans: string[],
    duration: string
  ): Promise<GenerateCertResult> {
    const subject = this.buildCertificateSubject(hostname, sans)
    const validDuration = this.parseDuration(duration)

    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify']
    )

    const privateKeyBuf = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
    const privateKeyPem = [
      '-----BEGIN PRIVATE KEY-----',
      Buffer.from(privateKeyBuf).toString('base64').match(/.{1,64}/g)!.join('\n'),
      '-----END PRIVATE KEY-----',
    ].join('\n')

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

  // 証明書一覧は /1.0/provisioners 経由では取得できないため、
  // step CLI の `step ca list` を使用する（認証不要）。
  // step CLI 0.27.4 に list サブコマンドがない場合は空配列を返す。
  async listCertificates(): Promise<CertificateInfo[]> {
    try {
      const out = execFileSync('step', [
        'ca', 'admin', 'list',
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
      ], { encoding: 'utf-8', timeout: 15000 })

      // JSON出力をパース（step CLIのバージョンによって形式が異なる場合あり）
      const certs = JSON.parse(out) as Array<{
        serial: string
        subject: { commonName?: string }
        notBefore: string
        notAfter: string
        sans?: string[]
        revoked?: boolean
      }>

      return certs.map(cert => ({
        serialNumber: cert.serial,
        commonName: cert.subject.commonName ?? '',
        notBefore: cert.notBefore,
        notAfter: cert.notAfter,
        sans: cert.sans ?? [],
        status: cert.revoked
          ? 'revoked'
          : new Date(cert.notAfter) < new Date()
            ? 'expired'
            : 'active',
      }))
    } catch {
      // step CLI 0.27.4 では証明書一覧コマンドがない可能性がある
      return []
    }
  }

  // `step ca revoke` CLIコマンドで証明書を失効させる（admin API不要）
  revokeCertificate(serialNumber: string): void {
    this.withPassFile(passFile => {
      execFileSync('step', [
        'ca', 'revoke', serialNumber,
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
        '--provisioner', this.config.provisioner,
        '--provisioner-password-file', passFile,
      ], { encoding: 'utf-8', timeout: 15000 })
    })
  }

  // プロビジョナー一覧は認証不要の /1.0/provisioners で取得する
  async listProvisioners(): Promise<Array<{ name: string; type: string; details: unknown }>> {
    const res = await this.fetchCA('/1.0/provisioners')

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`プロビジョナー一覧取得失敗: ${err}`)
    }

    const data = await res.json() as { provisioners: Array<{ name: string; type: string }> }
    return data.provisioners.map(p => ({ name: p.name, type: p.type, details: p }))
  }

  // `step ca provisioner add` CLIコマンドでACMEプロビジョナーを作成する
  createAcmeProvisioner(name: string): void {
    this.withPassFile(passFile => {
      execFileSync('step', [
        'ca', 'provisioner', 'add', name,
        '--type', 'ACME',
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
        '--admin-provisioner', this.config.provisioner,
        '--admin-password-file', passFile,
      ], { encoding: 'utf-8', timeout: 15000 })
    })
  }

  // `step ca provisioner remove` CLIコマンドでプロビジョナーを削除する
  deleteProvisioner(name: string): void {
    this.withPassFile(passFile => {
      execFileSync('step', [
        'ca', 'provisioner', 'remove', name,
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
        '--admin-provisioner', this.config.provisioner,
        '--admin-password-file', passFile,
      ], { encoding: 'utf-8', timeout: 15000 })
    })
  }

  getAcmeDirectoryUrl(provisionerName: string): string {
    return `${this.config.caUrl}/acme/${encodeURIComponent(provisionerName)}/directory`
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
