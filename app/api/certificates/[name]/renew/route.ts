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
    const certificates = await client.listCertificates()
    const cert = certificates.find(c => c.serialNumber === serialNumber)

    if (!cert) return NextResponse.json({ error: '証明書が見つかりません' }, { status: 404 })

    // 元の証明書と同じ有効期間で更新する
    const originalDurationH = Math.round(
      (new Date(cert.notAfter).getTime() - new Date(cert.notBefore).getTime()) / 3600000
    )
    const duration = `${originalDurationH}h`

    const result = await client.generateCertificate(
      cert.commonName,
      cert.sans.filter(s => s !== cert.commonName),
      duration
    )

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
