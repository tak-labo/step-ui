import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStepCAClient } from '@/lib/step-ca'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const client = getStepCAClient()
    const certificates = await client.listCertificates()
    return NextResponse.json({ certificates })
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
