'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/certificates', label: '証明書管理' },
  { href: '/acme', label: 'ACME' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">step-ui</h1>
        <p className="text-xs text-gray-400">Smallstep CA 管理</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              pathname.startsWith(item.href)
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-gray-300 hover:text-white"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          ログアウト
        </Button>
      </div>
    </aside>
  )
}
