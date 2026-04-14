jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/cert-store', () => ({
  loadCerts: jest.fn(),
  removeCert: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { loadCerts, removeCert } from '@/lib/cert-store'
import { DELETE } from '@/app/api/certificates/[name]/route'

describe('DELETE /api/certificates/[name]', () => {
  const authMock = auth as jest.MockedFunction<typeof auth>
  const loadCertsMock = loadCerts as jest.MockedFunction<typeof loadCerts>
  const removeCertMock = removeCert as jest.MockedFunction<typeof removeCert>

  beforeEach(() => {
    jest.resetAllMocks()
    authMock.mockResolvedValue({} as never)
  })

  it('失効済み証明書を削除する', async () => {
    loadCertsMock.mockReturnValue([
      {
        serialNumber: 'abc123',
        commonName: 'example.com',
        notBefore: '2026-04-14T00:00:00.000Z',
        notAfter: '2026-05-14T00:00:00.000Z',
        sans: ['example.com'],
        status: 'revoked',
      },
    ])
    removeCertMock.mockReturnValue(true)

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ name: 'abc123' }),
    })

    expect(res.status).toBe(200)
    expect(removeCertMock).toHaveBeenCalledWith('abc123')
  })

  it('active 証明書は削除できない', async () => {
    loadCertsMock.mockReturnValue([
      {
        serialNumber: 'abc123',
        commonName: 'example.com',
        notBefore: '2026-04-14T00:00:00.000Z',
        notAfter: '2026-05-14T00:00:00.000Z',
        sans: ['example.com'],
        status: 'active',
      },
    ])

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ name: 'abc123' }),
    })

    expect(res.status).toBe(409)
    expect(removeCertMock).not.toHaveBeenCalled()
  })
})
