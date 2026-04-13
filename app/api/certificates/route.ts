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
    const certificates = client.listCertificates()
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

  // RFC1123: hostnameは最大253文字
  const hostnameRegex = /^[a-zA-Z0-9._-]{1,253}$/
  if (!hostnameRegex.test(hostname)) {
    return NextResponse.json({ error: 'hostnameが不正です（英数字・ドット・ハイフン・アンダースコア、253文字以内）' }, { status: 400 })
  }

  // SANsのバリデーション（ホスト名またはIPアドレス）
  const sanList = Array.isArray(sans) ? sans : []
  const hostnameOrIpRegex = /^[a-zA-Z0-9._-]{1,253}$|^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
  for (const san of sanList) {
    if (typeof san !== 'string' || !hostnameOrIpRegex.test(san)) {
      return NextResponse.json({ error: `SANが不正です: ${String(san).slice(0, 50)}` }, { status: 400 })
    }
  }

  try {
    const client = getStepCAClient()
    const result = await client.generateCertificate(
      hostname,
      sanList,
      duration ?? '24h'
    )
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
