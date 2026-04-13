// このServer ComponentはNext.js App Routerのパターンに従い、
// APIルートを経由せず直接step-caクライアントを呼び出す。
// 認証は親レイアウト(app/(dashboard)/layout.tsx)が担保しているため、
// ここでのauth()チェックは不要。
// /api/certificates GETはクライアントサイドfetch用として提供。
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CertTable } from '@/components/certificates/cert-table'
import { getStepCAClient } from '@/lib/step-ca'
import type { CertificateInfo } from '@/lib/step-ca'

export default async function CertificatesPage() {
  let certificates: CertificateInfo[] = []
  let error = ''

  try {
    const client = getStepCAClient()
    certificates = client.listCertificates()
  } catch (e) {
    error = e instanceof Error ? e.message : '証明書の取得に失敗しました'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">証明書管理</h2>
        <Link href="/certificates/new">
          <Button>新規証明書を発行</Button>
        </Link>
      </div>

      <div className="flex gap-3 mb-6">
        <a href="/api/ca-certs?type=root" download="root_ca.crt">
          <Button variant="outline" size="sm">Root CA ダウンロード</Button>
        </a>
        <a href="/api/ca-certs?type=intermediate" download="intermediate_ca.crt">
          <Button variant="outline" size="sm">Intermediate CA ダウンロード</Button>
        </a>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          <p className="font-medium">エラー</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : (
        <CertTable certificates={certificates} />
      )}
    </div>
  )
}
