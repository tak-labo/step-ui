jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}))

import { readFileSync } from 'fs'
import { GET } from '@/app/api/ca-certs/route'

describe('GET /api/ca-certs', () => {
  const readFileSyncMock = readFileSync as jest.MockedFunction<typeof readFileSync>

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('root CA を公開する', async () => {
    readFileSyncMock.mockReturnValue('ROOT-PEM' as never)

    const res = await GET(new Request('http://localhost/api/ca-certs?type=root'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="root_ca.crt"')
    await expect(res.text()).resolves.toBe('ROOT-PEM')
  })

  it('intermediate CA を公開する', async () => {
    readFileSyncMock.mockReturnValue('INTERMEDIATE-PEM' as never)

    const res = await GET(new Request('http://localhost/api/ca-certs?type=intermediate'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="intermediate_ca.crt"')
    await expect(res.text()).resolves.toBe('INTERMEDIATE-PEM')
  })

  it('type が不正なら 400 を返す', async () => {
    const res = await GET(new Request('http://localhost/api/ca-certs?type=other'))

    expect(res.status).toBe(400)
  })
})
