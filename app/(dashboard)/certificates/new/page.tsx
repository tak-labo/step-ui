import { CertForm } from '@/components/certificates/cert-form'

export default function NewCertificatePage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">新規証明書を発行</h2>
      <CertForm />
    </div>
  )
}
