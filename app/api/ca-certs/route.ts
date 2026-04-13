import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { readFileSync } from 'fs'

export async function GET(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  const paths: Record<string, { file: string; name: string }> = {
    root: { file: '/home/step/certs/root_ca.crt', name: 'root_ca.crt' },
    intermediate: { file: '/home/step/certs/intermediate_ca.crt', name: 'intermediate_ca.crt' },
  }

  const target = type && paths[type]
  if (!target) {
    return NextResponse.json({ error: 'type=root または type=intermediate を指定してください' }, { status: 400 })
  }

  try {
    const pem = readFileSync(target.file, 'utf-8')
    return new Response(pem, {
      headers: {
        'Content-Type': 'application/x-pem-file',
        'Content-Disposition': `attachment; filename="${target.name}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'CA証明書の読み取りに失敗しました' }, { status: 500 })
  }
}
