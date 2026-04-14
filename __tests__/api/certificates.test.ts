import { StepCAClient } from '@/lib/step-ca'

describe('CertificateInfo status logic', () => {
  const client = new StepCAClient({
    caUrl: 'https://step-ca:9000',
    fingerprint: 'test',
    provisioner: 'admin',
    provisionerPassword: 'test',
  })

  it('buildCertificateSubjectが正しくSANを設定する', () => {
    const subject = client.buildCertificateSubject('test.example.com', [])
    expect(subject.sans).toEqual(['test.example.com'])
  })

  it('parseDurationが無効な値を720hに変換する', () => {
    expect(client.parseDuration('')).toBe('720h')
    expect(client.parseDuration('abc')).toBe('720h')
  })
})
