'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_CERT_DURATION } from '@/lib/cert-duration'

const DURATION_OPTIONS = [
  { value: DEFAULT_CERT_DURATION, label: '30日' },
  { value: '168h', label: '1週間' },
  { value: '720h', label: '1ヶ月' },
  { value: '2160h', label: '3ヶ月' },
  { value: '4380h', label: '6ヶ月' },
  { value: '8760h', label: '1年' },
  { value: '87600h', label: '10年' },
]

export function CertForm() {
  const [hostname, setHostname] = useState('')
  const [sansInput, setSansInput] = useState('')
  const [duration, setDuration] = useState(DEFAULT_CERT_DURATION)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const sans = sansInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, sans, duration }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }

      const data = await res.json() as { certificate: string; privateKey: string }
      downloadFile(`${hostname}.crt`, data.certificate)
      downloadFile(`${hostname}.key`, data.privateKey)

      router.push('/certificates')
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
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
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>証明書を発行</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="hostname">ホスト名 *</Label>
            <Input
              id="hostname"
              placeholder="example.com"
              value={hostname}
              onChange={e => setHostname(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="sans">SAN（コンマ区切り）</Label>
            <Input
              id="sans"
              placeholder="192.168.1.1, internal.example.com"
              value={sansInput}
              onChange={e => setSansInput(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              追加のIPアドレスやドメイン名を指定します（省略可）
            </p>
          </div>

          <div>
            <Label htmlFor="duration">有効期限</Label>
            <Select value={duration} onValueChange={v => { if (v) setDuration(v) }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? '発行中...' : '証明書を発行してダウンロード'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/certificates')}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
