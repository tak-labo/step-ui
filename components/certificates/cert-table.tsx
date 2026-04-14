'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CertificateInfo } from '@/lib/step-ca'

interface CertTableProps {
  certificates: CertificateInfo[]
}

function StatusBadge({ status }: { status: CertificateInfo['status'] }) {
  const variants = {
    active: 'default',
    expired: 'destructive',
    revoked: 'secondary',
  } as const

  const labels = {
    active: '有効',
    expired: '期限切れ',
    revoked: '失効',
  }

  return <Badge variant={variants[status]}>{labels[status]}</Badge>
}

function isExpiringSoon(notAfter: string): boolean {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  return new Date(notAfter).getTime() - Date.now() < thirtyDaysMs
}

export function CertTable({ certificates }: CertTableProps) {
  const [search, setSearch] = useState('')
  const [deletingSerial, setDeletingSerial] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const filtered = certificates.filter(cert =>
    cert.commonName.toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(serialNumber: string, commonName: string) {
    if (!window.confirm(`「${commonName}」を削除しますか？`)) return
    setDeletingSerial(serialNumber)
    setError('')
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(serialNumber)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }
      router.refresh()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setDeletingSerial('')
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}
      <Input
        placeholder="証明書を検索..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>コモンネーム</TableHead>
            <TableHead>有効期限</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead>シリアル番号</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500">
                証明書がありません
              </TableCell>
            </TableRow>
          ) : (
            filtered.map(cert => (
              <TableRow key={cert.serialNumber}>
                <TableCell>
                  <Link
                    href={`/certificates/${encodeURIComponent(cert.serialNumber)}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {cert.commonName}
                  </Link>
                  {cert.status === 'active' && isExpiringSoon(cert.notAfter) && (
                    <Badge variant="outline" className="ml-2 text-orange-600 border-orange-300">
                      まもなく期限切れ
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {new Date(cert.notAfter).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell>
                  <StatusBadge status={cert.status} />
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-500">
                  {cert.serialNumber.slice(0, 16)}...
                </TableCell>
                <TableCell className="text-right">
                  {cert.status === 'revoked' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(cert.serialNumber, cert.commonName)}
                      disabled={deletingSerial === cert.serialNumber}
                    >
                      {deletingSerial === cert.serialNumber ? '削除中...' : '削除'}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
