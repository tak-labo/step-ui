jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process') as typeof import('child_process')
  return {
    ...actual,
    execFileSync: jest.fn(),
  }
})

jest.mock('fs', () => {
  const actual = jest.requireActual('fs') as typeof import('fs')
  return {
    ...actual,
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
  }
})

import { execFileSync } from 'child_process'
import { StepCAClient } from '@/lib/step-ca'

describe('StepCAClient admin cert flow', () => {
  it('uses the configured JWK provisioner when minting admin certs', () => {
    const execFileSyncMock = execFileSync as jest.MockedFunction<typeof execFileSync>
    execFileSyncMock.mockReturnValue('' as never)

    const client = new StepCAClient({
      caUrl: 'https://step-ca:9000',
      fingerprint: 'test-fingerprint',
      provisioner: 'admin',
      provisionerPassword: 'test-password',
    })

    client.createAcmeProvisioner('acme')

    const adminCertCall = execFileSyncMock.mock.calls.find(([, args]) =>
      Array.isArray(args) && args[0] === 'ca' && args[1] === 'certificate'
    )

    expect(adminCertCall).toBeDefined()
    const args = adminCertCall?.[1] as string[] | undefined
    expect(args).toBeDefined()
    expect(args?.[args.indexOf('--provisioner') + 1]).toBe('admin')
    expect(args).not.toContain('Admin JWK')
  })
})
