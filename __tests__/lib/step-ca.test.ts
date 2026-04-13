import { StepCAClient } from '@/lib/step-ca'

describe('StepCAClient', () => {
  const client = new StepCAClient({
    caUrl: 'https://step-ca:9000',
    fingerprint: 'test-fingerprint',
    provisioner: 'admin',
    provisionerPassword: 'test-password',
  })

  describe('buildCertificateSubject', () => {
    it('ホスト名からSubjectを構築する', () => {
      const subject = client.buildCertificateSubject('example.com', ['192.168.1.1'])
      expect(subject.commonName).toBe('example.com')
      expect(subject.sans).toContain('192.168.1.1')
    })

    it('SANが空の場合はホスト名のみ', () => {
      const subject = client.buildCertificateSubject('example.com', [])
      expect(subject.sans).toEqual(['example.com'])
    })
  })

  describe('parseDuration', () => {
    it('24hを正しくパースする', () => {
      expect(client.parseDuration('24h')).toBe('24h')
    })

    it('不正な値はデフォルト24hを返す', () => {
      expect(client.parseDuration('invalid')).toBe('24h')
    })
  })
})
