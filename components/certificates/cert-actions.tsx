'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CertificateInfo } from '@/lib/step-ca'

interface CertActionsProps {
  certificate: CertificateInfo
  certPem?: string
  keyPem?: string
}

export function CertActions({ certificate, certPem, keyPem }: CertActionsProps) {
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleRevoke() {
    setLoading('revoke')
    setError('')
    try {
      const res = await fetch(
        `/api/certificates/${encodeURIComponent(certificate.serialNumber)}/revoke`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }
      setRevokeOpen(false)
      router.push('/certificates')
      router.refresh()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  async function handleRenew() {
    setLoading('renew')
    setError('')
    try {
      const res = await fetch(
        `/api/certificates/${encodeURIComponent(certificate.serialNumber)}/renew`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }
      const data = await res.json() as { certificate: string; privateKey: string }
      downloadFile(`${certificate.commonName}.crt`, data.certificate)
      downloadFile(`${certificate.commonName}.key`, data.privateKey)
      router.refresh()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(null)
    }
  }

  function handleDownloadPem() {
    if (!certPem || !keyPem) {
      setError('証明書データが利用できません。再発行してください')
      return
    }
    downloadFile(`${certificate.commonName}.crt`, certPem)
    downloadFile(`${certificate.commonName}.key`, keyPem)
  }

  function downloadFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRenew}
          disabled={loading !== null || certificate.status !== 'active'}
        >
          {loading === 'renew' ? '更新中...' : '証明書を更新'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPem}
          disabled={certificate.status !== 'active'}
        >
          PEMダウンロード
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setRevokeOpen(true)}
          disabled={loading !== null || certificate.status !== 'active'}
        >
          証明書を失効
        </Button>
      </div>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>証明書を失効しますか？</DialogTitle>
            <DialogDescription>
              「{certificate.commonName}」を失効させます。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={loading === 'revoke'}
            >
              {loading === 'revoke' ? '処理中...' : '失効する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
