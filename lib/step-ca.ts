import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { execFileSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { loadCerts, saveCert, updateCertStatus } from './cert-store'
import { DEFAULT_CERT_DURATION } from './cert-duration'
import type { AcmeProvisioner } from './acme-provisioner'

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
  certificatePem?: string
  privateKeyPem?: string
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
    return valid ? duration : DEFAULT_CERT_DURATION
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

    // 発行した証明書のメタデータをローカルストアに保存（一覧表示用）
    try {
      const parsed = new x509.X509Certificate(data.crt)
      saveCert({
        serialNumber: parsed.serialNumber,
        commonName: hostname,
        notBefore: parsed.notBefore.toISOString(),
        notAfter: parsed.notAfter.toISOString(),
        sans: subject.sans,
        status: 'active',
        certificatePem: data.crt,
        privateKeyPem,
      })
    } catch { /* メタデータ保存失敗は無視 */ }

    return {
      certificate: data.crt,
      privateKey: privateKeyPem,
    }
  }

  // 証明書一覧はローカルストアから返す。
  // step-ca の admin API は専用の管理者トークンが必要で OTT では認証できないため、
  // 証明書生成時にメタデータを /home/step/step-ui-certs.json へ保存している。
  listCertificates(): CertificateInfo[] {
    return loadCerts().map(cert => ({
      ...cert,
      // 期限切れ判定を最新化
      status: cert.status === 'revoked'
        ? 'revoked'
        : new Date(cert.notAfter) < new Date()
          ? 'expired'
          : 'active',
    }))
  }

  // `step ca revoke` CLIコマンドで証明書を失効させ、ストアのステータスも更新する。
  // step ca revoke は --provisioner-password-file を受け付けないため、
  // まず --revoke フラグ付きで OTT を生成し、--token で渡す。
  revokeCertificate(serialNumber: string): void {
    // @peculiar/x509 は16進数でserialNumberを返すが、step ca は10進数を要求する
    const decimalSerial = BigInt('0x' + serialNumber).toString(10)

    const token = this.withPassFile(passFile =>
      execFileSync('step', [
        'ca', 'token',
        '--revoke',
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
        '--provisioner', this.config.provisioner,
        '--provisioner-password-file', passFile,
        decimalSerial,
      ], { encoding: 'utf-8', timeout: 15000 }).trim()
    )
    execFileSync('step', [
      'ca', 'revoke',
      '--token', token,
      '--ca-url', this.config.caUrl,
      '--root', '/home/step/certs/root_ca.crt',
      decimalSerial,
    ], { encoding: 'utf-8', timeout: 15000 })
    updateCertStatus(serialNumber, 'revoked')
  }

  // プロビジョナー一覧は認証不要の /1.0/provisioners で取得する
  async listProvisioners(): Promise<AcmeProvisioner[]> {
    const res = await this.fetchCA('/1.0/provisioners')

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`プロビジョナー一覧取得失敗: ${err}`)
    }

    const data = await res.json() as { provisioners: AcmeProvisioner[] }
    return data.provisioners
  }

  private withAdminCert<T>(fn: (adminCert: string, adminKey: string) => T): T {
    const id = randomBytes(8).toString('hex')
    const adminCert = join(tmpdir(), `step-admin-cert-${id}.crt`)
    const adminKey = join(tmpdir(), `step-admin-key-${id}.key`)
    try {
      this.withPassFile(passFile => {
        // Remote management は CA 初期化時の JWK provisioner を管理用に昇格させる。
        // このリポジトリでは CA_PROVISIONER=admin を使うので、その provisioner をそのまま使う。
        execFileSync('step', [
          'ca', 'certificate', 'step',
          adminCert, adminKey,
          '--ca-url', this.config.caUrl,
          '--root', '/home/step/certs/root_ca.crt',
          '--provisioner', this.config.provisioner,
          '--provisioner-password-file', passFile,
          '--not-after', '5m',
          '--force',
        ], { encoding: 'utf-8', timeout: 15000 })
      })
      return fn(adminCert, adminKey)
    } finally {
      try { unlinkSync(adminCert) } catch { /* ignore */ }
      try { unlinkSync(adminKey) } catch { /* ignore */ }
    }
  }

  createAcmeProvisioner(name: string): void {
    this.withAdminCert((adminCert, adminKey) => {
      execFileSync('step', [
        'ca', 'provisioner', 'add', name,
        '--type', 'ACME',
        '--admin-cert', adminCert,
        '--admin-key', adminKey,
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
      ], { encoding: 'utf-8', timeout: 15000 })
      execFileSync('step', [
        'ca', 'provisioner', 'update', name,
        '--x509-min-dur=5m',
        '--x509-max-dur=87600h',
        '--x509-default-dur=720h',
        '--admin-cert', adminCert,
        '--admin-key', adminKey,
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
      ], { encoding: 'utf-8', timeout: 15000 })
    })
  }

  deleteProvisioner(name: string): void {
    this.withAdminCert((adminCert, adminKey) => {
      execFileSync('step', [
        'ca', 'provisioner', 'remove', name,
        '--admin-cert', adminCert,
        '--admin-key', adminKey,
        '--ca-url', this.config.caUrl,
        '--root', '/home/step/certs/root_ca.crt',
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
