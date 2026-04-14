import { getAcmeDurationFields } from '@/lib/acme-provisioner'

describe('getAcmeDurationFields', () => {
  it('claims から default / min / max を抽出する', () => {
    expect(
      getAcmeDurationFields({
        name: 'acme',
        type: 'ACME',
        claims: {
          minTLSCertDuration: '5m',
          defaultTLSCertDuration: '720h',
          maxTLSCertDuration: '87600h',
        },
      })
    ).toEqual([
      { label: 'default', value: '720h' },
      { label: 'min', value: '5m' },
      { label: 'max', value: '87600h' },
    ])
  })

  it('claims がない場合は空配列を返す', () => {
    expect(getAcmeDurationFields({ name: 'acme', type: 'ACME' })).toEqual([])
  })
})
