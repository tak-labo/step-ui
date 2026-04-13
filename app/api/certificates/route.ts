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

export async function POST(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  let body: { hostname: string; sans: string[]; duration: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { hostname, sans, duration } = body

  if (!hostname || typeof hostname !== 'string') {
    return NextResponse.json({ error: 'hostnameは必須です' }, { status: 400 })
  }

  const hostnameRegex = /^[a-zA-Z0-9._-]+$/
  if (!hostnameRegex.test(hostname)) {
    return NextResponse.json({ error: 'hostnameが不正です' }, { status: 400 })
  }

  try {
    const client = getStepCAClient()
    const result = await client.generateCertificate(
      hostname,
      Array.isArray(sans) ? sans : [],
      duration ?? '24h'
    )
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
