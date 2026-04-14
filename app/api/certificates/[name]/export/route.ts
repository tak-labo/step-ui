import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

interface Params {
  params: Promise<{ name: string }>
}

export async function POST(request: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { name } = await params
  const hostname = decodeURIComponent(name)

  let body: { certificate: string; privateKey: string; format: 'cert' | 'key' | 'pem' | 'pfx' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  // PEMフィールドの最大サイズチェック（16KB）
  const MAX_PEM_SIZE = 16 * 1024
  if (
    typeof body.certificate !== 'string' ||
    typeof body.privateKey !== 'string' ||
    body.certificate.length > MAX_PEM_SIZE ||
    body.privateKey.length > MAX_PEM_SIZE
  ) {
    return NextResponse.json({ error: 'PEMデータが不正または大きすぎます' }, { status: 400 })
  }

  if (body.format === 'cert' || body.format === 'key' || body.format === 'pem') {
    const content = body.format === 'cert'
      ? body.certificate
      : body.format === 'key'
        ? body.privateKey
        : `${body.certificate}\n${body.privateKey}`

    const extension = body.format === 'cert' ? 'crt' : body.format === 'key' ? 'key' : 'pem'

    return new Response(content, {
      headers: {
        'Content-Type': 'application/x-pem-file',
        'Content-Disposition': `attachment; filename="${hostname}.${extension}"`,
      },
    })
  }

  return NextResponse.json(
    { error: 'PFX形式は現在サポートされていません' },
    { status: 501 }
  )
}
