import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CertActions } from '@/components/certificates/cert-actions'
import { getStepCAClient } from '@/lib/step-ca'
import type { CertificateInfo } from '@/lib/step-ca'

interface Props {
  params: Promise<{ name: string }>
}

export default async function CertDetailPage({ params }: Props) {
  const { name } = await params
  const serialNumber = decodeURIComponent(name)

  let cert: CertificateInfo | undefined
  try {
    const client = getStepCAClient()
    const certificates = await client.listCertificates()
    cert = certificates.find(c => c.serialNumber === serialNumber)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラー'
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
        {message}
      </div>
    )
  }

  if (!cert) notFound()

  const statusColors = {
    active: 'default',
    expired: 'destructive',
    revoked: 'secondary',
  } as const

  const statusLabels = {
    active: '有効',
    expired: '期限切れ',
    revoked: '失効',
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/certificates">
          <Button variant="ghost" size="sm">← 一覧に戻る</Button>
        </Link>
        <h2 className="text-2xl font-bold">{cert.commonName}</h2>
        <Badge variant={statusColors[cert.status]}>{statusLabels[cert.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>証明書情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <span className="font-medium text-gray-600">コモンネーム</span>
            <span className="col-span-2 font-mono">{cert.commonName}</span>

            <span className="font-medium text-gray-600">シリアル番号</span>
            <span className="col-span-2 font-mono text-xs break-all">{cert.serialNumber}</span>

            <span className="font-medium text-gray-600">有効開始</span>
            <span className="col-span-2">{new Date(cert.notBefore).toLocaleString('ja-JP')}</span>

            <span className="font-medium text-gray-600">有効期限</span>
            <span className="col-span-2">{new Date(cert.notAfter).toLocaleString('ja-JP')}</span>

            <span className="font-medium text-gray-600">SAN</span>
            <span className="col-span-2">
              {cert.sans.map(san => (
                <Badge key={san} variant="outline" className="mr-1 mb-1">{san}</Badge>
              ))}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>操作</CardTitle>
        </CardHeader>
        <CardContent>
          <CertActions
            certificate={cert}
            certPem={cert.certificatePem}
            keyPem={cert.privateKeyPem}
          />
        </CardContent>
      </Card>
    </div>
  )
}
