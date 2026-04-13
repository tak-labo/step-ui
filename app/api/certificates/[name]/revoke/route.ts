import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStepCAClient } from '@/lib/step-ca'

interface Params {
  params: Promise<{ name: string }>
}

export async function POST(_request: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { name } = await params
  const serialNumber = decodeURIComponent(name)

  try {
    const client = getStepCAClient()
    client.revokeCertificate(serialNumber)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
