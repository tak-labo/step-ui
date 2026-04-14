'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Provisioner {
  name: string
  type: string
  details: unknown
}

export default function AcmePage() {
  const [provisioners, setProvisioners] = useState<Provisioner[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [error, setError] = useState('')

  const caUrl = process.env.NEXT_PUBLIC_CA_URL ?? 'https://step-ca:9000'

  async function loadProvisioners() {
    setError('')
    try {
      const res = await fetch('/api/acme')
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }
      const data = await res.json() as { provisioners: Provisioner[] }
      setProvisioners(data.provisioners)
    } catch {
      setError('プロビジョナーの取得に失敗しました')
    }
  }

  useEffect(() => {
    loadProvisioners()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/acme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }
      setNewName('')
      await loadProvisioners()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(`「${name}」を削除しますか？`)) return
    setDeletingName(name)
    setError('')
    try {
      const res = await fetch('/api/acme', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }
      await loadProvisioners()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setDeletingName(null)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">ACMEプロビジョナー管理</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {provisioners.length === 0 ? (
          <p className="text-gray-500 text-sm">ACMEプロビジョナーがありません</p>
        ) : (
          provisioners.map(prov => (
            <Card key={prov.name}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{prov.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge>ACME</Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(prov.name)}
                      disabled={deletingName !== null}
                    >
                      {deletingName === prov.name ? '削除中...' : '削除'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-500 font-medium mb-1">
                  certbot等のACMEクライアント用エンドポイント:
                </p>
                <code className="text-xs bg-gray-100 p-2 rounded block break-all">
                  {caUrl}/acme/{prov.name}/directory
                </code>
                <p className="text-xs text-gray-400 mt-2">
                  例: certbot --server {caUrl}/acme/{prov.name}/directory ...
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">新規ACMEプロビジョナーを追加</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="acme-name" className="sr-only">プロビジョナー名</Label>
              <Input
                id="acme-name"
                placeholder="acme（英数字とハイフンのみ）"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                pattern="[a-zA-Z0-9-]+"
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? '追加中...' : '追加'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
