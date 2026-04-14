import AcmeClientPage from './acme-client-page'

export default function AcmePage() {
  const publicDomain = process.env.PUBLIC_DOMAIN?.trim()
  const publicBaseUrl = process.env.PUBLIC_URL
    || (publicDomain ? `https://${publicDomain}` : '')
    || process.env.NEXT_PUBLIC_CA_URL
    || 'https://step-ca:9000'

  return <AcmeClientPage publicBaseUrl={publicBaseUrl} />
}
