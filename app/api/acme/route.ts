import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStepCAClient } from '@/lib/step-ca'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  try {
    const client = getStepCAClient()
    const provisioners = await client.listProvisioners()
    const acme = provisioners.filter(p => p.type === 'ACME')
    return NextResponse.json({ provisioners: acme })
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  let body: { name: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  if (!body.name || !/^[a-zA-Z0-9-]{1,64}$/.test(body.name)) {
    return NextResponse.json({ error: '名前が不正です（英数字とハイフンのみ、64文字以内）' }, { status: 400 })
  }

  try {
    const client = getStepCAClient()
    await client.createAcmeProvisioner(body.name)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  let body: { name: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  if (!body.name) {
    return NextResponse.json({ error: 'nameは必須です' }, { status: 400 })
  }

  try {
    const client = getStepCAClient()
    await client.deleteProvisioner(body.name)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
