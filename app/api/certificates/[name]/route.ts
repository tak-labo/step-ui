import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStepCAClient } from '@/lib/step-ca'

interface Params {
  params: Promise<{ name: string }>
}

export async function GET(_request: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { name } = await params
  const serialNumber = decodeURIComponent(name)

  try {
    const client = getStepCAClient()
    const certificates = await client.listCertificates()
    const cert = certificates.find(c => c.serialNumber === serialNumber)

    if (!cert) return NextResponse.json({ error: '証明書が見つかりません' }, { status: 404 })

    return NextResponse.json({ certificate: cert })
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  // step-caでは証明書の物理削除はサポートされていません。
  // 証明書を無効化するには /revoke エンドポイントを使用してください。
  return NextResponse.json(
    { error: '証明書の削除はサポートされていません。失効(/revoke)を使用してください' },
    { status: 501 }
  )
}
