jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

import { auth } from '@/lib/auth'
import { POST } from '@/app/api/certificates/[name]/export/route'

describe('POST /api/certificates/[name]/export', () => {
  const authMock = auth as jest.MockedFunction<typeof auth>

  beforeEach(() => {
    jest.resetAllMocks()
    authMock.mockResolvedValue({} as never)
  })

  it.each([
    ['cert', 'example.com.crt', 'CERTIFICATE'],
    ['key', 'example.com.key', 'PRIVATE KEY'],
    ['pem', 'example.com.pem', 'CERTIFICATE\nPRIVATE KEY'],
  ])('exports %s format', async (format, filename, expected) => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          certificate: 'CERTIFICATE',
          privateKey: 'PRIVATE KEY',
          format,
        }),
      }),
      {
        params: Promise.resolve({ name: 'example.com' }),
      }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${filename}"`)
    await expect(res.text()).resolves.toBe(expected)
  })
})
